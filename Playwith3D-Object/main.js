/**
 * Tony Stark HUD & Cinematic Interaction Mode
 * Developed with Three.js + MediaPipe Hands
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';

let scene, camera, renderer, particleSystem, composer;
let hudGroup, palmRing;
const particleCount = 15000;
let nextShape = 'sphere';

const shapes = {
    sphere: new Float32Array(particleCount * 3),
    cube: new Float32Array(particleCount * 3),
    torus: new Float32Array(particleCount * 3),
    cylinder: new Float32Array(particleCount * 3),
    icosahedron: new Float32Array(particleCount * 3)
};

const velocities = new Float32Array(particleCount * 3);
const videoElement = document.getElementById('webcam');
const statusOverlay = document.getElementById('status-overlay');
const gestureIndicator = document.getElementById('gesture-indicator');

let handsTracker, cameraMP;
let handPosition = new THREE.Vector3(0, 0, 0);
let targetHandPosition = new THREE.Vector3(0, 0, 0);
let lastHandPosition = new THREE.Vector3(0, 0, 0);
let handVelocity = new THREE.Vector3(0, 0, 0);

// MediaPipe Latest API Globals
let handLandmarker;
let lastVideoTime = -1;
let trackerReady = false;

// Wait for the ESM module <script type="module"> to finish loading
function waitForMediaPipe(timeout = 15000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        (function check() {
            if (window.FilesetResolver && window.HandLandmarker) return resolve();
            if (Date.now() - start > timeout) return reject(new Error('MediaPipe library load timeout'));
            setTimeout(check, 100);
        })();
    });
}

let isHandPresent = false;
let currentGesture = 'none';
let isGrabbing = false;
let colorMode = new THREE.Color(0x00f2fe); // Stark Blue

function initScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 10;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    // UnrealBloomPass Implementation
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.1;
    bloomPass.strength = 1.4;
    bloomPass.radius = 1.0;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    initHUD();
    generateShapes();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(shapes.sphere), 3));

    const material = new THREE.PointsMaterial({
        color: 0x00f2fe,
        size: 0.045,
        transparent: true,
        blending: THREE.AdditiveBlending,
        opacity: 0.7,
        depthWrite: false
    });

    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);

    initKeyboardControls();
    window.addEventListener('resize', onWindowResize, false);
}

function initHUD() {
    hudGroup = new THREE.Group();
    scene.add(hudGroup);

    // Stark Palm Ring
    const ringGeo = new THREE.TorusGeometry(0.8, 0.02, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.5 });
    palmRing = new THREE.Mesh(ringGeo, ringMat);
    hudGroup.add(palmRing);

    // Scanning lines around hand
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.2 });
    for (let i = 0; i < 4; i++) {
        const circle = new THREE.BufferGeometry().setFromPoints(
            new THREE.Path().absarc(0, 0, 1.2 + i * 0.2, 0, Math.PI * 2).getPoints(50)
        );
        const circleLine = new THREE.Line(circle, lineMat);
        hudGroup.add(circleLine);
    }
}

function generateShapes() {
    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const r = 5;
        const phi = Math.acos(-1 + (2 * i) / particleCount);
        const theta = Math.sqrt(particleCount * Math.PI) * phi;
        shapes.sphere[i3] = r * Math.cos(theta) * Math.sin(phi);
        shapes.sphere[i3 + 1] = r * Math.sin(theta) * Math.sin(phi);
        shapes.sphere[i3 + 2] = r * Math.cos(phi);

        shapes.cube[i3] = (Math.random() - 0.5) * 8;
        shapes.cube[i3 + 1] = (Math.random() - 0.5) * 8;
        shapes.cube[i3 + 2] = (Math.random() - 0.5) * 8;

        const R = 5, rr = 2;
        const u = Math.random() * Math.PI * 2, v = Math.random() * Math.PI * 2;
        shapes.torus[i3] = (R + rr * Math.cos(v)) * Math.cos(u);
        shapes.torus[i3 + 1] = (R + rr * Math.cos(v)) * Math.sin(u);
        shapes.torus[i3 + 2] = rr * Math.sin(v);

        const cr = 3, ch = 8, ct = Math.random() * Math.PI * 2;
        shapes.cylinder[i3] = cr * Math.cos(ct);
        shapes.cylinder[i3 + 1] = (Math.random() - 0.5) * ch;
        shapes.cylinder[i3 + 2] = cr * Math.sin(ct);

        const lat = Math.random() * Math.PI, lon = Math.random() * Math.PI * 2;
        shapes.icosahedron[i3] = 6 * Math.cos(lon) * Math.sin(lat);
        shapes.icosahedron[i3 + 1] = 6 * Math.sin(lon) * Math.sin(lat);
        shapes.icosahedron[i3 + 2] = 6 * Math.cos(lat);
    }
}

function initKeyboardControls() {
    window.addEventListener('keydown', (e) => {
        switch (e.key) {
            case '1': morphTo('sphere', 0x00f2fe); break;
            case '2': morphTo('cube', 0xff3e00); break;
            case '3': morphTo('torus', 0x00ff88); break;
            case '4': morphTo('cylinder', 0xff00ff); break;
            case '5': morphTo('icosahedron', 0xffff00); break;
        }
    });
}

function morphTo(shape, colorHex) {
    nextShape = shape;
    colorMode.setHex(colorHex);
    if (palmRing) {
        palmRing.material.color.setHex(colorHex);
        hudGroup.children.forEach(c => { if (c.material) c.material.color.setHex(colorHex); });
    }
    gestureIndicator.innerText = "HUD Sync: " + shape.toUpperCase();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

function updateStatus(msg, isError = false) {
    if (statusOverlay) {
        statusOverlay.innerText = msg;
        statusOverlay.style.color = isError ? '#ff4444' : '#00f2fe';
    }
}

async function initMediaPipe() {
    try {
        updateStatus("Initializing Stark Tech HUD...");

        // Wait for the ESM module to expose globals
        await waitForMediaPipe();

        // Import the new MediaPipe Tasks Vision API
        const vision = await window.FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        handLandmarker = await window.HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.45,
            minHandPresenceConfidence: 0.45,
            minTrackingConfidence: 0.35
        });

        // Modern way to start camera
        navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720, frameRate: { ideal: 60 } }
        }).then(stream => {
            videoElement.srcObject = stream;
            videoElement.onloadeddata = () => {
                trackerReady = true;
                updateStatus("Suit Powered Up!");
                setTimeout(() => { if (statusOverlay) statusOverlay.style.display = 'none'; }, 2000);
            };
        }).catch(e => {
            updateStatus("Sensor Failure: " + e.message, true);
        });

    } catch (e) {
        updateStatus("HUD System Failure: " + e.message, true);
        console.error(e);
    }
}

function onResults(results) {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        isHandPresent = true;

        // Tracking palm (landmark 0)
        const wrist = landmarks[0];
        targetHandPosition.x = (0.5 - wrist.x) * 18;
        targetHandPosition.y = (0.5 - wrist.y) * 18;
        targetHandPosition.z = (0.5 - wrist.z) * 12;

        const gesture = analyzeGesture(landmarks);
        if (gesture !== currentGesture) {
            handleGestureChange(gesture);
        }
    } else {
        isHandPresent = false;
        isGrabbing = false;
        hudGroup.visible = false;
    }
}

function analyzeGesture(landmarks) {
    const thumb = landmarks[4], index = landmarks[8];
    const dist = Math.hypot(thumb.x - index.x, thumb.y - index.y);
    // Increased threshold for easier object grabbing
    if (dist < 0.08) return 'pinch';
    return 'open';
}

let lastGestureChangeTime = 0;
function handleGestureChange(gesture) {
    const now = Date.now();
    if (now - lastGestureChangeTime < 200) return;
    lastGestureChangeTime = now;
    currentGesture = gesture;
    if (gesture === 'pinch') {
        isGrabbing = true;
        gestureIndicator.innerText = "SYSTEM: OBJECT GRABBED";
        gestureIndicator.style.display = 'inline-block';
        colorMode.setHex(0xff3e00); // Pulse red on grab
    } else {
        isGrabbing = false;
        gestureIndicator.innerText = "SYSTEM: OBJECT RELEASED";
        colorMode.setHex(0x00f2fe); // Back to blue
    }
}

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();

    // MediaPipe Synchronous Detection
    if (trackerReady && videoElement.currentTime !== lastVideoTime) {
        lastVideoTime = videoElement.currentTime;
        const results = handLandmarker.detectForVideo(videoElement, now);

        // Map Tasks-Vision "landmarks" to our onResults "multiHandLandmarks" expectation
        onResults({
            multiHandLandmarks: results.landmarks
        });
    }

    // Hand Velocity Calculation
    handVelocity.subVectors(targetHandPosition, lastHandPosition);
    lastHandPosition.copy(targetHandPosition);
    handPosition.lerp(targetHandPosition, 0.3); // Increased for better responsiveness

    if (isHandPresent) {
        hudGroup.visible = true;
        hudGroup.position.copy(handPosition);
        hudGroup.rotation.y += 0.05;
        palmRing.rotation.x += 0.02;
    }

    const posAttr = particleSystem.geometry.attributes.position;
    const posArray = posAttr.array;
    const targetArray = shapes[nextShape];

    particleSystem.material.color.lerp(colorMode, 0.08);

    for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        let dx = handPosition.x - posArray[i3];
        let dy = handPosition.y - posArray[i3 + 1];
        let dz = handPosition.z - posArray[i3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz;

        if (isHandPresent && isGrabbing) {
            // Strong Attraction (Pinch-to-Grab)
            const force = 0.2 / (distSq + 0.1);
            velocities[i3] += dx * force;
            velocities[i3 + 1] += dy * force;
            velocities[i3 + 2] += dz * force;
        } else if (!isGrabbing && distSq < 4) {
            // Apply residual hand velocity (Kinetic Throwing)
            velocities[i3] += handVelocity.x * 0.1;
            velocities[i3 + 1] += handVelocity.y * 0.1;
            velocities[i3 + 2] += handVelocity.z * 0.1;
        }

        // Apply velocities + Morphing Force
        posArray[i3] += velocities[i3] + (targetArray[i3] - posArray[i3]) * 0.05;
        posArray[i3 + 1] += velocities[i3 + 1] + (targetArray[i3 + 1] - posArray[i3 + 1]) * 0.05;
        posArray[i3 + 2] += velocities[i3 + 2] + (targetArray[i3 + 2] - posArray[i3 + 2]) * 0.05;

        // Stark Physics (Low damping for kinetic feel)
        velocities[i3] *= 0.94;
        velocities[i3 + 1] *= 0.94;
        velocities[i3 + 2] *= 0.94;
    }

    posAttr.needsUpdate = true;
    particleSystem.rotation.y += 0.001;

    composer.render();
}

initScene();
initMediaPipe();
animate();
