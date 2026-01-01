import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';

// =============================
//  Scene, Camera & Renderer
// =============================
const scene = new THREE.Scene();

new RGBELoader().load('/textures/qwantani_moon_noon_puresky_4k.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    scene.environment = texture;
});

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
const container = document.getElementById("Container");
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
container.appendChild(renderer.domElement);

camera.aspect = container.clientWidth / container.clientHeight;
camera.updateProjectionMatrix();

// =============================
// 💡 Lighting
// =============================
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);

// =============================
// 🦴 Model Loading & Bone Map
// =============================
const boneMap = {};
const labelToBoneName = {
    HIPS: "mixamorigHips",           
    SP:   "mixamorigSpine",
    SP2:  "mixamorigSpine2",         
    H:    "mixamorigHead",
    RA:   "mixamorigRightArm",
    RFA:  "mixamorigRightForeArm",
    LA:   "mixamorigLeftArm",
    LFA:  "mixamorigLeftForeArm",
    RUL:  "mixamorigRightUpLeg",
    RL:   "mixamorigRightLeg",
    LUL:  "mixamorigLeftUpLeg",
    LL:   "mixamorigLeftLeg"
};

let model;
new GLTFLoader().load('/ybot.gltf', (gltf) => {
    model = gltf.scene;

    model.traverse((child) => {
        if (child.isBone) {
            child.userData.bindQuat = child.quaternion.clone();
            child.userData.bindInv = child.userData.bindQuat.clone().invert();

            for (const [label, boneName] of Object.entries(labelToBoneName)) {
                if (child.name === boneName) {
                    boneMap[label] = child;
                    console.log(`✅ Mapped label ${label} to bone ${boneName}`);
                }
            }
        }
    });

    model.scale.set(2, 2, 2);
    scene.add(model);
    console.log("✅ Model added to scene");
});

// =============================
//  WebSocket Management
// =============================
const sensorSockets = {
    RA:   "10.46.97.85",
    RFA:  "10.46.97.225",
    LA:   "10.46.97.104",
    LFA:  "10.46.97.203",
    RUL:  "10.226.57.85",
    RL:   "10.226.57.21",
    LUL:  "10.226.57.195",
    LL:   "10.226.57.104"
};

const sockets = {};
const connected = [];
let count = 0;

function connectSensor(label, ip) {
    const ws = new WebSocket(`ws://${ip}:81`);
    ws.onopen = () => {
        if (!connected.includes(label)) connected.push(label);
        sockets[label] = ws;
        console.log(`✅ Connected to sensor: ${label}`);
        count += 1;
    };

    ws.onerror = (err) => console.error(`❌ WebSocket error (${label}):`, err);
    ws.onmessage = (event) => handleSensorMessage(label, event);
}

// =============================
// 🧭 Calibration Logic
// =============================
const calibrationData = {};
const qRef = {};
let isCalibrating = false, calibrated = false;
const CALIBRATION_DURATION = 30000;
var calibrationStartTime = 0;

const sensorGlobal = {};

function normalizeQuat(q) {
    const len = Math.hypot(q.w, q.x, q.y, q.z);
    return len > 0 ? { w: q.w / len, x: q.x / len, y: q.y / len, z: q.z / len } : q;
}

function startCalibration() {
    isCalibrating = true;
    calibrationStartTime = performance.now();
    for (const label of connected) calibrationData[label] = [];

    console.log("🟡 Collecting T-Pose samples for 30 seconds...");
    let countdown = 30;

    const interval = setInterval(() => {
        console.log(`⏳ ${countdown--}s remaining...`);
    }, 1000);

    setTimeout(() => {
        clearInterval(interval);
        finishCalibration();
    }, CALIBRATION_DURATION);
}

function finishCalibration() {
    console.log("🟢 T-Pose calibration done!");
    for (const label of connected) {
        const samples = calibrationData[label];
        if (samples?.length > 0) {
            let sum = { w: 0, x: 0, y: 0, z: 0 };
            for (const q of samples) {
                sum.w += q.w;
                sum.x += q.x;
                sum.y += q.y;
                sum.z += q.z;
            }
            qRef[label] = normalizeQuat({
                w: sum.w / samples.length,
                x: sum.x / samples.length,
                y: sum.y / samples.length,
                z: sum.z / samples.length
            });
        }
    }
    isCalibrating = false;
    calibrated = true;
    alert("✅ T-Pose calibration completed!");
}

