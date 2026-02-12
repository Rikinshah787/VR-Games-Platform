/**
 * 🌌 PARTICLE FORGE — Enhanced 3D Hand Interaction
 * Three.js + MediaPipe Hands
 * 
 * Features:
 *  - 20,000 particles with size/opacity variation
 *  - 9 shapes: sphere, cube, torus, DNA, galaxy, heart, diamond, wave, firework
 *  - Pinch-to-grab with physics
 *  - Kinetic throw on release
 *  - Peace sign ✌️ cycles shapes
 *  - Fist 👊 explodes particles
 *  - Finger energy beam
 *  - Ambient floating dust
 *  - Sound synthesis for interactions
 *  - HUD with live data readouts
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';

// ═══════════════════════════════════════════════
//  ONE-EURO FILTER (Adaptive smoothing)
// ═══════════════════════════════════════════════
class OneEuroFilter {
  constructor(freq = 60, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
  _smoothingFactor(cutoff, dt) {
    const r = 2 * Math.PI * cutoff * dt;
    return r / (r + 1);
  }
  filter(x, t) {
    if (this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = t;
      this.dxPrev = 0;
      return x;
    }
    const dt = Math.max(1e-6, t - this.tPrev);
    this.freq = 1.0 / dt;
    const dx = (x - this.xPrev) / dt;
    const aDx = this._smoothingFactor(this.dCutoff, dt);
    const dxSmooth = aDx * dx + (1 - aDx) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxSmooth);
    const a = this._smoothingFactor(cutoff, dt);
    const xSmooth = a * x + (1 - a) * this.xPrev;
    this.xPrev = xSmooth;
    this.dxPrev = dxSmooth;
    this.tPrev = t;
    return xSmooth;
  }
  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

// ═══════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════
const PARTICLE_COUNT = 20000;
const DUST_COUNT = 500;
const BEAM_POINTS = 40;

// ═══════════════════════════════════════════════
//  GLOBALS
// ═══════════════════════════════════════════════
let scene, camera, renderer, composer;
let particleSystem, dustSystem, beamLine;
let hudGroup, palmRing, hudRings = [];

const shapes = {};
const shapeNames = ['sphere', 'cube', 'torus', 'dna', 'galaxy', 'heart', 'diamond', 'wave', 'firework'];
let currentShape = 'sphere';
let currentShapeIndex = 0;

const velocities = new Float32Array(PARTICLE_COUNT * 3);
const particleSizes = new Float32Array(PARTICLE_COUNT);

// Hand tracking state
let handPosition = new THREE.Vector3(0, 0, 0);
let targetHandPos = new THREE.Vector3(0, 0, 0);
let lastHandPos = new THREE.Vector3(0, 0, 0);
let handVelocity = new THREE.Vector3(0, 0, 0);
let fingerTipPos = new THREE.Vector3(0, 0, 0);
let isHandPresent = false;
let currentGesture = 'none';
let isGrabbing = false;
let colorMode = new THREE.Color(0x00f2fe);

// Gesture cooldowns
let lastGestureChange = 0;
let lastShapeCycle = 0;
let lastExplosion = 0;

// Rotation State
let rotationVelocity = new THREE.Vector2(0, 0);
let grabStartHandPos = new THREE.Vector3(0, 0, 0);

// Hand Filters (tuned: higher beta = more responsive to fast movement)
const handFilters = {
  x: new OneEuroFilter(60, 1.0, 0.007),
  y: new OneEuroFilter(60, 1.0, 0.007),
  z: new OneEuroFilter(60, 1.0, 0.007)
};

// Max hand velocity magnitude (prevents sensitivity drift)
const MAX_HAND_VELOCITY = 2.0;

// Hand skeleton drawing
let skeletonCanvas = null;
let skeletonCtx = null;
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [0, 13], [13, 14], [14, 15], [15, 16],// Ring
  [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [5, 9], [9, 13], [13, 17]           // Palm
];

// Audio
let audioCtx = null;

// FPS
let lastTime = performance.now();
let frameCount = 0;
let fps = 60;

// DOM
const dataFps = document.getElementById('data-fps');
const statusText = document.getElementById('status-text');
const dataShape = document.getElementById('data-shape');
const dataGesture = document.getElementById('data-gesture');
const dataVelocity = document.getElementById('data-velocity');
const gestureToast = document.getElementById('gesture-toast');

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

// ═══════════════════════════════════════════════
//  SCENE INIT
// ═══════════════════════════════════════════════
function initScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060810, 0.015);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 12;

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  document.body.appendChild(renderer.domElement);

  // Bloom
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85
  );
  bloomPass.threshold = 0.08;
  bloomPass.strength = 1.6;
  bloomPass.radius = 1.2;

  composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);

  // Generate all shapes
  generateAllShapes();

  // Main particle system
  createParticleSystem();

  // Ambient dust
  createDustParticles();

  // HUD
  createHUD();

  // Energy beam
  createEnergyBeam();

  // Keyboard controls
  initKeyboard();

  // Shape gallery clicks
  initShapeGallery();

  // Skeleton canvas for webcam overlay
  initSkeletonCanvas();

  window.addEventListener('resize', onResize);
}

// ═══════════════════════════════════════════════
//  SHAPE GENERATION (9 shapes)
// ═══════════════════════════════════════════════
function generateAllShapes() {
  for (const name of shapeNames) {
    shapes[name] = new Float32Array(PARTICLE_COUNT * 3);
  }

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const t = i / PARTICLE_COUNT;

    // 🔵 Sphere
    const phi = Math.acos(-1 + 2 * t);
    const theta = Math.sqrt(PARTICLE_COUNT * Math.PI) * phi;
    const r = 5;
    shapes.sphere[i3] = r * Math.cos(theta) * Math.sin(phi);
    shapes.sphere[i3 + 1] = r * Math.sin(theta) * Math.sin(phi);
    shapes.sphere[i3 + 2] = r * Math.cos(phi);

    // 🟧 Cube (surface only)
    const face = Math.floor(Math.random() * 6);
    const u = (Math.random() - 0.5) * 7, v = (Math.random() - 0.5) * 7;
    if (face === 0) { shapes.cube[i3] = 3.5; shapes.cube[i3 + 1] = u; shapes.cube[i3 + 2] = v; }
    else if (face === 1) { shapes.cube[i3] = -3.5; shapes.cube[i3 + 1] = u; shapes.cube[i3 + 2] = v; }
    else if (face === 2) { shapes.cube[i3] = u; shapes.cube[i3 + 1] = 3.5; shapes.cube[i3 + 2] = v; }
    else if (face === 3) { shapes.cube[i3] = u; shapes.cube[i3 + 1] = -3.5; shapes.cube[i3 + 2] = v; }
    else if (face === 4) { shapes.cube[i3] = u; shapes.cube[i3 + 1] = v; shapes.cube[i3 + 2] = 3.5; }
    else { shapes.cube[i3] = u; shapes.cube[i3 + 1] = v; shapes.cube[i3 + 2] = -3.5; }

    // 🟢 Torus
    const R = 4, rr = 1.8;
    const tu = t * Math.PI * 2 * 20, tv = Math.random() * Math.PI * 2;
    shapes.torus[i3] = (R + rr * Math.cos(tv)) * Math.cos(tu);
    shapes.torus[i3 + 1] = (R + rr * Math.cos(tv)) * Math.sin(tu);
    shapes.torus[i3 + 2] = rr * Math.sin(tv);

    // 🧬 DNA Double Helix
    const dnaT = t * Math.PI * 8;
    const dnaR = 3;
    const strand = i % 2 === 0 ? 1 : -1;
    shapes.dna[i3] = dnaR * Math.cos(dnaT) * strand;
    shapes.dna[i3 + 1] = (t - 0.5) * 14;
    shapes.dna[i3 + 2] = dnaR * Math.sin(dnaT) * strand;
    // Add rungs every few particles
    if (i % 20 < 4) {
      const rungT = Math.floor(i / 20) * (Math.PI * 8 / (PARTICLE_COUNT / 20));
      const rungPos = (i % 20) / 3;
      shapes.dna[i3] = dnaR * Math.cos(rungT) * (1 - 2 * rungPos);
      shapes.dna[i3 + 2] = dnaR * Math.sin(rungT) * (1 - 2 * rungPos);
    }

    // 🌀 Galaxy Spiral
    const galArm = i % 3;
    const galDist = Math.pow(t, 0.5) * 6;
    const galAngle = t * Math.PI * 6 + (galArm * Math.PI * 2 / 3);
    const galSpread = 0.3 + t * 0.5;
    shapes.galaxy[i3] = galDist * Math.cos(galAngle) + (Math.random() - 0.5) * galSpread;
    shapes.galaxy[i3 + 1] = (Math.random() - 0.5) * galSpread * 0.3;
    shapes.galaxy[i3 + 2] = galDist * Math.sin(galAngle) + (Math.random() - 0.5) * galSpread;

    // ❤️ Heart
    const ht = t * Math.PI * 2;
    const hx = 16 * Math.pow(Math.sin(ht), 3);
    const hy = 13 * Math.cos(ht) - 5 * Math.cos(2 * ht) - 2 * Math.cos(3 * ht) - Math.cos(4 * ht);
    const hz = (Math.random() - 0.5) * 2;
    shapes.heart[i3] = hx * 0.35 + (Math.random() - 0.5) * 0.5;
    shapes.heart[i3 + 1] = hy * 0.35 + (Math.random() - 0.5) * 0.5;
    shapes.heart[i3 + 2] = hz;

    // 💎 Diamond (octahedron)
    const diaH = (Math.random() - 0.5) * 2;
    const diaR2 = (1 - Math.abs(diaH)) * 5;
    const diaA = Math.random() * Math.PI * 2;
    shapes.diamond[i3] = diaR2 * Math.cos(diaA);
    shapes.diamond[i3 + 1] = diaH * 5;
    shapes.diamond[i3 + 2] = diaR2 * Math.sin(diaA);

    // 🌊 Wave surface
    const wx = (i % 140 - 70) / 10;
    const wz = (Math.floor(i / 140) - 70) / 10;
    const wy = Math.sin(wx * 1.5) * Math.cos(wz * 1.5) * 2;
    shapes.wave[i3] = wx * 0.8;
    shapes.wave[i3 + 1] = wy;
    shapes.wave[i3 + 2] = wz * 0.8;

    // 🎆 Firework burst
    const fwAngle1 = Math.random() * Math.PI * 2;
    const fwAngle2 = Math.random() * Math.PI;
    const fwR = 2 + Math.random() * 5;
    const trail = Math.random();
    shapes.firework[i3] = fwR * Math.sin(fwAngle2) * Math.cos(fwAngle1) * trail;
    shapes.firework[i3 + 1] = fwR * Math.cos(fwAngle2) * trail + (1 - trail) * (-3);
    shapes.firework[i3 + 2] = fwR * Math.sin(fwAngle2) * Math.sin(fwAngle1) * trail;

    // Particle size variation
    particleSizes[i] = 0.03 + Math.random() * 0.04;
  }
}

// ═══════════════════════════════════════════════
//  PARTICLE SYSTEM
// ═══════════════════════════════════════════════
function createParticleSystem() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(shapes.sphere);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(particleSizes, 1));

  // Custom shader for size variation
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x00f2fe) },
      uTime: { value: 0 },
      uOpacity: { value: 0.75 }
    },
    vertexShader: `
      attribute float size;
      varying float vAlpha;
      uniform float uTime;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
        vAlpha = 0.5 + 0.5 * sin(uTime + position.x * 0.5 + position.y * 0.3);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow = 1.0 - smoothstep(0.0, 0.5, d);
        gl_FragColor = vec4(uColor, uOpacity * glow * (0.6 + 0.4 * vAlpha));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  particleSystem = new THREE.Points(geo, mat);
  scene.add(particleSystem);
}

// ═══════════════════════════════════════════════
//  AMBIENT DUST
// ═══════════════════════════════════════════════
function createDustParticles() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 40;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mat = new THREE.PointsMaterial({
    color: 0x334466,
    size: 0.06,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  dustSystem = new THREE.Points(geo, mat);
  scene.add(dustSystem);
}

// ═══════════════════════════════════════════════
//  HUD (rings around hand)
// ═══════════════════════════════════════════════
function createHUD() {
  hudGroup = new THREE.Group();
  hudGroup.visible = false;
  scene.add(hudGroup);

  // Palm ring
  const ringGeo = new THREE.TorusGeometry(0.9, 0.015, 16, 100);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.6 });
  palmRing = new THREE.Mesh(ringGeo, ringMat);
  hudGroup.add(palmRing);

  // Outer scan rings
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.15 });
  for (let i = 0; i < 5; i++) {
    const points = new THREE.Path().absarc(0, 0, 1.2 + i * 0.18, 0, Math.PI * 2).getPoints(64);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, lineMat.clone());
    hudRings.push(line);
    hudGroup.add(line);
  }

  // Small orbiting dots
  for (let i = 0; i < 3; i++) {
    const dotGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, transparent: true, opacity: 0.8 });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.userData = { orbitRadius: 1.0 + i * 0.3, orbitSpeed: 0.03 + i * 0.01, angle: (Math.PI * 2 / 3) * i };
    hudGroup.add(dot);
  }
}

// ═══════════════════════════════════════════════
//  ENERGY BEAM
// ═══════════════════════════════════════════════
function createEnergyBeam() {
  const points = [];
  for (let i = 0; i < BEAM_POINTS; i++) points.push(new THREE.Vector3(0, 0, 0));
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0x00f2fe, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending
  });
  beamLine = new THREE.Line(geo, mat);
  scene.add(beamLine);
}

function updateBeam() {
  if (!isHandPresent || !isGrabbing) {
    beamLine.material.opacity *= 0.9;
    return;
  }

  beamLine.material.opacity = 0.3;
  beamLine.material.color.copy(colorMode);
  const positions = beamLine.geometry.attributes.position.array;

  for (let i = 0; i < BEAM_POINTS; i++) {
    const t = i / (BEAM_POINTS - 1);
    const wave = Math.sin(t * Math.PI * 4 + performance.now() * 0.005) * 0.15 * (1 - t);
    positions[i * 3] = fingerTipPos.x + (0 - fingerTipPos.x) * t + wave;
    positions[i * 3 + 1] = fingerTipPos.y + (0 - fingerTipPos.y) * t + wave;
    positions[i * 3 + 2] = fingerTipPos.z + (0 - fingerTipPos.z) * t;
  }
  beamLine.geometry.attributes.position.needsUpdate = true;
}

// ═══════════════════════════════════════════════
//  SHAPE GALLERY UI
// ═══════════════════════════════════════════════
function initShapeGallery() {
  const btns = document.querySelectorAll('.shape-btn');
  btns.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      const shape = btn.dataset.shape;
      const color = btn.dataset.color;
      morphTo(shape, parseInt(color.replace('#', ''), 16));
      currentShapeIndex = idx;

      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function initKeyboard() {
  window.addEventListener('keydown', (e) => {
    const idx = parseInt(e.key) - 1;
    if (idx >= 0 && idx < shapeNames.length) {
      const btns = document.querySelectorAll('.shape-btn');
      btns[idx].click();
    }
  });
}

// ═══════════════════════════════════════════════
//  MORPH TO SHAPE
// ═══════════════════════════════════════════════
function morphTo(shape, colorHex) {
  currentShape = shape;
  colorMode.setHex(colorHex);

  // Update HUD colors
  palmRing.material.color.setHex(colorHex);
  hudRings.forEach(r => r.material.color.setHex(colorHex));
  hudGroup.children.forEach(c => { if (c.material && c.material.color) c.material.color.setHex(colorHex); });

  // Update data display
  dataShape.textContent = shape.toUpperCase();
  dataShape.style.color = '#' + colorHex.toString(16).padStart(6, '0');

  showToast('⚡ ' + shape.toUpperCase());
  playMorphSound();
}

function cycleShape() {
  currentShapeIndex = (currentShapeIndex + 1) % shapeNames.length;
  const btns = document.querySelectorAll('.shape-btn');
  btns[currentShapeIndex].click();
}

// ═══════════════════════════════════════════════
//  EXPLOSION EFFECT
// ═══════════════════════════════════════════════
function explodeParticles() {
  const now = Date.now();
  if (now - lastExplosion < 1500) return;
  lastExplosion = now;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const dx = velocities[i3] + (Math.random() - 0.5);
    const dy = velocities[i3 + 1] + (Math.random() - 0.5);
    const dz = velocities[i3 + 2] + (Math.random() - 0.5);
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const force = 0.5 + Math.random() * 1.0;
    velocities[i3] += (dx / len) * force;
    velocities[i3 + 1] += (dy / len) * force;
    velocities[i3 + 2] += (dz / len) * force;
  }

  showToast('💥 EXPLODE!');
  playExplosionSound();
}

// ═══════════════════════════════════════════════
//  SOUND (Web Audio API)
// ═══════════════════════════════════════════════
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playMorphSound() {
  try {
    ensureAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.15);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.2);
  } catch (e) { }
}

function playGrabSound() {
  try {
    ensureAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.15);
  } catch (e) { }
}

function playExplosionSound() {
  try {
    ensureAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.5);

    // Noise burst
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = audioCtx.createBufferSource();
    const g2 = audioCtx.createGain();
    g2.gain.setValueAtTime(0.1, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.buffer = buf;
    src.connect(g2).connect(audioCtx.destination);
    src.start(t);
  } catch (e) { }
}

// ═══════════════════════════════════════════════
//  TOAST NOTIFICATION
// ═══════════════════════════════════════════════
let toastTimer = null;
function showToast(text) {
  gestureToast.textContent = text;
  gestureToast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => gestureToast.classList.add('hidden'), 1200);
}

// ═══════════════════════════════════════════════
//  SKELETON CANVAS (overlay on webcam)
// ═══════════════════════════════════════════════
function initSkeletonCanvas() {
  const container = document.getElementById('webcam-container');
  if (!container) return;
  skeletonCanvas = document.getElementById('webcam-skeleton');
  if (!skeletonCanvas) {
    skeletonCanvas = document.createElement('canvas');
    skeletonCanvas.id = 'webcam-skeleton';
    container.appendChild(skeletonCanvas);
  }
  // Match webcam size once it loads
  const webcam = document.getElementById('webcam');
  const setSize = () => {
    skeletonCanvas.width = webcam.videoWidth || 640;
    skeletonCanvas.height = webcam.videoHeight || 480;
  };
  webcam.addEventListener('loadeddata', setSize);
  setSize();
  skeletonCtx = skeletonCanvas.getContext('2d');
}

function drawHandSkeleton(landmarks) {
  if (!skeletonCtx || !skeletonCanvas) return;
  const w = skeletonCanvas.width;
  const h = skeletonCanvas.height;
  skeletonCtx.clearRect(0, 0, w, h);

  // Determine color based on gesture
  let lineColor = 'rgba(0, 242, 254, 0.8)';  // cyan default
  let dotColor = 'rgba(0, 242, 254, 1)';
  if (currentGesture === 'pinch') {
    lineColor = 'rgba(255, 62, 0, 0.8)'; dotColor = 'rgba(255, 62, 0, 1)';
  } else if (currentGesture === 'peace') {
    lineColor = 'rgba(68, 255, 136, 0.8)'; dotColor = 'rgba(68, 255, 136, 1)';
  } else if (currentGesture === 'fist') {
    lineColor = 'rgba(255, 255, 0, 0.8)'; dotColor = 'rgba(255, 255, 0, 1)';
  } else if (currentGesture === 'point') {
    lineColor = 'rgba(255, 170, 0, 0.8)'; dotColor = 'rgba(255, 170, 0, 1)';
  }

  // Draw connections
  skeletonCtx.strokeStyle = lineColor;
  skeletonCtx.lineWidth = 2;
  for (const [a, b] of HAND_CONNECTIONS) {
    const ax = landmarks[a].x * w, ay = landmarks[a].y * h;
    const bx = landmarks[b].x * w, by = landmarks[b].y * h;
    skeletonCtx.beginPath();
    skeletonCtx.moveTo(ax, ay);
    skeletonCtx.lineTo(bx, by);
    skeletonCtx.stroke();
  }

  // Draw landmarks
  skeletonCtx.fillStyle = dotColor;
  for (let i = 0; i < landmarks.length; i++) {
    const x = landmarks[i].x * w;
    const y = landmarks[i].y * h;
    const radius = (i === 0 || i === 5 || i === 9 || i === 13 || i === 17) ? 4 : 3;
    skeletonCtx.beginPath();
    skeletonCtx.arc(x, y, radius, 0, Math.PI * 2);
    skeletonCtx.fill();
  }

  // Highlight fingertips with glow
  const tips = [4, 8, 12, 16, 20];
  skeletonCtx.shadowColor = dotColor;
  skeletonCtx.shadowBlur = 8;
  for (const tip of tips) {
    const x = landmarks[tip].x * w;
    const y = landmarks[tip].y * h;
    skeletonCtx.beginPath();
    skeletonCtx.arc(x, y, 5, 0, Math.PI * 2);
    skeletonCtx.fill();
  }
  skeletonCtx.shadowBlur = 0;
}

// ═══════════════════════════════════════════════
//  MEDIAPIPE INIT
// ═══════════════════════════════════════════════
async function initMediaPipe() {
  try {
    statusText.textContent = 'Initializing hand tracking...';

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
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.3
    });

    const videoEl = document.getElementById('webcam');

    // Modern way to start camera without legacy Camera helper
    navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, frameRate: { ideal: 60 } }
    }).then(stream => {
      videoEl.srcObject = stream;
      videoEl.onloadeddata = () => {
        trackerReady = true;
        statusText.textContent = '✅ Ready — Show your hand!';
        statusText.classList.add('ready');
        setTimeout(() => { statusText.style.opacity = '0'; }, 3000);
      };
    }).catch(e => {
      statusText.textContent = '❌ Camera error: ' + e.message;
      statusText.classList.add('error');
    });

  } catch (e) {
    statusText.textContent = '❌ Initialization error: ' + e.message;
    statusText.classList.add('error');
    console.error(e);
  }
}

function onHandResults(results) {
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];
    isHandPresent = true;
    const t = performance.now() / 1000;

    // Draw skeleton overlay on webcam
    drawHandSkeleton(lm);

    // Wrist as hand center
    const wrist = lm[0];
    const rawX = (0.5 - wrist.x) * 20;
    const rawY = (0.5 - wrist.y) * 16;
    const rawZ = (0.5 - wrist.z) * 12;

    // Apply One-Euro filter to target position
    targetHandPos.x = handFilters.x.filter(rawX, t);
    targetHandPos.y = handFilters.y.filter(rawY, t);
    targetHandPos.z = handFilters.z.filter(rawZ, t);

    // Index finger tip for beam
    const indexTip = lm[8];
    fingerTipPos.x = (0.5 - indexTip.x) * 20;
    fingerTipPos.y = (0.5 - indexTip.y) * 16;
    fingerTipPos.z = (0.5 - indexTip.z) * 12;

    const gesture = analyzeGesture(lm);
    if (gesture !== currentGesture) {
      handleGestureChange(gesture);
    }

    // Rotation logic during pinch
    if (currentGesture === 'pinch') {
      const deltaX = targetHandPos.x - lastHandPos.x;
      const deltaY = targetHandPos.y - lastHandPos.y;

      // Update rotation velocity based on movement
      rotationVelocity.x += deltaY * 0.05;
      rotationVelocity.y += deltaX * 0.05;
    }
  } else {
    isHandPresent = false;
    isGrabbing = false;
    hudGroup.visible = false;
    dataGesture.textContent = '—';
    // Clear skeleton when hand lost
    if (skeletonCtx && skeletonCanvas) {
      skeletonCtx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
    }
    // Reset filters when hand is lost
    handFilters.x.reset();
    handFilters.y.reset();
    handFilters.z.reset();
  }
}

function analyzeGesture(lm) {
  const thumb = lm[4], index = lm[8], middle = lm[12], ring = lm[16], pinky = lm[20];
  const indexMcp = lm[5], middleMcp = lm[9], ringMcp = lm[13], pinkyMcp = lm[17];

  // Pinch: thumb-index close (increased threshold for easier grabbing)
  const pinchDist = Math.hypot(thumb.x - index.x, thumb.y - index.y, thumb.z - index.z);
  if (pinchDist < 0.08) return 'pinch';

  // Finger extension states
  const indexUp = index.y < indexMcp.y;
  const middleUp = middle.y < middleMcp.y;
  const ringDown = ring.y > ringMcp.y;
  const pinkyDown = pinky.y > pinkyMcp.y;

  // Fist: all fingertips below MCPs
  const fist = (index.y > indexMcp.y) && (middle.y > middleMcp.y) &&
    (ring.y > ringMcp.y) && (pinky.y > pinkyMcp.y);
  if (fist) return 'fist';

  // Point: index extended, rest curled (gun-point gesture)
  if (indexUp && !middleUp && ringDown && pinkyDown) return 'point';

  // Peace: index+middle extended, ring+pinky curled
  if (indexUp && middleUp && ringDown && pinkyDown) return 'peace';

  return 'open';
}

function handleGestureChange(gesture) {
  const now = Date.now();
  if (now - lastGestureChange < 300) return;
  lastGestureChange = now;
  currentGesture = gesture;

  switch (gesture) {
    case 'pinch':
      isGrabbing = true;
      grabStartHandPos.copy(targetHandPos);
      dataGesture.textContent = '🤏 GRAB';
      dataGesture.style.color = '#ff3e00';
      colorMode.setHex(0xff3e00);
      playGrabSound();
      break;

    case 'peace':
      isGrabbing = false;
      dataGesture.textContent = '✌️ NEXT';
      dataGesture.style.color = '#44ff88';
      if (now - lastShapeCycle > 800) {
        lastShapeCycle = now;
        cycleShape();
      }
      break;

    case 'fist':
      isGrabbing = false;
      dataGesture.textContent = '👊 EXPLODE';
      dataGesture.style.color = '#ffff00';
      explodeParticles();
      break;

    case 'point':
      isGrabbing = false;
      dataGesture.textContent = '☝️ POINT';
      dataGesture.style.color = '#ffaa00';
      break;

    default: // open
      if (isGrabbing) {
        // Release → kinetic throw
        dataGesture.textContent = '🖐️ THROW';
        dataGesture.style.color = '#00f2fe';
      } else {
        dataGesture.textContent = '🖐️ OPEN';
        dataGesture.style.color = '#00f2fe';
      }
      isGrabbing = false;
      // Restore shape color
      const btn = document.querySelector('.shape-btn.active');
      if (btn) colorMode.setHex(parseInt(btn.dataset.color.replace('#', ''), 16));
      break;
  }
}

// ═══════════════════════════════════════════════
//  RESIZE
// ═══════════════════════════════════════════════
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// ═══════════════════════════════════════════════
//  ANIMATION LOOP
// ═══════════════════════════════════════════════
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();

  // MediaPipe Synchronous Detection
  const videoEl = document.getElementById('webcam');
  if (trackerReady && videoEl.currentTime !== lastVideoTime) {
    lastVideoTime = videoEl.currentTime;
    const results = handLandmarker.detectForVideo(videoEl, now);

    // Map Tasks-Vision "landmarks" to our onHandResults "multiHandLandmarks" expectation
    onHandResults({
      multiHandLandmarks: results.landmarks
    });
  }

  // FPS counter
  frameCount++;
  if (now - lastTime > 500) {
    fps = Math.round(frameCount / ((now - lastTime) / 1000));
    dataFps.textContent = fps;
    frameCount = 0;
    lastTime = now;
  }

  // Time uniform
  particleSystem.material.uniforms.uTime.value = now * 0.001;

  // Hand smoothing (Hand position now follows targetHandPos which is already One-Euro filtered)
  handVelocity.subVectors(targetHandPos, lastHandPos);

  // Clamp velocity to prevent sensitivity drift over time
  const velMag = handVelocity.length();
  if (velMag > MAX_HAND_VELOCITY) {
    handVelocity.multiplyScalar(MAX_HAND_VELOCITY / velMag);
  }

  lastHandPos.copy(targetHandPos);
  handPosition.copy(targetHandPos); // No extra lerp needed as OneEuro is smooth enough

  const speed = handVelocity.length();
  dataVelocity.textContent = speed.toFixed(2);

  // HUD follow hand
  if (isHandPresent) {
    hudGroup.visible = true;
    hudGroup.position.copy(handPosition);
    hudGroup.rotation.y += 0.04;
    palmRing.rotation.x += 0.02;
    palmRing.rotation.z += 0.01;

    // Orbit dots
    hudGroup.children.forEach(child => {
      if (child.userData.orbitRadius) {
        child.userData.angle += child.userData.orbitSpeed;
        child.position.x = Math.cos(child.userData.angle) * child.userData.orbitRadius;
        child.position.y = Math.sin(child.userData.angle) * child.userData.orbitRadius;
      }
    });

    // Pulse ring scale based on gesture
    const targetScale = isGrabbing ? 0.6 : 1.0;
    palmRing.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
  }

  // Energy beam
  updateBeam();

  // Particle color lerp
  particleSystem.material.uniforms.uColor.value.lerp(colorMode, 0.06);

  // Main particle physics
  const posAttr = particleSystem.geometry.attributes.position;
  const posArr = posAttr.array;
  const targetArr = shapes[currentShape];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const dx = handPosition.x - posArr[i3];
    const dy = handPosition.y - posArr[i3 + 1];
    const dz = handPosition.z - posArr[i3 + 2];
    const distSq = dx * dx + dy * dy + dz * dz;

    if (isHandPresent && isGrabbing) {
      // Attraction toward hand
      const force = 0.18 / (distSq + 0.1);
      velocities[i3] += dx * force;
      velocities[i3 + 1] += dy * force;
      velocities[i3 + 2] += dz * force;
    } else if (isHandPresent && !isGrabbing && distSq < 6) {
      // Repulsion when open hand is near
      const repulse = -0.02 / (distSq + 0.5);
      velocities[i3] += dx * repulse;
      velocities[i3 + 1] += dy * repulse;
      velocities[i3 + 2] += dz * repulse;

      // Kinetic throw from hand velocity
      velocities[i3] += handVelocity.x * 0.08;
      velocities[i3 + 1] += handVelocity.y * 0.08;
      velocities[i3 + 2] += handVelocity.z * 0.08;
    }

    // Morph toward target shape
    const morphSpeed = isGrabbing ? 0.02 : 0.04;
    posArr[i3] += velocities[i3] + (targetArr[i3] - posArr[i3]) * morphSpeed;
    posArr[i3 + 1] += velocities[i3 + 1] + (targetArr[i3 + 1] - posArr[i3 + 1]) * morphSpeed;
    posArr[i3 + 2] += velocities[i3 + 2] + (targetArr[i3 + 2] - posArr[i3 + 2]) * morphSpeed;

    // Damping
    velocities[i3] *= 0.93;
    velocities[i3 + 1] *= 0.93;
    velocities[i3 + 2] *= 0.93;
  }

  posAttr.needsUpdate = true;

  // Rotation & Kinetic Spin
  if (isHandPresent && isGrabbing) {
    // Current rotation is handled via rotationVelocity in onHandResults
  }

  // Apply rotation velocity to the system
  particleSystem.rotation.x += rotationVelocity.x;
  particleSystem.rotation.y += rotationVelocity.y;

  // Damping for rotation velocity
  const damping = isGrabbing ? 0.8 : 0.96;
  rotationVelocity.x *= damping;
  rotationVelocity.y *= damping;

  // Slow auto-rotation plus kinetic spin
  particleSystem.rotation.y += 0.001;

  // Dust drift
  if (dustSystem) {
    dustSystem.rotation.y += 0.0003;
    dustSystem.rotation.x += 0.0001;
  }

  composer.render();
}

// ═══════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════
initScene();
initMediaPipe();
animate();
