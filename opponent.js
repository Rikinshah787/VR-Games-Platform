/* ═══════════════════════════════════════════════════════════
   🥊 KNOCKOUT — Opponent AI System (opponent.js)
   Controls opponent behavior, attacks, and reactions
   ═══════════════════════════════════════════════════════════ */

class OpponentAI {
  constructor() {
    this.el = document.getElementById('opponent');
    this.leftArm = document.getElementById('opp-left-arm');
    this.rightArm = document.getElementById('opp-right-arm');
    this.head = document.getElementById('opp-head');
    this.face = document.getElementById('opp-face');
    this.mouth = document.getElementById('opp-mouth');
    this.nameDisplay = document.getElementById('opp-name-display');
    this.telegraph = document.getElementById('telegraph');

    // State
    this.state = 'idle'; // idle, attacking, stunned, blocking, dodging, knocked-down
    this.hp = 100;
    this.maxHp = 100;
    this.stunMeter = 0;
    this.maxStun = 100;
    this.isStunned = false;
    this.stunEndTime = 0;

    // Attack timing
    this.nextAttackTime = 0;
    this.attackInterval = { min: 1500, max: 3500 }; // ms between attacks
    this.telegraphDuration = 600; // ms warning before punch
    this.attackDamage = { jab: 8, hook: 14, uppercut: 18, combo: 25 };

    // Defense
    this.blockChance = 0.2;    // chance to block player punch
    this.dodgeChance = 0.1;    // chance to dodge player punch
    this.counterChance = 0.15; // chance to counter after blocking

    // Movement
    this.swayTimer = 0;
    this.swayAmount = 0;

    // Difficulty scaling
    this.difficulty = 1;
    this.fighters = [
      { name: 'ROOKIE RAY',    color: '#44aa44', speed: 0.7, aggression: 0.3, defense: 0.1, hp: 80 },
      { name: 'SWIFT SARAH',   color: '#4488ff', speed: 1.2, aggression: 0.5, defense: 0.2, hp: 90 },
      { name: 'IRON MIKE',     color: '#ff8800', speed: 0.8, aggression: 0.6, defense: 0.4, hp: 120 },
      { name: 'THUNDER THEA',  color: '#ff44ff', speed: 1.0, aggression: 0.7, defense: 0.3, hp: 100 },
      { name: 'KING KOBRA',    color: '#ff2222', speed: 1.3, aggression: 0.9, defense: 0.5, hp: 150 },
    ];
    this.currentFighter = 0;

    // Callbacks
    this.onAttack = null;     // (type, direction) => {} — when opponent throws a punch at player
    this.onBlock = null;      // () => {} — when opponent blocks
    this.onStunned = null;    // () => {}
    this.onKnockdown = null;  // () => {}
  }

  /* ─── Set Fighter ───────────────────────────── */
  setFighter(index) {
    this.currentFighter = Math.min(index, this.fighters.length - 1);
    const f = this.fighters[this.currentFighter];

    this.nameDisplay.textContent = f.name;
    this.maxHp = f.hp;
    this.hp = f.hp;
    this.stunMeter = 0;
    this.isStunned = false;
    this.state = 'idle';

    // Adjust stats based on fighter
    const spd = f.speed;
    this.attackInterval = {
      min: Math.max(800, 2000 / spd),
      max: Math.max(1500, 4000 / spd)
    };
    this.blockChance = f.defense;
    this.dodgeChance = f.defense * 0.5;
    this.counterChance = f.aggression * 0.2;

    // Visual
    const headband = document.getElementById('opp-headband');
    if (headband) headband.style.background = `linear-gradient(90deg, ${f.color}, ${f.color}aa, ${f.color})`;

    // Reset visual state
    this.el.className = '';
    this.el.style.transform = 'translateX(-50%)';
    this.leftArm.className = 'opp-arm';
    this.rightArm.className = 'opp-arm';
    this.telegraph.classList.add('hidden');
  }

  /* ─── Take Damage ───────────────────────────── */
  takeDamage(amount, punchType) {
    if (this.state === 'knocked-down') return { blocked: false, dodged: false, damage: 0 };

    // Check if opponent blocks
    if (this.state !== 'stunned' && this.state !== 'attacking' && Math.random() < this.blockChance) {
      this.state = 'blocking';
      this.el.classList.add('blocking');
      setTimeout(() => {
        this.el.classList.remove('blocking');
        if (this.state === 'blocking') this.state = 'idle';
        // Counter attack chance
        if (Math.random() < this.counterChance) {
          this._doAttack('jab', Math.random() > 0.5 ? 'left' : 'right', true);
        }
      }, 400);
      if (this.onBlock) this.onBlock();
      return { blocked: true, dodged: false, damage: 0 };
    }

    // Check if opponent dodges
    if (this.state !== 'stunned' && Math.random() < this.dodgeChance) {
      const dir = Math.random() > 0.5 ? 'left' : 'right';
      this.state = 'dodging';
      this.el.classList.add(`dodging-${dir}`);
      setTimeout(() => {
        this.el.classList.remove(`dodging-${dir}`);
        if (this.state === 'dodging') this.state = 'idle';
      }, 500);
      return { blocked: false, dodged: true, damage: 0 };
    }

    // Extra damage if stunned
    const stunMultiplier = this.isStunned ? 1.5 : 1;
    const actualDamage = Math.round(amount * stunMultiplier);

    this.hp = Math.max(0, this.hp - actualDamage);

    // Add stun
    const stunAdd = punchType === 'uppercut' ? 30 : punchType === 'hook' ? 20 : 10;
    this.stunMeter = Math.min(this.maxStun, this.stunMeter + stunAdd);

    // Hit reaction
    this.el.classList.remove('hit');
    void this.el.offsetWidth; // force reflow
    this.el.classList.add('hit');
    setTimeout(() => this.el.classList.remove('hit'), 200);

    // Check for stun
    if (this.stunMeter >= this.maxStun && !this.isStunned) {
      this._enterStun();
    }

    // Check for knockdown
    if (this.hp <= 0) {
      this._knockdown();
      return { blocked: false, dodged: false, damage: actualDamage, knockdown: true };
    }

    return { blocked: false, dodged: false, damage: actualDamage, knockdown: false };
  }

