/* ═══════════════════════════════════════════════════════════
   🍉 FRUIT NINJA — Premium Edition
   
   Using MediaPipe Tasks Vision API (HandLandmarker)
   + One-Euro Filter for buttery smooth tracking
   + Palm gesture UI control for menus
   + Gun-point (index finger) = ring crosshair for gameplay
   + Detection quality feedback
   ═══════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ═══════════════════════════════════════
    //  ONE-EURO FILTER
    //  Adaptive smoothing: smooth when slow,
    //  responsive when fast. Zero perceived lag.
    // ═══════════════════════════════════════
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

            // Derivative (rate of change)
            const dx = (x - this.xPrev) / dt;
            const aDx = this._smoothingFactor(this.dCutoff, dt);
            const dxSmooth = aDx * dx + (1 - aDx) * this.dxPrev;

            // Adaptive cutoff — faster movement = higher cutoff = less smoothing
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

    // ═══ CANVAS ═══
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // ═══ CONSTANTS ═══
    const MAX_LIVES = 3;
    const RING_RADIUS = 44;
    const RING_HIT_RADIUS = 56;
    const DUAL_RING_OVERLAP_DIST = 80;
    const SHOOT_COOLDOWN = 200;
    const FRUIT_RADIUS_MIN = 30;
    const FRUIT_RADIUS_MAX = 44;
    const PALM_HOLD_TIME = 800;  // ms to hold palm over button to select

    // ═══ FRUIT TYPES ═══
    const FRUIT_TYPES = [
        {
            name: 'watermelon', points: 1,
            innerColor: '#ff4444', juiceColor: 'rgba(255,80,80,0.7)',
            draw: (c, r) => {
                c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2);
                c.fillStyle = '#2d7a2d'; c.fill();
                c.strokeStyle = '#1a5c1a'; c.lineWidth = 3; c.stroke();
                c.beginPath(); c.arc(0, 0, r * 0.82, 0, Math.PI * 2);
                c.fillStyle = '#ff4444'; c.fill();
                c.fillStyle = '#222';
                for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3, sr = r * 0.45; c.beginPath(); c.ellipse(Math.cos(a) * sr, Math.sin(a) * sr, 3, 5, a, 0, Math.PI * 2); c.fill(); }
                c.beginPath(); c.arc(-r * 0.25, -r * 0.25, r * 0.18, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fill();
            }
        },
        {
            name: 'apple', points: 1,
            innerColor: '#ffe8c0', juiceColor: 'rgba(255,200,150,0.6)',
            draw: (c, r) => {
                c.beginPath(); c.arc(0, 2, r, 0, Math.PI * 2); c.fillStyle = '#cc2222'; c.fill();
                const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r); g.addColorStop(0, 'rgba(255,100,100,0.4)'); g.addColorStop(1, 'rgba(100,0,0,0.3)'); c.fillStyle = g; c.fill();
                c.strokeStyle = '#5a3a1a'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -r + 4); c.quadraticCurveTo(4, -r - 6, 2, -r - 10); c.stroke();
                c.fillStyle = '#4a9e2a'; c.beginPath(); c.ellipse(6, -r - 2, 8, 4, 0.5, 0, Math.PI * 2); c.fill();
                c.beginPath(); c.arc(-r * 0.3, -r * 0.25, r * 0.15, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fill();
            }
        },
        {
            name: 'orange', points: 1,
            innerColor: '#ffcc66', juiceColor: 'rgba(255,180,50,0.6)',
            draw: (c, r) => {
                c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = '#ff8800'; c.fill();
                c.fillStyle = 'rgba(200,100,0,0.3)';
                for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, d = r * 0.5 + (i % 3) * r * 0.15; c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, 1.5, 0, Math.PI * 2); c.fill(); }
                const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r); g.addColorStop(0, 'rgba(255,220,100,0.35)'); g.addColorStop(1, 'rgba(200,80,0,0.1)'); c.fillStyle = g;
                c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
            }
        },
        {
            name: 'kiwi', points: 2,
            innerColor: '#88cc44', juiceColor: 'rgba(130,200,60,0.6)',
            draw: (c, r) => {
                c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = '#7a5a30'; c.fill();
                c.beginPath(); c.arc(0, 0, r * 0.85, 0, Math.PI * 2); c.fillStyle = '#88cc44'; c.fill();
                c.beginPath(); c.arc(0, 0, r * 0.15, 0, Math.PI * 2); c.fillStyle = '#eeffcc'; c.fill();
                c.strokeStyle = 'rgba(255,255,220,0.3)'; c.lineWidth = 1;
                for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15); c.lineTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7); c.stroke(); }
                c.fillStyle = '#222';
                for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + 0.2, d = r * 0.5; c.beginPath(); c.ellipse(Math.cos(a) * d, Math.sin(a) * d, 2, 3.5, a, 0, Math.PI * 2); c.fill(); }
            }
        },
        {
            name: 'mango', points: 2,
            innerColor: '#ffdd44', juiceColor: 'rgba(255,200,0,0.6)',
            draw: (c, r) => {
                c.beginPath(); c.ellipse(0, 0, r, r * 0.85, 0, 0, Math.PI * 2);
                const g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#ff4400'); g.addColorStop(0.3, '#ffaa00'); g.addColorStop(0.7, '#ffcc00'); g.addColorStop(1, '#ffdd44');
                c.fillStyle = g; c.fill();
                c.beginPath(); c.ellipse(-r * 0.25, -r * 0.2, r * 0.3, r * 0.15, -0.5, 0, Math.PI * 2); c.fillStyle = 'rgba(255,255,255,0.2)'; c.fill();
            }
        },
        {
            name: 'pineapple', points: 3,
            innerColor: '#ffee88', juiceColor: 'rgba(255,230,100,0.6)',
            draw: (c, r) => {
                c.beginPath(); c.ellipse(0, 4, r * 0.85, r, 0, 0, Math.PI * 2); c.fillStyle = '#cc9900'; c.fill();
                c.strokeStyle = 'rgba(100,60,0,0.4)'; c.lineWidth = 1;
                for (let y = -r + 8; y < r; y += 10) for (let x = -r * 0.6; x < r * 0.6; x += 12) { const ox = (Math.floor(y / 10) % 2) * 6; c.beginPath(); c.moveTo(x + ox, y); c.lineTo(x + ox + 6, y + 5); c.lineTo(x + ox, y + 10); c.lineTo(x + ox - 6, y + 5); c.closePath(); c.stroke(); }
                c.fillStyle = '#4a9e2a';
                for (let i = -2; i <= 2; i++) { c.save(); c.rotate(i * 0.25); c.beginPath(); c.ellipse(0, -r - 6, 5, 14, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
            }
        }
    ];

    const BOMB_TYPE = {
        name: 'bomb', points: 0, innerColor: '#333', juiceColor: 'rgba(60,60,60,0.7)',
        draw: (c, r) => {
            c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fillStyle = '#222'; c.fill(); c.strokeStyle = '#555'; c.lineWidth = 3; c.stroke();
            const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r); g.addColorStop(0, 'rgba(80,80,80,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fill();
            c.strokeStyle = '#aa8844'; c.lineWidth = 3; c.beginPath(); c.moveTo(r * 0.5, -r * 0.7); c.quadraticCurveTo(r * 0.8, -r * 1.1, r * 0.6, -r * 1.2); c.stroke();
            c.fillStyle = '#ff4400'; c.beginPath(); c.arc(r * 0.6, -r * 1.2, 5, 0, Math.PI * 2); c.fill(); c.fillStyle = '#ffcc00'; c.beginPath(); c.arc(r * 0.6, -r * 1.2, 3, 0, Math.PI * 2); c.fill();
            c.font = `${r * 0.6}px serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('💀', 0, 2);
        }
    };

    // ═══ GAME STATE ═══
    let state = 'menu'; // menu, playing, dead
    let score = 0;
    let highScore = parseInt(localStorage.getItem('fruit-ninja-high') || '0');
    let lives = MAX_LIVES;
    let combo = 0, maxCombo = 0, totalSliced = 0;
    let fruits = [], particles = [], splashes = [], textPopups = [], shockwaves = [];
    let lastSpawnTime = 0, nextSpawnDelay = 2200, difficultyTimer = 0;
    let frameCount = 0, comboTimer = 0;

    // ═══ HAND STATE ═══
    // Each hand has One-Euro filters for x and y
    let handData = [
        {
            filters: { x: new OneEuroFilter(60, 1.2, 0.005), y: new OneEuroFilter(60, 1.2, 0.005) },
            x: 0, y: 0, screenX: 0, screenY: 0, visible: false, gesture: 'none', ringPulse: 0, lastShootTime: 0, confidence: 0
        },
        {
            filters: { x: new OneEuroFilter(60, 1.2, 0.005), y: new OneEuroFilter(60, 1.2, 0.005) },
            x: 0, y: 0, screenX: 0, screenY: 0, visible: false, gesture: 'none', ringPulse: 0, lastShootTime: 0, confidence: 0
        }
    ];
    let ringsOverlapping = false;
    let detectionFPS = 0;
    let detFrameCount = 0;
    let detLastSecond = performance.now();

    // Palm UI state
    let palmCursorX = 0, palmCursorY = 0;
    let palmVisible = false;
    let palmHoverTarget = null;
    let palmHoverStartTime = 0;
    let palmHoverProgress = 0;

    // ═══ DOM ═══
    const scoreDisplay = document.getElementById('score-display');
    const highScoreDisplay = document.getElementById('high-score');
    const startScreen = document.getElementById('start-screen');
    const startBtn = document.getElementById('start-btn');
    const cameraStatus = document.getElementById('camera-status');
    const gameoverScreen = document.getElementById('gameover-screen');
    const restartBtn = document.getElementById('restart-btn');
    const comboDisplay = document.getElementById('combo-display');
    const livesDisplay = document.getElementById('lives-display');
    const palmCursorEl = document.getElementById('palm-cursor');
    const cursorFillEl = palmCursorEl.querySelector('.cursor-fill');
    const qualityDot = document.getElementById('quality-dot');
    const qualityText = document.getElementById('quality-text');

    highScoreDisplay.textContent = 'BEST: ' + highScore;

    // ═══ AUDIO ═══
    let audioCtx = null;
    function ensureAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    function playShootSound() {
        try { ensureAudio(); const t = audioCtx.currentTime; const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(600, t); o.frequency.exponentialRampToValueAtTime(200, t + 0.1); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.12); } catch (e) { }
    }
    function playExplodeSound() {
        try { ensureAudio(); const t = audioCtx.currentTime; const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4); g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.5); const b = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.2, audioCtx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const s = audioCtx.createBufferSource(), g2 = audioCtx.createGain(); g2.gain.setValueAtTime(0.12, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25); s.buffer = b; s.connect(g2).connect(audioCtx.destination); s.start(t); } catch (e) { }
    }
    function playBombSound() {
        try { ensureAudio(); const t = audioCtx.currentTime; const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(20, t + 0.6); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6); o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.6); const b = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.3, audioCtx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const s = audioCtx.createBufferSource(), g2 = audioCtx.createGain(); g2.gain.setValueAtTime(0.15, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4); s.buffer = b; s.connect(g2).connect(audioCtx.destination); s.start(t); } catch (e) { }
    }
    function playComboSound(n) {
        try { ensureAudio(); const t = audioCtx.currentTime, f = 500 + n * 100; const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.08); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.12); } catch (e) { }
    }
    function playSelectSound() {
        try { ensureAudio(); const t = audioCtx.currentTime; const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(440, t); o.frequency.setValueAtTime(660, t + 0.06); o.frequency.setValueAtTime(880, t + 0.12); g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + 0.2); } catch (e) { }
    }

    // ═══════════════════════════════════════════════════════════
    //  HAND TRACKING — MediaPipe Tasks Vision (synchronous)
    // ═══════════════════════════════════════════════════════════
    let handLandmarker = null;
    let videoEl = null;
    let lastVideoTime = -1;
    let trackerReady = false;

    function waitForMediaPipe(timeout = 15000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            (function check() {
                if (window.FilesetResolver && window.HandLandmarker) return resolve();
                if (Date.now() - start > timeout) return reject(new Error('MediaPipe load timeout'));
                setTimeout(check, 80);
            })();
        });
    }

    async function initHandTracking() {
        try {
            cameraStatus.textContent = '📷 Loading hand tracker...';
            await waitForMediaPipe();

            const vision = await window.FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
            );

            handLandmarker = await window.HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
                    delegate: 'GPU'
                },
                runningMode: 'VIDEO',
                numHands: 2,
                minHandDetectionConfidence: 0.45,
                minHandPresenceConfidence: 0.45,
                minTrackingConfidence: 0.35
            });

            cameraStatus.textContent = '📷 Starting camera...';

            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', frameRate: { ideal: 30 } }
            });

            videoEl = document.createElement('video');
            videoEl.srcObject = stream;
            videoEl.setAttribute('autoplay', '');
            videoEl.setAttribute('playsinline', '');
            videoEl.setAttribute('muted', '');
            videoEl.style.display = 'none';
            document.body.appendChild(videoEl);
            await videoEl.play();

            const previewCam = document.getElementById('preview-cam');
            if (previewCam) previewCam.srcObject = stream;

            trackerReady = true;
            cameraStatus.textContent = '✅ Ready — show your palm or point your finger!';
            startBtn.textContent = '🍉 START GAME';
            startBtn.disabled = false;

        } catch (err) {
            console.error('Hand tracking init error:', err);
            cameraStatus.textContent = '❌ ' + err.message;
            startBtn.textContent = '🍉 START (Mouse)';
            startBtn.disabled = false;
        }
    }

    // ═══ GESTURE DETECTION ═══
    function detectGesture(landmarks) {
        const indexUp = landmarks[8].y < landmarks[6].y;
        const middleUp = landmarks[12].y < landmarks[10].y;
        const ringUp = landmarks[16].y < landmarks[14].y;
        const pinkyUp = landmarks[20].y < landmarks[18].y;

        // Thumb spread check
        const thumbSpread = Math.hypot(landmarks[4].x - landmarks[5].x, landmarks[4].y - landmarks[5].y) > 0.05;

        // Open palm: all fingers extended + thumb spread
        if (indexUp && middleUp && ringUp && pinkyUp && thumbSpread) return 'palm';

        // Gun-point: only index extended, all others curled
        const middleDown = landmarks[12].y > landmarks[10].y;
        const ringDown = landmarks[16].y > landmarks[14].y;
        const pinkyDown = landmarks[20].y > landmarks[18].y;
        if (indexUp && middleDown && ringDown && pinkyDown) return 'point';

        return 'none';
    }

    // ═══ DETECT HANDS (synchronous, every frame) ═══
    function detectHands() {
        if (!trackerReady || !videoEl || !handLandmarker) return;

        const nowMs = performance.now();
        if (videoEl.currentTime === lastVideoTime) return;
        lastVideoTime = videoEl.currentTime;

        // Detection FPS counter
        detFrameCount++;
        if (nowMs - detLastSecond > 1000) {
            detectionFPS = detFrameCount;
            detFrameCount = 0;
            detLastSecond = nowMs;
            updateQualityIndicator();
        }

        const result = handLandmarker.detectForVideo(videoEl, nowMs);
        const t = nowMs / 1000;  // seconds for One-Euro filter

        handData[0].visible = false;
        handData[1].visible = false;
        palmVisible = false;

        if (!result.landmarks || result.landmarks.length === 0) return;

        for (let i = 0; i < Math.min(2, result.landmarks.length); i++) {
            const lm = result.landmarks[i];
            const gesture = detectGesture(lm);
            const h = handData[i];

            // Get raw position based on gesture
            let rawX, rawY;
            if (gesture === 'palm') {
                // Palm center = wrist midpoint with middle finger MCP
                rawX = 1 - (lm[0].x + lm[9].x) / 2;
                rawY = (lm[0].y + lm[9].y) / 2;
            } else {
                // Gun-point: index fingertip position
                rawX = 1 - lm[8].x;
                rawY = lm[8].y;
            }

            // Apply One-Euro Filter — buttery smooth!
            h.x = h.filters.x.filter(rawX, t);
            h.y = h.filters.y.filter(rawY, t);
            h.screenX = h.x * canvas.width;
            h.screenY = h.y * canvas.height;
            h.visible = true;
            h.gesture = gesture;

            // Track palm for UI
            if (gesture === 'palm') {
                palmCursorX = h.screenX;
                palmCursorY = h.screenY;
                palmVisible = true;
            }
        }
    }

    // ═══ DETECTION QUALITY INDICATOR ═══
    function updateQualityIndicator() {
        if (detectionFPS >= 20) {
            qualityDot.className = 'quality-dot good';
            qualityText.textContent = `TRACKING ${detectionFPS}fps`;
        } else if (detectionFPS >= 10) {
            qualityDot.className = 'quality-dot ok';
            qualityText.textContent = `TRACKING ${detectionFPS}fps`;
        } else {
            qualityDot.className = 'quality-dot poor';
            qualityText.textContent = `LOW ${detectionFPS}fps`;
        }
    }

    // ═══ PALM UI CONTROL ═══
    function updatePalmUI() {
        if (!palmVisible || state === 'playing') {
            palmCursorEl.classList.remove('active');
            palmHoverTarget = null;
            palmHoverProgress = 0;
            startBtn.classList.remove('palm-hover');
            restartBtn.classList.remove('palm-hover');
            cursorFillEl.style.background = `conic-gradient(from 0deg, rgba(255,200,0,0.6) 0%, transparent 0%)`;
            return;
        }

        // Show palm cursor
        palmCursorEl.classList.add('active');
        palmCursorEl.style.left = palmCursorX + 'px';
        palmCursorEl.style.top = palmCursorY + 'px';

        // Check which button palm is over
        let currentTarget = null;
        if (state === 'menu' && !startBtn.disabled) {
            const rect = startBtn.getBoundingClientRect();
            if (palmCursorX >= rect.left - 30 && palmCursorX <= rect.right + 30 &&
                palmCursorY >= rect.top - 30 && palmCursorY <= rect.bottom + 30) {
                currentTarget = 'start';
            }
        } else if (state === 'dead') {
            const rect = restartBtn.getBoundingClientRect();
            if (palmCursorX >= rect.left - 30 && palmCursorX <= rect.right + 30 &&
                palmCursorY >= rect.top - 30 && palmCursorY <= rect.bottom + 30) {
                currentTarget = 'restart';
            }
        }

        if (currentTarget !== palmHoverTarget) {
            palmHoverTarget = currentTarget;
            palmHoverStartTime = currentTarget ? Date.now() : 0;
            palmHoverProgress = 0;
        }

        // Update hover visual
        startBtn.classList.toggle('palm-hover', currentTarget === 'start');
        restartBtn.classList.toggle('palm-hover', currentTarget === 'restart');
        palmCursorEl.classList.toggle('hover', currentTarget !== null);

        if (currentTarget) {
            palmHoverProgress = Math.min(1, (Date.now() - palmHoverStartTime) / PALM_HOLD_TIME);
            cursorFillEl.style.background = `conic-gradient(from 0deg, rgba(255,200,0,0.6) ${palmHoverProgress * 360}deg, transparent ${palmHoverProgress * 360}deg)`;

            if (palmHoverProgress >= 1) {
                // SELECT!
                ensureAudio();
                playSelectSound();
                if (currentTarget === 'start') startGame();
                else if (currentTarget === 'restart') startGame();
                palmHoverTarget = null;
                palmHoverProgress = 0;
            }
        } else {
            cursorFillEl.style.background = `conic-gradient(from 0deg, rgba(0,200,255,0.4) 0%, transparent 0%)`;
        }
    }

    // ═══ MOUSE FALLBACK ═══
    canvas.addEventListener('mousemove', (e) => {
        handData[0].x = e.clientX / canvas.width;
        handData[0].y = e.clientY / canvas.height;
        handData[0].screenX = e.clientX;
        handData[0].screenY = e.clientY;
        handData[0].visible = true;
        handData[0].gesture = 'point';
    });

    // ═══ BUTTONS (mouse/click fallback) ═══
    startBtn.addEventListener('click', () => { ensureAudio(); startGame(); });
    restartBtn.addEventListener('click', () => startGame());

    // ═══ GAME LOGIC ═══
    function startGame() {
        state = 'playing';
        score = 0; lives = MAX_LIVES; combo = 0; maxCombo = 0; totalSliced = 0;
        fruits = []; particles = []; splashes = []; textPopups = []; shockwaves = [];
        lastSpawnTime = Date.now(); nextSpawnDelay = 2200; difficultyTimer = Date.now();
        frameCount = 0; comboTimer = 0;
        palmHoverTarget = null; palmHoverProgress = 0;

        scoreDisplay.textContent = '0';
        startScreen.classList.add('hidden');
        gameoverScreen.classList.add('hidden');
        palmCursorEl.classList.remove('active');
        updateLivesDisplay();
    }

    function gameOver() {
        state = 'dead';
        if (score > highScore) { highScore = score; localStorage.setItem('fruit-ninja-high', highScore.toString()); }
        highScoreDisplay.textContent = 'BEST: ' + highScore;

        setTimeout(() => {
            document.getElementById('go-score').textContent = `Score: ${score}`;
            document.getElementById('go-best').textContent = `Best: ${highScore}`;
            document.getElementById('go-stats').textContent = `${totalSliced} fruits shot · Best combo: ${maxCombo}x`;
            const msg = score === 0 ? '💀 Nothing hit!' : score < 10 ? '🔫 Target practice...' : score < 25 ? '🎯 Getting accurate!' : score < 50 ? '⚡ Sharpshooter!' : score < 100 ? '🔥 Dual-wield master!' : '👑 LEGENDARY GUNNER!';
            document.getElementById('go-message').textContent = msg;
            gameoverScreen.classList.remove('hidden');
        }, 600);
    }

    function updateLivesDisplay() {
        const hearts = livesDisplay.querySelectorAll('.life');
        hearts.forEach((h, i) => h.classList.toggle('lost', i >= lives));
    }

    function spawnFruit() {
        const isBomb = Math.random() < 0.10;
        const type = isBomb ? BOMB_TYPE : FRUIT_TYPES[Math.floor(Math.random() * FRUIT_TYPES.length)];
        const margin = 80;
        const x = margin + Math.random() * (canvas.width - margin * 2);
        const radius = FRUIT_RADIUS_MIN + Math.random() * (FRUIT_RADIUS_MAX - FRUIT_RADIUS_MIN);
        const elapsed = (Date.now() - difficultyTimer) / 1000;
        const fallSpeed = 0.5 + elapsed * 0.006 + Math.random() * 0.35;
        const vx = (Math.random() - 0.5) * 0.6;
        fruits.push({ x, y: -radius - 20, vx, vy: fallSpeed, radius, rotation: Math.random() * Math.PI * 2, rotationSpeed: (Math.random() - 0.5) * 0.03, type, isBomb, hit: false, missed: false, lockGlow: 0 });
    }

    function shootFruit(fruit, handIdx) {
        fruit.hit = true; totalSliced++;
        const jc = fruit.type.juiceColor, ic = fruit.type.innerColor;
        for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5; particles.push({ x: fruit.x, y: fruit.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, decay: 0.015 + Math.random() * 0.015, size: 3 + Math.random() * 5, color: Math.random() > 0.5 ? jc : ic, gravity: 0.1 }); }
        splashes.push({ x: fruit.x, y: fruit.y, radius: fruit.radius * 1.2, color: jc, life: 1, decay: 0.006 });
        const pts = fruit.type.points || 1; score += pts; scoreDisplay.textContent = score;
        combo++; comboTimer = Date.now(); if (combo > maxCombo) maxCombo = combo;
        if (combo >= 3) { const bonus = combo; score += bonus; scoreDisplay.textContent = score; comboDisplay.textContent = `🔥 ${combo}x COMBO +${bonus}`; comboDisplay.classList.remove('hidden'); comboDisplay.style.animation = 'none'; void comboDisplay.offsetWidth; comboDisplay.style.animation = 'comboPulse 0.4s ease'; playComboSound(combo); textPopups.push({ x: fruit.x, y: fruit.y - 30, text: `${combo}x COMBO!`, life: 1, decay: 0.02, vy: -1.5, color: '#ff8800', size: 26 + combo * 2 }); } else { comboDisplay.classList.add('hidden'); }
        textPopups.push({ x: fruit.x, y: fruit.y, text: `+${pts}`, life: 1, decay: 0.025, vy: -2, color: '#fff', size: 22 });
        playShootSound();
    }

    function explodeFruit(fruit) {
        fruit.hit = true; totalSliced++;
        const jc = fruit.type.juiceColor, ic = fruit.type.innerColor;
        for (let i = 0; i < 35; i++) { const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 10; particles.push({ x: fruit.x, y: fruit.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 1, decay: 0.01 + Math.random() * 0.012, size: 4 + Math.random() * 8, color: ['#ff4400', '#ffcc00', '#fff', jc, ic][Math.floor(Math.random() * 5)], gravity: 0.08 }); }
        splashes.push({ x: fruit.x, y: fruit.y, radius: fruit.radius * 2.5, color: jc, life: 1, decay: 0.003 });
        shockwaves.push({ x: fruit.x, y: fruit.y, radius: 0, maxRadius: 150, life: 1, decay: 0.025, color: ic });
        const pts = (fruit.type.points || 1) * 3; score += pts; scoreDisplay.textContent = score;
        combo++; comboTimer = Date.now(); if (combo > maxCombo) maxCombo = combo;
        if (combo >= 3) { const bonus = combo * 2; score += bonus; scoreDisplay.textContent = score; comboDisplay.textContent = `💥 ${combo}x MEGA +${bonus}`; comboDisplay.classList.remove('hidden'); comboDisplay.style.animation = 'none'; void comboDisplay.offsetWidth; comboDisplay.style.animation = 'comboPulse 0.4s ease'; playComboSound(combo); }
        textPopups.push({ x: fruit.x, y: fruit.y - 20, text: `💥 +${pts}`, life: 1, decay: 0.018, vy: -2.5, color: '#ffcc00', size: 32 });
        playExplodeSound();
    }

    function hitBomb(fruit) {
        fruit.hit = true;
        for (let i = 0; i < 30; i++) { const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 8; particles.push({ x: fruit.x, y: fruit.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 0.012 + Math.random() * 0.01, size: 4 + Math.random() * 8, color: ['#ff4400', '#ffcc00', '#ff0000', '#333'][Math.floor(Math.random() * 4)], gravity: 0.08 }); }
        shockwaves.push({ x: fruit.x, y: fruit.y, radius: 0, maxRadius: 200, life: 1, decay: 0.02, color: '#ff0000' });
        playBombSound(); gameOver();
    }

    // ═══════════════════════════════════════
    //  DRAWING
    // ═══════════════════════════════════════

    function drawBackground() {
        const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
        g.addColorStop(0, '#0a0810'); g.addColorStop(0.5, '#150f0c'); g.addColorStop(1, '#080608');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Subtle texture
        ctx.globalAlpha = 0.03;
        ctx.strokeStyle = '#886644';
        ctx.lineWidth = 1;
        for (let y = 0; y < canvas.height; y += 8) {
            ctx.beginPath();
            ctx.moveTo(0, y + Math.sin(y * 0.04) * 2);
            ctx.lineTo(canvas.width, y + Math.sin(y * 0.04 + 1.5) * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawSplashes() {
        for (let i = splashes.length - 1; i >= 0; i--) {
            const s = splashes[i]; s.life -= s.decay; if (s.life <= 0) { splashes.splice(i, 1); continue; }
            ctx.globalAlpha = s.life * 0.25; ctx.fillStyle = s.color;
            ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2); ctx.fill();
            for (let d = 0; d < 4; d++) { const dx = Math.sin(d * 1.7 + s.x * 0.01) * s.radius * 0.5, dy = (1 - s.life) * 50 + d * 14; ctx.beginPath(); ctx.arc(s.x + dx, s.y + dy, 3, 0, Math.PI * 2); ctx.fill(); }
        } ctx.globalAlpha = 1;
    }

    function drawShockwaves() {
        for (let i = shockwaves.length - 1; i >= 0; i--) {
            const sw = shockwaves[i]; sw.radius += (sw.maxRadius - sw.radius) * 0.12; sw.life -= sw.decay;
            if (sw.life <= 0) { shockwaves.splice(i, 1); continue; }
            ctx.strokeStyle = sw.color; ctx.globalAlpha = sw.life * 0.5; ctx.lineWidth = 3 * sw.life;
            ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = sw.life * 0.15; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(sw.x, sw.y, sw.radius * 0.6, 0, Math.PI * 2); ctx.stroke();
        } ctx.globalAlpha = 1;
    }

    function drawFruit(fruit) {
        if (fruit.hit) return;
        ctx.save(); ctx.translate(fruit.x, fruit.y); ctx.rotate(fruit.rotation);
        if (fruit.lockGlow > 0) { ctx.shadowColor = fruit.isBomb ? 'rgba(255,0,0,0.6)' : 'rgba(255,200,50,0.6)'; ctx.shadowBlur = 15 + fruit.lockGlow * 20; }
        else { ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4; }
        fruit.type.draw(ctx, fruit.radius);
        ctx.shadowColor = 'transparent'; ctx.restore();
    }

    // ═══ SCI-FI RING CROSSHAIR ═══
    function drawRing(hand, time) {
        if (!hand.visible || hand.gesture !== 'point') return;
        const cx = hand.screenX, cy = hand.screenY;
        const pulse = Math.sin(time * 0.008) * 3;
        const r = RING_RADIUS + pulse;
        const isOvl = ringsOverlapping;
        const col = isOvl ? '#ffcc00' : '#00ddff';

        ctx.strokeStyle = isOvl ? 'rgba(255,200,0,0.12)' : 'rgba(0,200,255,0.12)';
        ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.stroke();

        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.shadowColor = col; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

        ctx.lineWidth = 1.5; ctx.globalAlpha = 0.45;
        const rot = time * 0.002;
        for (let i = 0; i < 4; i++) { const a = rot + (i * Math.PI / 2); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (r * 0.35), cy + Math.sin(a) * (r * 0.35)); ctx.lineTo(cx + Math.cos(a) * (r + 4), cy + Math.sin(a) * (r + 4)); ctx.stroke(); }
        ctx.globalAlpha = 1;

        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();

        ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.globalAlpha = 0.25;
        const ir = r * 0.55;
        for (let i = 0; i < 8; i++) { const sa = rot * 1.3 + (i / 8) * Math.PI * 2; ctx.beginPath(); ctx.arc(cx, cy, ir, sa, sa + 0.2); ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

        if (hand.ringPulse > 0) { ctx.globalAlpha = hand.ringPulse; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r * 1.3 * (1 - hand.ringPulse * 0.5), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; hand.ringPulse -= 0.06; }
    }

    function drawRingConnection(time) {
        if (!handData[0].visible || handData[0].gesture !== 'point' || !handData[1].visible || handData[1].gesture !== 'point') return;
        const ax = handData[0].screenX, ay = handData[0].screenY, bx = handData[1].screenX, by = handData[1].screenY;
        const dist = Math.hypot(bx - ax, by - ay);
        if (dist > 400) return;
        const closeness = 1 - Math.min(1, dist / 400);
        ctx.strokeStyle = ringsOverlapping ? `rgba(255,204,0,${closeness * 0.5})` : `rgba(0,200,255,${closeness * 0.3})`;
        ctx.lineWidth = 1; ctx.setLineDash([8, 8]); ctx.lineDashOffset = -time * 0.05;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
        if (closeness > 0.5 && frameCount % 3 === 0) { const t = Math.random(); particles.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 1, decay: 0.05, size: 2 + Math.random() * 2, color: ringsOverlapping ? '#ffcc00' : '#00ddff', gravity: 0 }); }
    }

    function drawParticles() {
        for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += p.gravity || 0.1; p.vx *= 0.98; p.life -= p.decay; if (p.life <= 0) { particles.splice(i, 1); continue; } ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
    }

    function drawTextPopups() {
        for (let i = textPopups.length - 1; i >= 0; i--) { const t = textPopups[i]; t.y += t.vy; t.life -= t.decay; if (t.life <= 0) { textPopups.splice(i, 1); continue; } ctx.globalAlpha = t.life; ctx.font = `800 ${Math.min(t.size, 48)}px 'Outfit',sans-serif`; ctx.fillStyle = t.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; ctx.fillText(t.text, t.x, t.y); ctx.shadowColor = 'transparent'; }
        ctx.globalAlpha = 1;
    }

    // ═══ GAME UPDATE ═══
    function update() {
        if (state !== 'playing') return;
        const now = Date.now();
        frameCount++;

        if (combo > 0 && now - comboTimer > 800) { combo = 0; comboDisplay.classList.add('hidden'); }

        const elapsed = (now - difficultyTimer) / 1000;
        const minDelay = Math.max(400, 1800 - elapsed * 12);
        const maxDelay = Math.max(800, 2500 - elapsed * 15);
        const batchMin = Math.min(3, 1 + Math.floor(elapsed / 25));
        const batchMax = Math.min(5, 1 + Math.floor(elapsed / 15));

        if (now - lastSpawnTime > nextSpawnDelay) {
            const count = batchMin + Math.floor(Math.random() * (batchMax - batchMin + 1));
            for (let i = 0; i < count; i++) setTimeout(() => { if (state === 'playing') spawnFruit(); }, i * 150);
            lastSpawnTime = now;
            nextSpawnDelay = minDelay + Math.random() * (maxDelay - minDelay);
        }

        // Ring overlap
        ringsOverlapping = false;
        if (handData[0].visible && handData[0].gesture === 'point' && handData[1].visible && handData[1].gesture === 'point') {
            const dist = Math.hypot(handData[0].screenX - handData[1].screenX, handData[0].screenY - handData[1].screenY);
            ringsOverlapping = dist < DUAL_RING_OVERLAP_DIST;
        }

        // Update fruits
        for (let i = fruits.length - 1; i >= 0; i--) {
            const f = fruits[i];
            if (f.hit) { fruits.splice(i, 1); continue; }
            f.x += f.vx; f.y += f.vy; f.rotation += f.rotationSpeed;
            if (f.x < f.radius) { f.x = f.radius; f.vx = Math.abs(f.vx) * 0.5; }
            if (f.x > canvas.width - f.radius) { f.x = canvas.width - f.radius; f.vx = -Math.abs(f.vx) * 0.5; }
            f.lockGlow = 0;

            for (let h = 0; h < 2; h++) {
                const hand = handData[h];
                if (!hand.visible || hand.gesture !== 'point') continue;
                const dx = hand.screenX - f.x, dy = hand.screenY - f.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < RING_HIT_RADIUS + f.radius) {
                    f.lockGlow = Math.max(f.lockGlow, 1 - dist / (RING_HIT_RADIUS + f.radius));
                    if (ringsOverlapping) {
                        if (f.isBomb) { hitBomb(f); return; }
                        explodeFruit(f); handData[0].ringPulse = 1; handData[1].ringPulse = 1; break;
                    }
                    if (now - hand.lastShootTime > SHOOT_COOLDOWN) {
                        if (f.isBomb) { hitBomb(f); return; }
                        shootFruit(f, h); hand.lastShootTime = now; hand.ringPulse = 1; break;
                    }
                }
            }

            if (f.y > canvas.height + f.radius + 20 && !f.missed && !f.hit) {
                f.missed = true;
                if (!f.isBomb) {
                    lives--; updateLivesDisplay();
                    textPopups.push({ x: f.x, y: canvas.height - 40, text: '✕ MISS', life: 1, decay: 0.03, vy: -1.5, color: '#ff3333', size: 24 });
                    if (lives <= 0) { gameOver(); return; }
                }
            }
            if (f.y > canvas.height + 100) fruits.splice(i, 1);
        }
    }

    // ═══ RENDER LOOP ═══
    function render() {
        const now = performance.now();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Detect hands synchronously — zero lag!
        detectHands();

        // Palm UI control (menus)
        updatePalmUI();

        drawBackground();
        drawSplashes();
        drawShockwaves();
        for (const f of fruits) drawFruit(f);
        drawRingConnection(now);
        drawRing(handData[0], now);
        drawRing(handData[1], now);
        drawParticles();
        drawTextPopups();

        update();
        requestAnimationFrame(render);
    }

    // ═══ INIT ═══
    initHandTracking();
    render();

})();
