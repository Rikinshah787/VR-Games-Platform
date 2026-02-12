/* ═══════════════════════════════════════════════════════════
   🐦 FLAPPY FINGER — Game Engine (flappy.js)
   Canvas-based Flappy Bird controlled by hand tracking
   Uses shared HandCursor framework
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ═══ CANVAS SETUP ═══
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // ═══ GAME CONSTANTS ═══
  const PIPE_WIDTH = 70;
  const PIPE_GAP = 250;          // gap between top and bottom pipe (wider = easier)
  const PIPE_SPEED = 2.2;
  const PIPE_SPACING_PX = 280;   // minimum pixel distance between pipes
  const BIRD_SIZE = 36;
  const BIRD_X = 0.2;            // bird's fixed X position (20% from left)
  const GROUND_HEIGHT = 80;
  const GRAVITY = 0.28;
  const FLAP_STRENGTH = -6;
  const FINGER_SMOOTHING = 0.22;
  const FINGER_CONTROL_STRENGTH = 0.25;

  // ═══ GAME STATE ═══
  let state = 'menu';            // menu, playing, dead
  let score = 0;
  let highScore = parseInt(localStorage.getItem('flappy-high') || '0');
  let bird = { x: 0, y: 0, vy: 0, angle: 0, frame: 0 };
  let pipes = [];
  let particles = [];
  let lastPipeTime = 0;
  let frameCount = 0;
  let groundOffset = 0;

  // Finger tracking
  let fingerY = 0.5;             // normalized 0..1
  let targetFingerY = 0.5;
  let fingerVisible = false;
  let isPinching = false;

  // Palm UI state
  const PALM_HOLD_TIME = 800;
  let palmCursorX = 0, palmCursorY = 0;
  let palmVisible = false;
  let palmHoverTarget = null;
  let palmHoverStartTime = 0;
  let palmHoverProgress = 0;

  // Hand skeleton
  let skeletonCanvas = null, skeletonCtx = null;
  const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],       // Index
    [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
    [0, 13], [13, 14], [14, 15], [15, 16],// Ring
    [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
    [5, 9], [9, 13], [13, 17]             // Palm
  ];

  // ═══ DOM ═══
  const scoreDisplay = document.getElementById('score-display');
  const highScoreDisplay = document.getElementById('high-score');
  const startScreen = document.getElementById('start-screen');
  const startBtn = document.getElementById('start-btn');
  const cameraStatus = document.getElementById('camera-status');
  const gameoverScreen = document.getElementById('gameover-screen');
  const restartBtn = document.getElementById('restart-btn');
  const fingerIndicator = document.getElementById('finger-indicator');
  const palmCursorEl = document.getElementById('palm-cursor');
  const cursorFillEl = palmCursorEl.querySelector('.cursor-fill');

  highScoreDisplay.textContent = 'BEST: ' + highScore;

  // ═══ COLORS ═══
  const COLORS = {
    sky: ['#4ec0ca', '#71c5ce', '#87ceeb'],
    pipe: { body: '#73bf2e', border: '#558b2f', cap: '#8bc34a', capBorder: '#558b2f' },
    bird: { body: '#f5c542', wing: '#e6a817', beak: '#e65100', eye: '#fff', pupil: '#333' },
    ground: { top: '#ded895', bottom: '#d2963a', grass: '#8bc34a' },
    cloud: 'rgba(255,255,255,0.6)'
  };

  // ═══ CLOUD DATA ═══
  let clouds = [];
  for (let i = 0; i < 5; i++) {
    clouds.push({
      x: Math.random() * canvas.width,
      y: 50 + Math.random() * (canvas.height * 0.3),
      w: 80 + Math.random() * 100,
      speed: 0.3 + Math.random() * 0.5
    });
  }

  // ═══ HAND TRACKER SETUP ═══
  const handTracker = new HandCursor({
    cursorParent: document.body,
    onReady: () => {
      cameraStatus.textContent = '✅ Camera ready — Show your palm to start!';
      startBtn.textContent = '🐦 START GAME';
      startBtn.disabled = false;

      // Pipe hand-tracker camera to preview
      const previewCam = document.getElementById('preview-cam');
      const stream = handTracker.getStream();
      if (previewCam && stream) previewCam.srcObject = stream;

      // Init skeleton canvas
      skeletonCanvas = document.getElementById('webcam-skeleton-preview');
      if (skeletonCanvas && previewCam) {
        // Wait for video to have dimensions
        previewCam.addEventListener('loadeddata', () => {
          skeletonCanvas.width = previewCam.videoWidth;
          skeletonCanvas.height = previewCam.videoHeight;
        });
        skeletonCtx = skeletonCanvas.getContext('2d');
      }
    },
    onError: (err) => {
      cameraStatus.textContent = '❌ Camera error: ' + err.message;
      startBtn.textContent = '🐦 START (use SPACE)';
      startBtn.disabled = false;
    },
    onMove: (x, y) => {
      targetFingerY = y;
      fingerVisible = true;

      // Update finger indicator
      fingerIndicator.style.opacity = '1';
      fingerIndicator.style.left = (x * window.innerWidth) + 'px';
      fingerIndicator.style.top = (y * window.innerHeight) + 'px';
    },
    onPalmOpen: (x, y) => {
      palmCursorX = x * window.innerWidth;
      palmCursorY = y * window.innerHeight;
      palmVisible = true;
    },
    onPinch: () => {
      isPinching = true;
      if (state === 'playing') {
        bird.vy = FLAP_STRENGTH;
        spawnFlapParticles();
      }
    },
    onRelease: () => {
      isPinching = false;
    },
    onResults: (results) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        drawHandSkeleton(results.multiHandLandmarks[0]);
      } else if (skeletonCtx) {
        skeletonCtx.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
      }
    }
  });

  // Hide framework cursor — we use our own finger indicator
  handTracker.init().then(() => {
    if (handTracker.cursorEl) handTracker.cursorEl.style.display = 'none';
  });

  function drawHandSkeleton(landmarks) {
    if (!skeletonCtx || !skeletonCanvas) return;
    const w = skeletonCanvas.width;
    const h = skeletonCanvas.height;
    skeletonCtx.clearRect(0, 0, w, h);

    skeletonCtx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
    skeletonCtx.lineWidth = 2;

    // Connections
    for (const [a, b] of HAND_CONNECTIONS) {
      const ax = landmarks[a].x * w, ay = landmarks[a].y * h;
      const bx = landmarks[b].x * w, by = landmarks[b].y * h;
      skeletonCtx.beginPath();
      skeletonCtx.moveTo(ax, ay);
      skeletonCtx.lineTo(bx, by);
      skeletonCtx.stroke();
    }

    // Dots
    skeletonCtx.fillStyle = '#00ffff';
    for (const lm of landmarks) {
      skeletonCtx.beginPath();
      skeletonCtx.arc(lm.x * w, lm.y * h, 3, 0, Math.PI * 2);
      skeletonCtx.fill();
    }
  }

  // ═══ PALM HOVER-TO-SELECT ═══
  function updatePalmUI() {
    // Only show palm cursor outside gameplay
    if (!palmVisible || state === 'playing') {
      palmCursorEl.classList.remove('active');
      palmHoverTarget = null;
      palmHoverProgress = 0;
      startBtn.classList.remove('palm-hover');
      restartBtn.classList.remove('palm-hover');
      document.getElementById('back-to-hub').classList.remove('palm-hover');
      cursorFillEl.style.background = `conic-gradient(from 0deg, rgba(255,200,0,0.6) 0%, transparent 0%)`;
      palmVisible = false;
      return;
    }

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

    // Check back button (always available in menu or gameover)
    if (state !== 'playing') {
      const backBtn = document.getElementById('back-to-hub');
      const rect = backBtn.getBoundingClientRect();
      if (palmCursorX >= rect.left - 20 && palmCursorX <= rect.right + 20 &&
        palmCursorY >= rect.top - 20 && palmCursorY <= rect.bottom + 20) {
        currentTarget = 'back';
      }
    }

    if (currentTarget !== palmHoverTarget) {
      palmHoverTarget = currentTarget;
      palmHoverStartTime = currentTarget ? Date.now() : 0;
      palmHoverProgress = 0;
    }

    startBtn.classList.toggle('palm-hover', currentTarget === 'start');
    restartBtn.classList.toggle('palm-hover', currentTarget === 'restart');
    document.getElementById('back-to-hub').classList.toggle('palm-hover', currentTarget === 'back');
    palmCursorEl.classList.toggle('hover', currentTarget !== null);

    if (currentTarget) {
      palmHoverProgress = Math.min(1, (Date.now() - palmHoverStartTime) / PALM_HOLD_TIME);
      cursorFillEl.style.background = `conic-gradient(from 0deg, rgba(255,200,0,0.6) ${palmHoverProgress * 360}deg, transparent ${palmHoverProgress * 360}deg)`;

      if (palmHoverProgress >= 1) {
        if (currentTarget === 'start' || currentTarget === 'restart') startGame();
        if (currentTarget === 'back') window.location.href = '../../index.html';
        palmHoverTarget = null;
        palmHoverProgress = 0;
      }
    } else {
      cursorFillEl.style.background = `conic-gradient(from 0deg, rgba(0,200,255,0.4) 0%, transparent 0%)`;
    }

    palmVisible = false; // Reset each frame, re-set by onPalmOpen callback
  }

  // ═══ KEYBOARD FALLBACK ═══
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (state === 'playing') {
        bird.vy = FLAP_STRENGTH;
        spawnFlapParticles();
      } else if (state === 'dead') {
        startGame();
      }
    }
  });

  // ═══ BUTTON HANDLERS ═══
  startBtn.addEventListener('click', () => {
    startGame();
  });

  restartBtn.addEventListener('click', () => {
    startGame();
  });

  // ═══ START GAME ═══
  function startGame() {
    state = 'playing';
    score = 0;
    pipes = [];
    particles = [];
    lastPipeTime = 0;
    frameCount = 0;

    bird.x = BIRD_X * canvas.width;
    bird.y = canvas.height * 0.4;
    bird.vy = 0;
    bird.angle = 0;
    bird.frame = 0;

    scoreDisplay.textContent = '0';
    startScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
  }

  // ═══ GAME OVER ═══
  function gameOver() {
    state = 'dead';

    if (score > highScore) {
      highScore = score;
      localStorage.setItem('flappy-high', highScore.toString());
    }

    highScoreDisplay.textContent = 'BEST: ' + highScore;

    // Explosion particles
    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 6;
      particles.push({
        x: bird.x, y: bird.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1, decay: 0.015 + Math.random() * 0.01,
        size: 3 + Math.random() * 5,
        color: ['#f5c542', '#e6a817', '#ff6600', '#fff'][Math.floor(Math.random() * 4)]
      });
    }

    setTimeout(() => {
      document.getElementById('go-score').textContent = `Score: ${score}`;
      document.getElementById('go-best').textContent = `Best: ${highScore}`;
      const messages = [
        score === 0 ? '💀 That was rough!' :
          score < 5 ? '🐣 Keep trying!' :
            score < 15 ? '🐥 Not bad!' :
              score < 30 ? '🐦 Great flying!' :
                score < 50 ? '🦅 Amazing!' : '👑 LEGENDARY!'
      ];
      document.getElementById('go-message').textContent = messages[0];
      gameoverScreen.classList.remove('hidden');
    }, 800);
  }

  // ═══ SPAWN PIPE ═══
  function spawnPipe() {
    let minY = 120;
    let maxY = canvas.height - GROUND_HEIGHT - PIPE_GAP - 120;

    // Safety: ensure valid range on small viewports
    if (maxY <= minY) maxY = minY + 50;

    const gapY = Math.max(minY, Math.min(maxY, minY + Math.random() * (maxY - minY)));

    pipes.push({
      x: canvas.width + PIPE_WIDTH,
      gapY: gapY,
      scored: false
    });
  }

  // ═══ FLAP PARTICLES ═══
  function spawnFlapParticles() {
    for (let i = 0; i < 5; i++) {
      particles.push({
        x: bird.x - 10,
        y: bird.y + (Math.random() - 0.5) * 15,
        vx: -(1 + Math.random() * 2),
        vy: (Math.random() - 0.5) * 2,
        life: 1, decay: 0.04 + Math.random() * 0.02,
        size: 2 + Math.random() * 3,
        color: 'rgba(255,255,255,0.7)'
      });
    }
  }

  // ═══ SCORE PARTICLES ═══
  function spawnScoreParticles() {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      particles.push({
        x: bird.x + 40, y: bird.y,
        vx: Math.cos(angle) * 3,
        vy: Math.sin(angle) * 3 - 1,
        life: 1, decay: 0.03,
        size: 3 + Math.random() * 3,
        color: '#ffcc00'
      });
    }
  }

  // ═══════════════════════════════════════════════
  //  DRAWING FUNCTIONS
  // ═══════════════════════════════════════════════

  function drawSky() {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height - GROUND_HEIGHT);
    grad.addColorStop(0, COLORS.sky[0]);
    grad.addColorStop(0.5, COLORS.sky[1]);
    grad.addColorStop(1, COLORS.sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height - GROUND_HEIGHT);
  }

  function drawClouds() {
    ctx.fillStyle = COLORS.cloud;
    clouds.forEach(c => {
      c.x -= c.speed;
      if (c.x + c.w < 0) { c.x = canvas.width + 50; c.y = 50 + Math.random() * canvas.height * 0.3; }
      // Draw cloud as overlapping circles
      const r = c.w * 0.25;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.arc(c.x + r, c.y - r * 0.5, r * 0.8, 0, Math.PI * 2);
      ctx.arc(c.x + r * 1.5, c.y, r * 0.9, 0, Math.PI * 2);
      ctx.arc(c.x - r * 0.5, c.y + r * 0.2, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawGround() {
    const y = canvas.height - GROUND_HEIGHT;

    // Grass strip
    ctx.fillStyle = COLORS.ground.grass;
    ctx.fillRect(0, y, canvas.width, 8);

    // Ground body
    const grad = ctx.createLinearGradient(0, y + 8, 0, canvas.height);
    grad.addColorStop(0, COLORS.ground.top);
    grad.addColorStop(1, COLORS.ground.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, y + 8, canvas.width, GROUND_HEIGHT);

    // Scrolling stripe pattern
    if (state === 'playing') groundOffset = (groundOffset + PIPE_SPEED) % 24;
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 2;
    for (let x = -groundOffset; x < canvas.width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, y + 12);
      ctx.lineTo(x + 12, canvas.height);
      ctx.stroke();
    }
  }

  function drawPipe(pipe) {
    const x = pipe.x;
    const topH = pipe.gapY;
    const botY = pipe.gapY + PIPE_GAP;
    const botH = canvas.height - GROUND_HEIGHT - botY;
    const capH = 26;
    const capExtra = 8;

    // === TOP PIPE ===
    // Body
    const topGrad = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
    topGrad.addColorStop(0, '#5a9e1e');
    topGrad.addColorStop(0.3, '#73bf2e');
    topGrad.addColorStop(0.7, '#73bf2e');
    topGrad.addColorStop(1, '#4a8518');
    ctx.fillStyle = topGrad;
    ctx.fillRect(x, 0, PIPE_WIDTH, topH - capH);
    // Border
    ctx.strokeStyle = COLORS.pipe.capBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, 0, PIPE_WIDTH, topH - capH);
    // Cap
    ctx.fillStyle = COLORS.pipe.cap;
    ctx.fillRect(x - capExtra, topH - capH, PIPE_WIDTH + capExtra * 2, capH);
    ctx.strokeRect(x - capExtra, topH - capH, PIPE_WIDTH + capExtra * 2, capH);
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + 6, 0, 8, topH - capH);

    // === BOTTOM PIPE ===
    const botGrad = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
    botGrad.addColorStop(0, '#5a9e1e');
    botGrad.addColorStop(0.3, '#73bf2e');
    botGrad.addColorStop(0.7, '#73bf2e');
    botGrad.addColorStop(1, '#4a8518');
    ctx.fillStyle = botGrad;
    ctx.fillRect(x, botY + capH, PIPE_WIDTH, botH - capH);
    ctx.strokeStyle = COLORS.pipe.capBorder;
    ctx.strokeRect(x, botY + capH, PIPE_WIDTH, botH - capH);
    // Cap
    ctx.fillStyle = COLORS.pipe.cap;
    ctx.fillRect(x - capExtra, botY, PIPE_WIDTH + capExtra * 2, capH);
    ctx.strokeRect(x - capExtra, botY, PIPE_WIDTH + capExtra * 2, capH);
    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + 6, botY + capH, 8, botH - capH);
  }

  function drawBird() {
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(bird.angle);

    const s = BIRD_SIZE;

    // Wing (behind body)
    bird.frame += 0.15;
    const wingFlap = Math.sin(bird.frame * 5) * 8;
    ctx.fillStyle = COLORS.bird.wing;
    ctx.beginPath();
    ctx.ellipse(-5, wingFlap, s * 0.35, s * 0.55, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c49010';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Body
    ctx.fillStyle = COLORS.bird.body;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d4a520';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Belly
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(4, 4, s * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Eye white
    ctx.fillStyle = COLORS.bird.eye;
    ctx.beginPath();
    ctx.arc(s * 0.2, -s * 0.15, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pupil
    ctx.fillStyle = COLORS.bird.pupil;
    ctx.beginPath();
    ctx.arc(s * 0.25, -s * 0.15, s * 0.1, 0, Math.PI * 2);
    ctx.fill();

    // Eye shine
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s * 0.3, -s * 0.22, s * 0.04, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = COLORS.bird.beak;
    ctx.beginPath();
    ctx.moveTo(s * 0.4, -3);
    ctx.lineTo(s * 0.7, 2);
    ctx.lineTo(s * 0.4, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#bf3600';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.life -= p.decay;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ═══════════════════════════════════════════════
  //  GAME UPDATE
  // ═══════════════════════════════════════════════

  function update() {
    if (state !== 'playing') return;

    const now = Date.now();
    frameCount++;

    // ── Smooth finger tracking ──
    fingerY += (targetFingerY - fingerY) * FINGER_SMOOTHING;

    // ── Bird physics ──
    // The bird is pulled toward the finger Y position
    const targetY = fingerY * (canvas.height - GROUND_HEIGHT);
    const pull = (targetY - bird.y) * FINGER_CONTROL_STRENGTH;

    // Combine finger control with gravity
    bird.vy += GRAVITY;
    bird.vy += pull;

    // Dampen velocity so bird doesn't oscillate wildly
    bird.vy *= 0.88;

    // Clamp velocity
    bird.vy = Math.max(-10, Math.min(10, bird.vy));

    bird.y += bird.vy;

    // Bird angle based on velocity
    bird.angle = Math.max(-0.5, Math.min(Math.PI / 4, bird.vy * 0.06));

    // ── Ceiling ──
    if (bird.y < BIRD_SIZE) {
      bird.y = BIRD_SIZE;
      bird.vy = 1;
    }

    // ── Ground collision ──
    if (bird.y > canvas.height - GROUND_HEIGHT - BIRD_SIZE * 0.5) {
      bird.y = canvas.height - GROUND_HEIGHT - BIRD_SIZE * 0.5;
      gameOver();
      return;
    }

    // ── Spawn pipes (distance-based for consistent spacing) ──
    const lastPipe = pipes[pipes.length - 1];
    if (!lastPipe || (canvas.width + PIPE_WIDTH - lastPipe.x) >= PIPE_SPACING_PX) {
      spawnPipe();
    }

    // ── Move & check pipes ──
    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= PIPE_SPEED;

      // Score when passing pipe
      if (!p.scored && p.x + PIPE_WIDTH < bird.x) {
        p.scored = true;
        score++;
        scoreDisplay.textContent = score;
        spawnScoreParticles();
      }

      // Remove off-screen pipes
      if (p.x + PIPE_WIDTH < -10) {
        pipes.splice(i, 1);
        continue;
      }

      // Collision detection
      const birdL = bird.x - BIRD_SIZE * 0.4;
      const birdR = bird.x + BIRD_SIZE * 0.4;
      const birdT = bird.y - BIRD_SIZE * 0.4;
      const birdB = bird.y + BIRD_SIZE * 0.4;

      const pipeL = p.x;
      const pipeR = p.x + PIPE_WIDTH;
      const topPipeB = p.gapY;
      const botPipeT = p.gapY + PIPE_GAP;

      // Check horizontal overlap
      if (birdR > pipeL && birdL < pipeR) {
        // Check top pipe
        if (birdT < topPipeB) {
          gameOver();
          return;
        }
        // Check bottom pipe
        if (birdB > botPipeT) {
          gameOver();
          return;
        }
      }
    }
  }

  // ═══ RENDER LOOP ═══
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Palm UI control (menus)
    updatePalmUI();

    drawSky();
    drawClouds();

    // Pipes
    pipes.forEach(drawPipe);

    // Bird
    if (state !== 'menu') drawBird();

    // Ground (on top of pipes)
    drawGround();

    // Particles
    drawParticles();

    // Finger guide line (while playing)
    if (state === 'playing' && fingerVisible) {
      const fy = fingerY * (canvas.height - GROUND_HEIGHT);
      ctx.setLineDash([8, 8]);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bird.x, bird.y);
      ctx.lineTo(bird.x + 80, fy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    update();
    requestAnimationFrame(render);
  }

  // ═══ START ═══
  render();

})();
