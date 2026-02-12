/* ═══════════════════════════════════════════════════════════
   🥊 KNOCKOUT — Game Engine (game.js)
   Rounds, scoring, health, knockdowns, game state
   ═══════════════════════════════════════════════════════════ */

class GameEngine {
  constructor() {
    // Game state
    this.state = 'menu'; // menu, countdown, fighting, round-end, knockdown, gameover
    this.round = 1;
    this.maxRounds = 3;
    this.roundTime = 120; // seconds per round
    this.roundTimer = this.roundTime;
    this.lastTick = 0;

    // Player stats
    this.player = {
      hp: 100,
      maxHp: 100,
      stamina: 100,
      maxStamina: 100,
      score: 0,
      roundsWon: 0,
      totalPunches: 0,
      punchesLanded: 0,
      knockdowns: 0,
      damageDealt: 0,
      damageTaken: 0
    };

    // Opponent score tracking
    this.oppRoundsWon = 0;

    // Knockdown tracking
    this.knockdownCount = 0; // per round
    this.maxKnockdowns = 3;  // TKO after 3 knockdowns in a round
    this.knockdownTimer = 0;

    // Stamina regen
    this.STAMINA_REGEN = 0.15;         // per frame
    this.STAMINA_PUNCH_COST = 12;      // cost per punch
    this.STAMINA_GUARD_DRAIN = 0.08;   // per frame while guarding

    // Damage values
    this.PUNCH_DAMAGE = {
      jab: 8,
      hook: 14,
      uppercut: 20
    };
    this.OPP_DAMAGE = {
      jab: 10,
      hook: 16,
      uppercut: 22,
      combo: 28
    };

    // Guard damage reduction
    this.GUARD_REDUCTION = 0.75; // blocks 75% damage

    // DOM Elements
    this.dom = {
      playerHp: document.getElementById('player-hp-fill'),
      playerStamina: document.getElementById('player-stamina-fill'),
      oppHp: document.getElementById('opp-hp-fill'),
      oppStunBar: document.getElementById('opp-stun-bar'),
      oppStunFill: document.getElementById('opp-stun-fill'),
      roundDisplay: document.getElementById('round-display'),
      roundTimer: document.getElementById('round-timer'),
      playerScore: document.getElementById('player-score'),
      oppScore: document.getElementById('opp-score'),
      actionState: document.getElementById('action-state'),
      startScreen: document.getElementById('start-screen'),
      roundScreen: document.getElementById('round-screen'),
      roundScreenText: document.getElementById('round-screen-text'),
      roundScreenSub: document.getElementById('round-screen-sub'),
      gameoverScreen: document.getElementById('gameover-screen'),
      goTitle: document.getElementById('go-title'),
      goResult: document.getElementById('go-result'),
      goStats: document.getElementById('go-stats'),
      popupContainer: document.getElementById('popup-container'),
      guardIndicator: document.getElementById('guard-indicator'),
      koCounter: document.getElementById('ko-counter'),
      koCount: document.getElementById('ko-count')
    };

    // Callbacks
    this.onRoundStart = null;
    this.onRoundEnd = null;
    this.onGameOver = null;
    this.onKnockdown = null;
  }

  /* ─── Start Game ────────────────────────────── */
  startGame() {
    this.round = 1;
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
    this.player.score = 0;
    this.player.roundsWon = 0;
    this.player.totalPunches = 0;
    this.player.punchesLanded = 0;
    this.player.knockdowns = 0;
    this.player.damageDealt = 0;
    this.player.damageTaken = 0;
    this.oppRoundsWon = 0;
    this.knockdownCount = 0;

    this.dom.startScreen.classList.add('hidden');
    this.dom.gameoverScreen.classList.add('hidden');
    document.body.classList.add('in-game');

    this._updateHUD();
    this._startRound();
  }

  /* ─── Start Round ───────────────────────────── */
  _startRound() {
    this.state = 'countdown';
    this.roundTimer = this.roundTime;
    this.knockdownCount = 0;

    // Reset player HP for new round
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;

    // Show round screen
    this.dom.roundScreen.classList.remove('hidden');
    this.dom.roundScreenText.textContent = `ROUND ${this.round}`;
    this.dom.roundScreenSub.textContent = 'GET READY!';
    this.dom.roundDisplay.textContent = `ROUND ${this.round}`;

    if (this.onRoundStart) this.onRoundStart(this.round);

    // Countdown
    setTimeout(() => {
      this.dom.roundScreenSub.textContent = 'FIGHT!';
      setTimeout(() => {
        this.dom.roundScreen.classList.add('hidden');
        this.state = 'fighting';
        this.lastTick = Date.now();
      }, 800);
    }, 1500);
  }

