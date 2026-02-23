# 🦾 Real-Time Motion Capture Suit  
**ESP32-C3 + MPU6050 + WebSockets + Three.js**

---

## 📌 Overview

This project is a **low-cost, real-time Motion Capture (MoCap) suit** built using multiple **ESP32-C3** microcontrollers and **MPU6050 IMU sensors**.

Each sensor streams quaternion orientation data over WiFi using WebSockets to a browser-based **Three.js** application that animates a GLTF human skeleton in real time.

---

## ✨ Features

- 📡 Real-time quaternion streaming (~30ms interval)
- 🧭 Still (bias) calibration
- 🟡 T-Pose calibration
- 🦴 Hierarchical bone mapping
- 📊 CSV logging of calibrated quaternion data
- 🌍 Live 3D browser visualization
- 🔄 Parent-relative joint rotation computation
- ⚡ Lightweight & low-cost hardware

---

# 🏗️ System Architecture

```
MPU6050  →  ESP32-C3  →  WebSocket (Port 81)  →  Three.js Client  →  GLTF Skeleton
(IMU)       (WiFi)         (Quaternion JSON)        (Calibration)        (Animation)
```

Each limb module consists of:

- 1 × ESP32-C3
- 1 × MPU6050
- Powered via Li-ion
- Streams data every ~30ms (~33Hz)

---

# 🔌 Hardware Setup

## 📍 I2C Wiring (ESP32-C3)

| MPU6050 | ESP32-C3 |
|----------|----------|
| VCC      | 3.3V     |
| GND      | GND      |
| SDA      | GPIO 8   |
| SCL      | GPIO 9   |

```cpp
Wire.begin(8, 9);
```

---

# 🧠 Firmware (ESP32)

## 📡 WebSocket Server

- Runs on **port 81**
- Broadcasts quaternion data as JSON

### Example Payload

```json
{
  "count": 123,
  "label": "RA",
  "quaternion": [0.9981, 0.0123, -0.0501, 0.0304]
}
```

---

## 🧭 Calibration Workflow

### STEP 1 — Still Calibration

Triggered by:

```
start
```

Process:
- Sensor placed flat and stationary
- Accelerometer and gyroscope biases calibrated

```cpp
mpu68.CalibrateAccel(6);
mpu68.CalibrateGyro(6);
```

Confirmation sent:
```json
{ "msg": "Still" }
```

---

### STEP 2 — T-Pose Calibration

Triggered after still calibration.

Process:
- User stands in T-Pose
- System collects quaternion samples for 30 seconds
- Computes average quaternion per sensor
- Stores reference quaternion (`qRef`)

All future motion is calculated relative to this pose.

---

# 🌍 Frontend (Three.js)

## 🎮 Scene Setup

- Perspective Camera
- HDR Environment Lighting
- Directional Light
- OrbitControls
- GLTF humanoid model (`ybot.gltf`)

---

## 🦴 Bone Mapping

```javascript
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
```

---

## 🧮 Rotation Processing Pipeline

1. Receive quaternion from sensor
2. Normalize quaternion
3. Apply calibration offset:
   ```
   q_relative = inverse(q_reference) × q_current
   ```
4. Convert to parent-relative rotation
5. Apply bind-pose correction
6. Update bone quaternion
7. Render updated frame
---

# 🎮 Controls

| Button      | Action |
|-------------|--------|
| Connect     | Connect to all sensors |
| Start       | Begin still calibration |
| Calibrate   | Begin T-Pose calibration |
| Download    | Export calibrated data as CSV |

---

# 🛠️ Installation

## 🔹 Firmware Setup

1. Install:
   - ESP32 Board Package
   - MPU6050 (MotionApps 6.12)
   - WebSockets Library

2. Add WiFi credentials:

```cpp
const char* ssid = "YOUR_SSID";
const char* password = "YOUR_PASSWORD";
```

3. Upload firmware to each ESP32 module  
4. Assign correct `label` per sensor

---

## 🔹 Frontend Setup

1. Install dependencies:

```bash
npm install three
```

2. Run development server:

```bash
npx vite
```

3. Open browser and access local server

---

# 📈 Performance

- Streaming Rate: ~33Hz
- Transport: WebSockets
- Rotation Math: Quaternion-based
- No gimbal lock
- Hierarchical skeletal animation
- Real-time rendering in browser

---

# 🚀 Future Improvements

- Magnetometer integration (MPU9250)
- Kalman filtering for improved fusion
- Drift correction algorithm
- Wireless battery module
- WebRTC streaming
- Multi-user motion sync
- Sensor auto-discovery
- Cloud data storage
