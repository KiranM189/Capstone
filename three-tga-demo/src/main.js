import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

const QuaternionVisualizer = () => {
  const mountRef = useRef(null);

  useEffect(() => {
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0C1A3D);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 2;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    // OrbitControls - manual implementation since we can't import from examples
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    const rotationSpeed = 0.005;
    const cameraDistance = 2;
    let theta = 0;
    let phi = Math.PI / 2;

    renderer.domElement.addEventListener('mousedown', (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    renderer.domElement.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;
        
        theta -= deltaX * rotationSpeed;
        phi += deltaY * rotationSpeed;
        phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
        
        camera.position.x = cameraDistance * Math.sin(phi) * Math.cos(theta);
        camera.position.y = cameraDistance * Math.cos(phi);
        camera.position.z = cameraDistance * Math.sin(phi) * Math.sin(theta);
        camera.lookAt(0, 0, 0);
        
        previousMousePosition = { x: e.clientX, y: e.clientY };
      }
    });

    renderer.domElement.addEventListener('mouseup', () => {
      isDragging = false;
    });

    renderer.domElement.addEventListener('mouseleave', () => {
      isDragging = false;
    });

    // Trajectory line setup with thick lines
    const trajectoryPoints = [];
    const trajectoryGeometry = new THREE.BufferGeometry();
    const trajectoryMaterial = new THREE.LineBasicMaterial({ 
      color: 0x00ff00,
      linewidth: 5 // Note: this won't work on most platforms, but we'll make it work with tubes
    });
    let trajectoryLine = null;
    let trajectoryTubes = []; // Store tube segments

    // Function to create thick line using tubes
    function createThickLine(points, color = 0x00ff00, radius = 0.01) {
      const tubes = [];
      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        
        const tubeGeometry = new THREE.CylinderGeometry(radius, radius, length, 8);
        const tubeMaterial = new THREE.MeshBasicMaterial({ color });
        const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
        
        // Position and orient the tube
        tube.position.copy(start).add(direction.multiplyScalar(0.5));
        tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        
        scene.add(tube);
        tubes.push(tube);
      }
      return tubes;
    }

    // DIRECT quaternion to point - NO decomposition
    function quaternionToPoint(q, boneAxis) {
      const point = boneAxis.clone().applyQuaternion(q);
      return point.normalize();
    }

    function visualizeQuaternion(q, color = 0xff0000, boneAxis = new THREE.Vector3(0, 1, 0)) {
      const point = quaternionToPoint(q, boneAxis);
      
      // Create marker at position
      const markerGeometry = new THREE.SphereGeometry(0.03, 16, 16);
      const markerMaterial = new THREE.MeshBasicMaterial({ color });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(point);
      scene.add(marker);

      console.log('Plotted at:', point.x.toFixed(3), point.y.toFixed(3), point.z.toFixed(3));

      return { marker, point };
    }

    function addQuaternionToTrajectory(q, boneAxis = new THREE.Vector3(0, 1, 0)) {
      const point = quaternionToPoint(q, boneAxis);
      
      // If at least one previous point exists, draw an arc along the sphere surface
      if (trajectoryPoints.length >= 3) {
        const lastIndex = trajectoryPoints.length - 3;
        const prevPoint = new THREE.Vector3(
          trajectoryPoints[lastIndex],
          trajectoryPoints[lastIndex + 1],
          trajectoryPoints[lastIndex + 2]
        );

        const start = prevPoint.clone().normalize();
        const end = point.clone().normalize();

        // Interpolate along great circle using spherical linear interpolation
        const steps = 32;
        const axis = new THREE.Vector3().crossVectors(start, end).normalize();
        const angle = start.angleTo(end);
        
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const qStep = new THREE.Quaternion().setFromAxisAngle(axis, angle * t);
          const pOnSphere = start.clone().applyQuaternion(qStep).normalize();
          trajectoryPoints.push(pOnSphere.x, pOnSphere.y, pOnSphere.z);
        }
      } else {
        // First point
        trajectoryPoints.push(point.x, point.y, point.z);
      }

      // Clear old tubes
      trajectoryTubes.forEach(tube => scene.remove(tube));
      trajectoryTubes = [];

      // Create new thick line from all points
      const points3D = [];
      for (let i = 0; i < trajectoryPoints.length; i += 3) {
        points3D.push(new THREE.Vector3(
          trajectoryPoints[i],
          trajectoryPoints[i + 1],
          trajectoryPoints[i + 2]
        ));
      }
      
      if (points3D.length > 1) {
        trajectoryTubes = createThickLine(points3D, 0x00ff00, 0.008);
      }

      const pointGeometry = new THREE.SphereGeometry(0.02, 8, 8);
      const pointMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const pointMesh = new THREE.Mesh(pointGeometry, pointMaterial);
      pointMesh.position.copy(point);
      scene.add(pointMesh);

      console.log('Added to trajectory (surface arc):', point.x.toFixed(3), point.y.toFixed(3), point.z.toFixed(3));
    }

    function getBoneAxis() {
      const boneSelect = document.getElementById('boneSelect');
      if (!boneSelect) return new THREE.Vector3(0, 1, 0);
      
      const boneType = boneSelect.value;
      
      switch(boneType) {
        case 'rightForearm':
        case 'rightUpperArm':
          return new THREE.Vector3(-1, 0, 0);
          
        case 'leftForearm':
        case 'leftUpperArm':
          return new THREE.Vector3(1, 0, 0);
          
        case 'rightUpperLeg':
        case 'rightLowerLeg':
          return new THREE.Vector3(0, -1, 0);
          
        default:
          return new THREE.Vector3(0, 1, 0);
      }
    }

    // Create main sphere
    const geometry = new THREE.SphereGeometry(1, 64, 64);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x4488ff,
      wireframe: true,
      transparent: true,
      opacity: 0.3
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.name = 'mainSphere';
    sphere.rotation.y = Math.PI / 2;
    scene.add(sphere);

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // Event listeners
    const plotBtn = document.getElementById('plotBtn');
    const addTrajectoryBtn = document.getElementById('addTrajectoryBtn');
    const clearBtn = document.getElementById('clearBtn');

    const handlePlot = () => {
      const w = parseFloat(document.getElementById('qw').value);
      const x = parseFloat(document.getElementById('qx').value);
      const y = parseFloat(document.getElementById('qy').value);
      const z = parseFloat(document.getElementById('qz').value);
      
      const q = new THREE.Quaternion(x, y, z, w).normalize();
      const boneAxis = getBoneAxis();
      
      console.log('Input (w,x,y,z):', w, x, y, z);
      console.log('Quaternion:', q);
      console.log('Bone Axis:', boneAxis);
      
      visualizeQuaternion(q, 0xff0000, boneAxis);
    };

    const handleAddTrajectory = () => {
      const w = parseFloat(document.getElementById('qw').value);
      const x = parseFloat(document.getElementById('qx').value);
      const y = parseFloat(document.getElementById('qy').value);
      const z = parseFloat(document.getElementById('qz').value);
      
      const q = new THREE.Quaternion(x, y, z, w).normalize();
      const boneAxis = getBoneAxis();
      addQuaternionToTrajectory(q, boneAxis);
    };

    const handleClear = () => {
      // Remove all markers and tubes BUT NOT the main sphere
      scene.children.filter(child => 
        child.name !== 'mainSphere' &&
        (
          (child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry && child.geometry.parameters.radius < 1) ||
          (child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry)
        )
      ).forEach(obj => scene.remove(obj));
      
      // Clear trajectory
      trajectoryPoints.length = 0;
      trajectoryTubes = [];
    };

    if (plotBtn) plotBtn.addEventListener('click', handlePlot);
    if (addTrajectoryBtn) addTrajectoryBtn.addEventListener('click', handleAddTrajectory);
    if (clearBtn) clearBtn.addEventListener('click', handleClear);

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (plotBtn) plotBtn.removeEventListener('click', handlePlot);
      if (addTrajectoryBtn) addTrajectoryBtn.removeEventListener('click', handleAddTrajectory);
      if (clearBtn) clearBtn.removeEventListener('click', handleClear);
      mountRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <>
      <div ref={mountRef} />
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'rgba(0,0,0,0.8)',
        padding: '15px',
        color: 'white',
        fontFamily: 'monospace',
        borderRadius: '5px',
        maxWidth: '300px'
      }}>
        <h3 style={{ margin: '0 0 10px 0' }}>Direct Quaternion Plot</h3>
        
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Bone Segment:</label>
          <select id="boneSelect" style={{ width: '100%', padding: '3px', background: '#333', color: 'white', border: '1px solid #666' }}>
            <option value="rightForearm">Right Forearm (T-pose)</option>
            <option value="leftForearm">Left Forearm (T-pose)</option>
            <option value="rightUpperArm">Right Upper Arm</option>
            <option value="leftUpperArm">Left Upper Arm</option>
            <option value="rightUpperLeg">Right Upper Leg</option>
            <option value="rightLowerLeg">Right Lower Leg</option>
          </select>
        </div>
        
        <div style={{ margin: '5px 0' }}>
          <label style={{ display: 'inline-block', width: '20px' }}>w:</label>
          <input type="number" id="qw" defaultValue="1" step="0.01" style={{ width: '80px', background: '#333', color: 'white', border: '1px solid #666', padding: '3px' }} />
        </div>
        <div style={{ margin: '5px 0' }}>
          <label style={{ display: 'inline-block', width: '20px' }}>x:</label>
          <input type="number" id="qx" defaultValue="0" step="0.01" style={{ width: '80px', background: '#333', color: 'white', border: '1px solid #666', padding: '3px' }} />
        </div>
        <div style={{ margin: '5px 0' }}>
          <label style={{ display: 'inline-block', width: '20px' }}>y:</label>
          <input type="number" id="qy" defaultValue="0" step="0.01" style={{ width: '80px', background: '#333', color: 'white', border: '1px solid #666', padding: '3px' }} />
        </div>
        <div style={{ margin: '5px 0' }}>
          <label style={{ display: 'inline-block', width: '20px' }}>z:</label>
          <input type="number" id="qz" defaultValue="0" step="0.01" style={{ width: '80px', background: '#333', color: 'white', border: '1px solid #666', padding: '3px' }} />
        </div>
        
        <button id="plotBtn" style={{ width: '100%', padding: '8px', marginTop: '5px', background: '#444', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}>Plot Point</button>
        <button id="addTrajectoryBtn" style={{ width: '100%', padding: '8px', marginTop: '5px', background: '#444', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}>Add to Trajectory</button>
        <button id="clearBtn" style={{ width: '100%', padding: '8px', marginTop: '5px', background: '#444', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold' }}>Clear All</button>
        
        <div style={{ marginTop: '10px', fontSize: '11px', color: '#aaa', lineHeight: '1.4' }}>
          <div><b>Direct Plotting:</b></div>
          <div>• Point = bone_axis rotated by quaternion</div>
          <div>• Right Forearm axis: -X (due to sphere rotation)</div>
          <div>• Check console for coordinates</div>
          <div style={{ marginTop: '5px' }}><b>Test:</b> w=1,x=0,y=0,z=0</div>
        </div>
      </div>
    </>
  );
};

export default QuaternionVisualizer;