  /* ─── Game Loop Tick ────────────────────────── */
  tick(now) {
    if (this.state !== 'fighting') return;

    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;

    // Timer countdown
    this.roundTimer = Math.max(0, this.roundTimer - dt);

    // Stamina regen
    this.player.stamina = Math.min(
      this.player.maxStamina,
      this.player.stamina + this.STAMINA_REGEN
    );

    // Round timer expired
    if (this.roundTimer <= 0) {
      this._endRound();
    }

    this._updateHUD();
  }

  /* ─── Player Throws Punch ───────────────────── */
  playerPunch(type, power) {
    if (this.state !== 'fighting') return null;

    // Stamina check
    if (this.player.stamina < this.STAMINA_PUNCH_COST * 0.5) {
      return { success: false, reason: 'no-stamina' };
    }

    // Deduct stamina
    this.player.stamina = Math.max(0, this.player.stamina - this.STAMINA_PUNCH_COST);
    this.player.totalPunches++;

    // Calculate damage
    const baseDamage = this.PUNCH_DAMAGE[type] || this.PUNCH_DAMAGE.jab;
    const damage = Math.round(baseDamage * power);

    return { success: true, damage, type };
  }

  /* ─── Record Landing (after opponent reaction) ── */
  recordHit(damage) {
    this.player.punchesLanded++;
    this.player.damageDealt += damage;

    // Score: based on damage
    this.player.score += damage * 10;
  }

  /* ─── Player Takes Damage ───────────────────── */
  playerTakeDamage(type, isGuarding) {
    if (this.state !== 'fighting') return 0;

    const baseDamage = this.OPP_DAMAGE[type] || this.OPP_DAMAGE.jab;
    let damage = baseDamage;

    if (isGuarding) {
      damage = Math.round(baseDamage * (1 - this.GUARD_REDUCTION));
      // Drain extra stamina when blocking
      this.player.stamina = Math.max(0, this.player.stamina - 8);
    }

    this.player.hp = Math.max(0, this.player.hp - damage);
    this.player.damageTaken += damage;

    // Player knocked down
    if (this.player.hp <= 0) {
      this._playerKnockdown();
    }

    this._updateHUD();
    return damage;
  }

  /* ─── Player Knockdown ──────────────────────── */
  _playerKnockdown() {
    // For simplicity, end the round as opponent win
    this.state = 'knockdown';
    this.oppRoundsWon++;
    this.dom.oppScore.textContent = this.oppRoundsWon;

    setTimeout(() => {
      if (this.oppRoundsWon >= 2 || this.round >= this.maxRounds) {
        this._gameOver(false);
      } else {
        this.round++;
        this._startRound();
      }
    }, 2500);
  }

  /* ─── Opponent Knockdown ────────────────────── */
  opponentKnockdown() {
    this.knockdownCount++;
    this.player.knockdowns++;
    this.player.score += 500;

    this.dom.koCounter.classList.remove('hidden');
    this.dom.koCount.textContent = this.player.knockdowns;

    // TKO check
    if (this.knockdownCount >= this.maxKnockdowns) {
      // TKO — round win
      this.state = 'round-end';
      this.player.roundsWon++;
      this.dom.playerScore.textContent = this.player.roundsWon;

      setTimeout(() => {
        if (this.player.roundsWon >= 2 || this.round >= this.maxRounds) {
          this._gameOver(true);
        } else {
          this.round++;
          this._startRound();
        }
      }, 3000);
      return 'tko';
    }

    // Knockdown count — opponent gets back up
    this.state = 'knockdown';
    setTimeout(() => {
      if (this.state === 'knockdown') {
        this.state = 'fighting';
        this.lastTick = Date.now();
      }
    }, 3000);

    return 'knockdown';
  }