function applyCalibration(label, qNow) {
    const ref = qRef[label];
    if (!ref) return qNow;

    const conj = new THREE.Quaternion(-ref.x, -ref.y, -ref.z, ref.w);
    const qRelative = new THREE.Quaternion().copy(conj).multiply(qNow);
    qRelative.normalize();
    return qRelative;
}

// =============================
// CSV LOGGING ADDED
// =============================
let csvRows = ["label,w,x,y,z,timestamp"];

function downloadCSV() {
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "calibrated_quaternions.csv";
    a.click();
    URL.revokeObjectURL(url);
}

// =============================
const parentLabel = {
    HIPS: null,
    SP: "HIPS",
    SP2: "SP",
    H: "SP2",
    RA: "SP2",
    RFA: "RA",
    LA: "SP2",
    LFA: "LA",
    RUL: "HIPS",
    RL: "RUL",
    LUL: "HIPS",
    LL: "LUL"
};

const boneOffset = {};
for (const label of Object.keys(labelToBoneName)) {
    boneOffset[label] = new THREE.Quaternion();
}

// =============================
function applySensorToBones() {
    const order = [
        "HIPS", "SP", "SP2", "H",
        "RA", "RFA",
        "LA", "LFA",
        "RUL", "RL",
        "LUL", "LL"
    ];

    for (const label of order) {
        const bone = boneMap[label];
        if (!bone) continue;

        const sensorQ = sensorGlobal[label];
        if (!sensorQ) continue;

        sensorQ.normalize();

        const parent = parentLabel[label];
        let localSensorQuat;

        if (parent && sensorGlobal[parent]) {
            const invParent = sensorGlobal[parent].clone().invert();
            localSensorQuat = invParent.multiply(sensorQ);
        } else {
            localSensorQuat = sensorQ.clone();
        }

        let qFinal;

        if (label === "HIPS") {
            const bindQuat = bone.userData.bindQuat.clone();
            const offset = boneOffset[label];

            qFinal = new THREE.Quaternion()
                .copy(bindQuat)
                .multiply(localSensorQuat)
                .multiply(offset);
        } else {
            const bindInv = bone.userData.bindInv.clone();
            const offset = boneOffset[label];

            qFinal = new THREE.Quaternion()
                .copy(bindInv)
                .multiply(localSensorQuat)
                .multiply(offset);
        }

        qFinal.normalize();
        bone.quaternion.copy(qFinal);
    }
}

// =============================
//  Message Handling
// =============================
function handleSensorMessage(label, event) {
    try {
        const data = JSON.parse(event.data);
        if (!Array.isArray(data.quaternion) || data.quaternion.length !== 4) return;

        const payloadLabel = data.label || label;

        const [w, x, y, z] = data.quaternion;
        const q = new THREE.Quaternion(x, y, z, w);

        if (isCalibrating) {
            if (!calibrationData[payloadLabel]) calibrationData[payloadLabel] = [];
            calibrationData[payloadLabel].push({ w, x, y, z });
            return;
        }

        if (calibrated) {
            const calibratedQ = applyCalibration(payloadLabel, q);

            // =============================
            // CSV LOGGING HERE
            // =============================
            csvRows.push(`${payloadLabel},${calibratedQ.w},${calibratedQ.x},${calibratedQ.y},${calibratedQ.z},${Date.now()}`);

            sensorGlobal[payloadLabel] = calibratedQ.clone();
            applySensorToBones();
        }

    } catch (err) {
        console.error(`❌ Failed to parse message for ${label}:`, err);
    }
}

// =============================
//  Button Event Handlers
// =============================
const btn1 = document.getElementById("btn1");
const btn2 = document.getElementById("btn2");
const btn3 = document.getElementById("btn3");

btn1.onclick = () => {
    for (const [label, ip] of Object.entries(sensorSockets)) connectSensor(label, ip);
};

btn2.onclick = () => {
    for (const label of connected) {
        const ws = sockets[label];
        if (ws?.readyState === WebSocket.OPEN) ws.send("start");
    }
};

btn3.onclick = () => {
    for (const label of connected) {
        const ws = sockets[label];
        if (ws?.readyState === WebSocket.OPEN) ws.send("calibrate");
    }
    startCalibration();
};

// NEW: CSV Download Button
document.getElementById("btnDownload").onclick = downloadCSV;

// =============================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
});