  /* ─── Enter Stun State ──────────────────────── */
  _enterStun() {
    this.isStunned = true;
    this.state = 'stunned';
    this.stunEndTime = Date.now() + 2500; // stunned for 2.5 seconds
    this.el.classList.add('stunned');
    this.mouth.style.borderRadius = '50%';
    this.mouth.style.width = '15px';
    this.mouth.style.height = '15px';
    if (this.onStunned) this.onStunned();
  }

  /* ─── Knockdown ─────────────────────────────── */
  _knockdown() {
    this.state = 'knocked-down';
    this.el.classList.remove('stunned', 'hit');
    this.el.classList.add('knocked-down');
    this.telegraph.classList.add('hidden');
    if (this.onKnockdown) this.onKnockdown();
  }

  /* ─── Reset After Knockdown ─────────────────── */
  recover(hpPercent = 0.3) {
    this.hp = Math.round(this.maxHp * hpPercent);
    this.stunMeter = 0;
    this.isStunned = false;
    this.state = 'idle';
    this.el.className = '';
    this.el.style.transform = 'translateX(-50%)';
    this.mouth.style.borderRadius = '0 0 10px 10px';
    this.mouth.style.width = '20px';
    this.mouth.style.height = '8px';
    this.nextAttackTime = Date.now() + 2000;
  }

  /* ─── AI Update Loop ────────────────────────── */
  aiUpdate(now) {
    if (this.state === 'knocked-down') return;

    // Recover from stun
    if (this.isStunned && now > this.stunEndTime) {
      this.isStunned = false;
      this.stunMeter = 0;
      this.state = 'idle';
      this.el.classList.remove('stunned');
      this.mouth.style.borderRadius = '0 0 10px 10px';
      this.mouth.style.width = '20px';
      this.mouth.style.height = '8px';
    }

    // Stun meter decay
    if (!this.isStunned && this.stunMeter > 0) {
      this.stunMeter = Math.max(0, this.stunMeter - 0.3);
    }

    // Idle sway
    if (this.state === 'idle' || this.state === 'blocking') {
      this.swayTimer += 0.02;
      this.swayAmount = Math.sin(this.swayTimer) * 8;
      this.el.style.transform = `translateX(calc(-50% + ${this.swayAmount}px))`;
    }

    // Attack logic
    if (this.state === 'idle' && !this.isStunned && now > this.nextAttackTime) {
      this._startAttack(now);
    }
  }

  /* ─── Start Attack Sequence ─────────────────── */
  _startAttack(now) {
    const f = this.fighters[this.currentFighter];

    // Choose attack type
    const roll = Math.random();
    let type, direction;

    if (roll < 0.4) {
      type = 'jab';
    } else if (roll < 0.65) {
      type = 'hook';
    } else if (roll < 0.8) {
      type = 'uppercut';
    } else {
      type = 'combo';
    }

    direction = Math.random() > 0.5 ? 'left' : 'right';

    // Telegraph (warning)
    this.state = 'telegraphing';
    this.telegraph.classList.remove('hidden');
    const icon = document.getElementById('telegraph-icon');

    if (type === 'jab') icon.textContent = '👊';
    else if (type === 'hook') icon.textContent = '🔄';
    else if (type === 'uppercut') icon.textContent = '⬆️';
    else icon.textContent = '💥';

    // Position telegraph based on attack direction
    this.telegraph.style.left = direction === 'left' ? '20%' : '80%';

    const tDuration = Math.max(300, this.telegraphDuration / f.speed);

    setTimeout(() => {
      this.telegraph.classList.add('hidden');
      if (this.state === 'telegraphing') {
        this._doAttack(type, direction, false);
      }
    }, tDuration);

    // Set next attack time
    const interval = this.attackInterval.min +
      Math.random() * (this.attackInterval.max - this.attackInterval.min);
    this.nextAttackTime = now + interval + tDuration;
  }

  /* ─── Execute Attack ────────────────────────── */
  _doAttack(type, direction, isCounter) {
    this.state = 'attacking';

    const arm = direction === 'left' ? this.leftArm : this.rightArm;
    const punchClass = direction === 'left' ? 'punching-left' : 'punching-right';

    arm.classList.add(punchClass);

    // Fire callback so game can check if player blocks/dodges
    if (this.onAttack) {
      this.onAttack(type, direction, isCounter);
    }

    // Combo: throw second punch
    if (type === 'combo') {
      setTimeout(() => {
        const otherDir = direction === 'left' ? 'right' : 'left';
        const otherArm = otherDir === 'left' ? this.leftArm : this.rightArm;
        const otherClass = otherDir === 'left' ? 'punching-left' : 'punching-right';
        otherArm.classList.add(otherClass);
        if (this.onAttack) this.onAttack('hook', otherDir, false);
        setTimeout(() => otherArm.classList.remove(otherClass), 350);
      }, 300);
    }

    setTimeout(() => {
      arm.classList.remove(punchClass);
      if (this.state === 'attacking') this.state = 'idle';
    }, 350);
  }

  /* ─── Get HP Percentage ─────────────────────── */
  getHpPercent() {
    return Math.max(0, this.hp / this.maxHp);
  }

  getStunPercent() {
    return this.stunMeter / this.maxStun;
  }
}