  /* ─── End Round (timer expired) ─────────────── */
  _endRound() {
    this.state = 'round-end';

    // Determine round winner by HP remaining (percentage)
    // Since opponent HP is managed externally, we use callback
    if (this.onRoundEnd) {
      const result = this.onRoundEnd(this.round);
      if (result === 'player') {
        this.player.roundsWon++;
      } else {
        this.oppRoundsWon++;
      }
    }

    this.dom.playerScore.textContent = this.player.roundsWon;
    this.dom.oppScore.textContent = this.oppRoundsWon;

    // Check for game end
    setTimeout(() => {
      if (this.player.roundsWon >= 2 || this.oppRoundsWon >= 2 || this.round >= this.maxRounds) {
        this._gameOver(this.player.roundsWon > this.oppRoundsWon);
      } else {
        this.round++;
        this._startRound();
      }
    }, 2000);
  }

  /* ─── Game Over ─────────────────────────────── */
  _gameOver(playerWins) {
    this.state = 'gameover';
    document.body.classList.remove('in-game');

    const accuracy = this.player.totalPunches > 0
      ? Math.round((this.player.punchesLanded / this.player.totalPunches) * 100) : 0;

    this.dom.goTitle.textContent = playerWins ? '🏆 KNOCKOUT!' : '💀 DEFEATED';
    this.dom.goTitle.style.color = playerWins ? '#ffcc00' : '#ff4444';
    this.dom.goResult.textContent = playerWins
      ? `You win ${this.player.roundsWon}-${this.oppRoundsWon}!`
      : `You lose ${this.player.roundsWon}-${this.oppRoundsWon}`;
    this.dom.goStats.innerHTML = `
      Score: ${this.player.score.toLocaleString()}<br>
      Punches: ${this.player.punchesLanded}/${this.player.totalPunches} (${accuracy}%)<br>
      Knockdowns: ${this.player.knockdowns}<br>
      Damage Dealt: ${this.player.damageDealt} | Taken: ${this.player.damageTaken}
    `;

    this.dom.gameoverScreen.classList.remove('hidden');

    if (this.onGameOver) this.onGameOver(playerWins);
  }

  /* ─── Guard Stamina Drain ───────────────────── */
  drainGuardStamina() {
    if (this.state !== 'fighting') return;
    this.player.stamina = Math.max(0, this.player.stamina - this.STAMINA_GUARD_DRAIN);
  }

  /* ─── Update HUD ────────────────────────────── */
  _updateHUD() {
    // Player HP
    const hpPct = (this.player.hp / this.player.maxHp) * 100;
    this.dom.playerHp.style.width = hpPct + '%';
    if (hpPct < 25) this.dom.playerHp.style.background = 'linear-gradient(90deg,#cc0000,#ff2222)';
    else if (hpPct < 50) this.dom.playerHp.style.background = 'linear-gradient(90deg,#ccaa00,#ffcc22)';
    else this.dom.playerHp.style.background = 'linear-gradient(90deg,#00cc44,#44ff66)';

    // Stamina
    this.dom.playerStamina.style.width = (this.player.stamina / this.player.maxStamina) * 100 + '%';

    // Timer
    const mins = Math.floor(this.roundTimer / 60);
    const secs = Math.floor(this.roundTimer % 60);
    this.dom.roundTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (this.roundTimer < 10) this.dom.roundTimer.style.color = '#ff4444';
    else this.dom.roundTimer.style.color = '#fff';
  }

  /* ─── Update Opponent HUD ───────────────────── */
  updateOppHUD(hpPercent, stunPercent) {
    this.dom.oppHp.style.width = (hpPercent * 100) + '%';

    if (stunPercent > 0) {
      this.dom.oppStunBar.classList.remove('hidden');
      this.dom.oppStunFill.style.width = (stunPercent * 100) + '%';
    } else {
      this.dom.oppStunBar.classList.add('hidden');
    }
  }

  /* ─── Show Action State Text ────────────────── */
  showAction(text, duration = 800) {
    this.dom.actionState.textContent = text;
    this.dom.actionState.classList.add('show');
    setTimeout(() => this.dom.actionState.classList.remove('show'), duration);
  }

  /* ─── Damage Popup ──────────────────────────── */
  showDamagePopup(x, y, text, isCrit = false) {
    const popup = document.createElement('div');
    popup.className = 'damage-popup' + (isCrit ? ' crit' : '');
    popup.textContent = text;
    popup.style.left = (x * 100) + '%';
    popup.style.top = (y * 100) + '%';
    this.dom.popupContainer.appendChild(popup);
    setTimeout(() => popup.remove(), 800);
  }
}
