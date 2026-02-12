/* ═══════════════════════════════════════════════════════════
   🥊 KNOCKOUT — Main Application (app.js)
   Wires camera → hand tracking → boxing → game → opponent
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ═══ SYSTEMS ═══
  const boxing = new BoxingTracker();
  const opponent = new OpponentAI();
  const sound = new SoundEngine();
  const vfx = new VFXEngine();
  const game = new GameEngine();

  // ═══ DOM ═══
  const video = document.getElementById('webcam');
  const handCanvas = document.getElementById('hand-overlay');
  const handCtx = handCanvas.getContext('2d');
  const leftFist = document.getElementById('player-left-fist');
  const rightFist = document.getElementById('player-right-fist');
  const guardIndicator = document.getElementById('guard-indicator');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');
  const cameraStatus = document.getElementById('camera-status');

  let cameraReady = false;

  // ═══ MEDIAPIPE HANDS SETUP ═══
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });

  hands.onResults(onHandResults);

  // ═══ CAMERA INIT ═══
  async function initCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
      });
      video.srcObject = stream;
      await video.play();

      // Resize hand overlay
      handCanvas.width = video.videoWidth || 1280;
      handCanvas.height = video.videoHeight || 720;

      cameraReady = true;
      cameraStatus.textContent = '✅ Camera ready — Both hands detected!';
      startBtn.textContent = '🥊 START FIGHT';
      startBtn.disabled = false;

      // Start sending frames
      sendFrame();
    } catch (err) {
      cameraStatus.textContent = '❌ Camera error: ' + err.message;
      console.error('Camera error:', err);
    }
  }

  async function sendFrame() {
    if (!cameraReady) return;
    try {
      await hands.send({ image: video });
    } catch (e) { /* ignore frame errors */ }
    requestAnimationFrame(sendFrame);
  }

  // ═══ HAND RESULTS HANDLER ═══
  function onHandResults(results) {
    // Draw hands on overlay (subtle)
    handCtx.clearRect(0, 0, handCanvas.width, handCanvas.height);

    if (results.multiHandLandmarks) {
      for (const landmarks of results.multiHandLandmarks) {
        drawConnectors(handCtx, landmarks, HAND_CONNECTIONS, { color: 'rgba(0,150,255,0.3)', lineWidth: 2 });
        drawLandmarks(handCtx, landmarks, { color: 'rgba(0,200,255,0.4)', lineWidth: 1, radius: 2 });
      }
    }

    // Update boxing tracker
    boxing.update(results);

    // Update fist positions on screen
    updateFistPositions();
  }

  // ═══ FIST POSITION RENDERING ═══
  function updateFistPositions() {
    const fists = boxing.getFistPositions();

    // Left fist (camera is mirrored, so MediaPipe left → screen right display,
    // but we want player to see their left hand on the left)
    if (fists.left.visible) {
      // MediaPipe x is mirrored already by our scaleX(-1), so we invert
      const lx = (1 - fists.left.x) * window.innerWidth;
      const ly = fists.left.y * window.innerHeight;
      leftFist.style.left = lx + 'px';
      leftFist.style.top = ly + 'px';
      leftFist.style.opacity = '1';
      leftFist.style.transform = 'scaleX(-1) translate(-50%, -50%)';
    } else {
      leftFist.style.opacity = '0.3';
    }

    if (fists.right.visible) {
      const rx = (1 - fists.right.x) * window.innerWidth;
      const ry = fists.right.y * window.innerHeight;
      rightFist.style.left = rx + 'px';
      rightFist.style.top = ry + 'px';
      rightFist.style.opacity = '1';
      rightFist.style.transform = 'translate(-50%, -50%)';
    } else {
      rightFist.style.opacity = '0.3';
    }

    // Guard visual
    if (boxing.isGuarding) {
      leftFist.classList.add('guard-up');
      rightFist.classList.add('guard-up');
      guardIndicator.classList.remove('hidden');
    } else {
      leftFist.classList.remove('guard-up');
      rightFist.classList.remove('guard-up');
      guardIndicator.classList.add('hidden');
    }
  }

  // ═══ BOXING EVENT HANDLERS ═══

  // Player throws a punch
  boxing.onPunch = (hand, type, power, hx, hy) => {
    if (game.state !== 'fighting') return;

    sound._ensureCtx();

    // Try to throw punch (stamina check)
    const result = game.playerPunch(type, power);
    if (!result || !result.success) {
      game.showAction('⚡ LOW STAMINA', 500);
      return;
    }

    // Animate fist
    const fistEl = hand === 'left' ? leftFist : rightFist;
    fistEl.classList.remove('punching');
    void fistEl.offsetWidth;
    fistEl.classList.add('punching');
    setTimeout(() => fistEl.classList.remove('punching'), 200);

    // Check if punch hits opponent (based on hand position)
    // Opponent is roughly in the center-upper area
    const screenX = 1 - hx; // mirror
    const hitZoneX = Math.abs(screenX - 0.5) < 0.25;
    const hitZoneY = hy < 0.55;

    if (hitZoneX && hitZoneY) {
      // Punch reaches opponent!
      const oppResult = opponent.takeDamage(result.damage, type);

      if (oppResult.blocked) {
        sound.oppBlock();
        vfx.blockEffect(0.5, 0.25);
        game.showAction('BLOCKED!', 500);
        game.showDamagePopup(0.5, 0.2, '🛡️', false);
      } else if (oppResult.dodged) {
        sound.punchWhoosh();
        game.showAction('DODGED!', 500);
      } else {
        // HIT!
        sound.punchHit(power);
        game.recordHit(oppResult.damage);

        const isCrit = type === 'uppercut' || power > 1.8;
        const hitX = 0.5 + (Math.random() - 0.5) * 0.1;
        const hitY = 0.2 + Math.random() * 0.1;

        vfx.punchImpact(hitX, hitY, power, isCrit ? '#ff4400' : '#ffaa00');
        vfx.screenShake(power * 0.5);

        // Damage popup
        const label = isCrit ? `💥 ${oppResult.damage}` : `-${oppResult.damage}`;
        game.showDamagePopup(hitX, hitY, label, isCrit);

        // Action text
        if (type === 'uppercut') game.showAction('🔥 UPPERCUT!', 600);
        else if (type === 'hook') game.showAction('💫 HOOK!', 600);
        else game.showAction('JAB!', 400);

        // Sweat
        if (power > 1.2) vfx.sweatDrop(0.5, 0.15);

        // Check knockdown
        if (oppResult.knockdown) {
          handleKnockdown();
        }

        // Check stun
        if (opponent.isStunned && opponent.stunMeter >= opponent.maxStun) {
          sound.stun();
          vfx.stunStars(0.5, 0.1);
          game.showAction('⭐ STUNNED! ⭐', 1000);
        }
      }
    } else {
      // Miss
      sound.punchWhoosh();
    }
  };

  // Guard change
  boxing.onGuardChange = (isGuarding) => {
    if (isGuarding) {
      sound.guardUp();
    }
  };

  // Dodge
  boxing.onDodge = (direction) => {
    if (game.state !== 'fighting') return;
    sound.dodge();
    game.showAction(`⬅️ DODGE ${direction.toUpperCase()}! ➡️`, 500);
  };

  // ═══ OPPONENT EVENT HANDLERS ═══

  // Opponent attacks player
  opponent.onAttack = (type, direction, isCounter) => {
    if (game.state !== 'fighting') return;

    // Check if player is guarding or dodging
    const isGuarding = boxing.isGuarding;
    const playerDodge = boxing.dodgeDirection;

    // Dodge check: if player dodged opposite to attack direction
    const dodged = (playerDodge === 'left' && direction === 'right') ||
                   (playerDodge === 'right' && direction === 'left') ||
                   playerDodge !== null;

    if (dodged) {
      sound.punchWhoosh();
      game.showAction('🏃 DODGED!', 500);
      game.player.score += 50; // dodge bonus
      return;
    }

    // Apply damage
    const damage = game.playerTakeDamage(type, isGuarding);

    if (isGuarding) {
      sound.block();
      vfx.blockEffect(0.5, 0.5);
      game.showAction('🛡️ BLOCKED!', 500);
      game.showDamagePopup(0.5, 0.6, `-${damage}`, false);
      game.player.score += 25; // block bonus
    } else {
      sound.playerHit();
      vfx.playerHitEffect();
      vfx.screenShake(1);

      const hitText = isCounter ? `⚡ COUNTER -${damage}` : `-${damage}`;
      game.showDamagePopup(0.5, 0.6, hitText, isCounter);

      if (isCounter) game.showAction('⚡ COUNTERED!', 600);
    }
  };

  opponent.onBlock = () => {
    // Already handled in boxing.onPunch
  };

  opponent.onStunned = () => {
    // Already handled in boxing.onPunch
  };

  opponent.onKnockdown = () => {
    // Already handled via takeDamage return
  };

  // ═══ KNOCKDOWN HANDLER ═══
  function handleKnockdown() {
    sound.knockdown();
    vfx.knockdownEffect(0.5, 0.25);
    vfx.triggerSlowMo(800);
    vfx.screenShake(2);

    const result = game.opponentKnockdown();

    if (result === 'tko') {
      game.showAction('🏆 TKO!!!', 2000);
      sound.victory();
      sound.crowdRoar();
    } else {
      game.showAction('💥 KNOCKDOWN!', 1500);
      // Opponent recovers after delay
      setTimeout(() => {
        opponent.recover(0.3);
      }, 3000);
    }
  }

  // ═══ ROUND END HANDLER ═══
  game.onRoundEnd = (round) => {
    sound.bell(3);
    // Compare HP percentages
    const playerPct = game.player.hp / game.player.maxHp;
    const oppPct = opponent.getHpPercent();
    return playerPct >= oppPct ? 'player' : 'opponent';
  };

  game.onRoundStart = (round) => {
    sound.bell(1);
    // Set up opponent for this round
    const fighterIndex = Math.min(round - 1, opponent.fighters.length - 1);
    opponent.setFighter(fighterIndex);
  };

  game.onGameOver = (playerWins) => {
    if (playerWins) {
      sound.victory();
      sound.crowdRoar();
    } else {
      sound.defeat();
    }
  };

  // ═══ MAIN GAME LOOP ═══
  function gameLoop() {
    const now = Date.now();

    // Game tick
    game.tick(now);

    // Opponent AI
    if (game.state === 'fighting') {
      opponent.aiUpdate(now);

      // Guard stamina drain
      if (boxing.isGuarding) {
        game.drainGuardStamina();
      }

      // Update opponent HUD
      game.updateOppHUD(opponent.getHpPercent(), opponent.getStunPercent());
    }

    // VFX render
    vfx.render();

    requestAnimationFrame(gameLoop);
  }

  // ═══ BUTTON HANDLERS ═══
  startBtn.addEventListener('click', () => {
    sound.init();
    sound.bell(1);
    game.startGame();
  });

  restartBtn.addEventListener('click', () => {
    sound.bell(1);
    game.startGame();
  });

  // ═══ INIT ═══
  initCamera();
  gameLoop();
})();
