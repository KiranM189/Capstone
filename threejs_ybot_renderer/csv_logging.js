import WebSocket from "ws";
import fs from "fs";
import readline from "readline";
import * as THREE from "three";

// -----------------------------------------
//        SETUP READLINE (ENTER KEY)
// -----------------------------------------
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// -----------------------------------------
//        CALIBRATION VARIABLES
// -----------------------------------------
let isCalibrating = false;
let calibrated = false;
let calibrationStart = 0;

const CALIBRATION_DURATION = 30000; // 30 seconds

const calibrationData = {};  // { label: [ {w,x,y,z} ] }
const qRef = {};             // { label: {w,x,y,z} }

// -----------------------------------------
//       QUATERNION HELPERS
// -----------------------------------------
function normalizeQuat(q) {
    const len = Math.hypot(q.w, q.x, q.y, q.z);
    return len === 0 ? q : {
        w: q.w / len,
        x: q.x / len,
        y: q.y / len,
        z: q.z / len
    };
}

function applyCalibration(label, qNow) {
    const ref = qRef[label];
    if (!ref) return qNow;

    const conj = new THREE.Quaternion(-ref.x, -ref.y, -ref.z, ref.w);
    const qCurrent = new THREE.Quaternion(qNow.x, qNow.y, qNow.z, qNow.w);

    const result = new THREE.Quaternion().copy(conj).multiply(qCurrent);
    result.normalize();

    return {
        w: result.w,
        x: result.x,
        y: result.y,
        z: result.z
    };
}

// -----------------------------------------
//         START CALIBRATION
// -----------------------------------------
function startCalibration() {
    if (isCalibrating) return;

    console.log("\n🟡 Starting 30-second T-Pose calibration...");
    isCalibrating = true;
    calibrationStart = Date.now();

    // clear any previous data
    for (const key in calibrationData) delete calibrationData[key];

    let sec = 30;
    const timer = setInterval(() => {
        console.log(`${sec--}s remaining...`);
        if (sec < 0) clearInterval(timer);
    }, 1000);

    setTimeout(() => finishCalibration(), CALIBRATION_DURATION);
}

// -----------------------------------------
//        FINISH CALIBRATION
// -----------------------------------------
function finishCalibration() {
    console.log("\n🟢 Calibration complete!");

    for (const label in calibrationData) {
        const samples = calibrationData[label];
        if (!samples || samples.length === 0) continue;

        let sum = { w: 0, x: 0, y: 0, z: 0 };

        for (const q of samples) {
            sum.w += q.w;
            sum.x += q.x;
            sum.y += q.y;
            sum.z += q.z;
        }

        const avg = {
            w: sum.w / samples.length,
            x: sum.x / samples.length,
            y: sum.y / samples.length,
            z: sum.z / samples.length
        };

        qRef[label] = normalizeQuat(avg);
        console.log(`Reference for ${label}:`, qRef[label]);
    }

    isCalibrating = false;
    calibrated = true;

    console.log("🎉 T-Pose calibration applied. Logging CALIBRATED data now.");
}

// -----------------------------------------
//          CREATE CSV FILE
// -----------------------------------------
const file = fs.createWriteStream("./data.csv", { flags: "w" });
file.write("count,label,w,x,y,z\n");

// -----------------------------------------
//          CONNECT TO ESP32
// -----------------------------------------
const ESP_IP = "ws://10.226.57.225:81";

console.log("Connecting to ESP32 at", ESP_IP);
const ws = new WebSocket(ESP_IP);

ws.on("open", () => {
    console.log("Connected to ESP32.");
    ws.send("start");
    console.log("Press ENTER to start calibration...");
});

// -----------------------------------------
//      ENTER = START CALIBRATION
// -----------------------------------------
rl.on("line", () => {
    startCalibration();
});

// -----------------------------------------
//    HANDLE ESP32 MESSAGES SAFELY
// -----------------------------------------
ws.on("message", (msg) => {
    let data;

    try {
        data = JSON.parse(msg.toString());
    } catch (e) {
        console.log("⚠ Invalid JSON:", msg.toString());
        return;
    }

    // Ignore non-quaternion messages
    if (!data.quaternion || !Array.isArray(data.quaternion) || data.quaternion.length !== 4) {
        console.log("ℹ Control message:", data);
        return;
    }

    const label = data.label;
    const count = data.count;

    const q = {
        w: data.quaternion[0],
        x: data.quaternion[1],
        y: data.quaternion[2],
        z: data.quaternion[3]
    };

    // DURING calibration: collect samples
    if (isCalibrating) {
        if (!calibrationData[label]) calibrationData[label] = [];
        calibrationData[label].push(q);
        return;
    }

    // AFTER calibration: apply T-pose correction
    let finalQuat = calibrated ? applyCalibration(label, q) : q;

    // Write result to CSV
    file.write(`${count},${label},${finalQuat.w},${finalQuat.x},${finalQuat.y},${finalQuat.z}\n`);
});

// -----------------------------------------
//         CLOSE HANDLERS
// -----------------------------------------
ws.on("close", () => {
    console.log("WebSocket closed.");
    file.end();
});

ws.on("error", (err) => console.error("WebSocket Error:", err));
