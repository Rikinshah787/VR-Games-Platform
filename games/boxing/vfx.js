/* ═══════════════════════════════════════════════════════════
   🥊 KNOCKOUT — VFX Engine (vfx.js)
   Canvas-based visual effects: impacts, particles, shake
   ═══════════════════════════════════════════════════════════ */

class VFXEngine {
  constructor() {
    this.canvas = document.getElementById('vfx-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.flashes = [];
    this.shakeAmount = 0;
    this.slowMo = false;
    this.slowMoEnd = 0;

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.W = this.canvas.width;
    this.H = this.canvas.height;
  }

  /* ─── Punch Impact Effect (Enhanced) ─────────── */
  punchImpact(x, y, power = 1, color = '#ffaa00') {
    const px = x * this.W;
    const py = y * this.H;
    const count = Math.floor(15 * power);

    // Burst particles with variety
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = (4 + Math.random() * 6) * power;
      const colors = [color, '#fff', '#ffcc00'];
      this.particles.push({
        x: px, y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 1,
        decay: 0.018 + Math.random() * 0.02,
        size: 4 + Math.random() * 5 * power,
        color: colors[Math.floor(Math.random() * colors.length)],
        type: 'circle'
      });
    }

    // Impact ring (multiple)
    this.particles.push({
      x: px, y: py,
      vx: 0, vy: 0,
      life: 1,
      decay: 0.035,
      size: 15,
      maxSize: 80 * power,
      color: color,
      type: 'ring'
    });
    
    // Secondary white ring
    this.particles.push({
      x: px, y: py,
      vx: 0, vy: 0,
      life: 1,
      decay: 0.05,
      size: 8,
      maxSize: 50 * power,
      color: '#ffffff',
      type: 'ring'
    });

    // Star/cross burst
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + Math.PI / 6;
      this.particles.push({
        x: px, y: py,
        vx: Math.cos(angle) * 10 * power,
        vy: Math.sin(angle) * 10 * power,
        life: 1,
        decay: 0.04,
        size: 2,
        length: 20 * power,
        color: '#fff',
        type: 'line'
      });
    }
    
    // Speed lines
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI + (Math.random() - 0.5) * 0.5;
      this.particles.push({
        x: px, y: py,
        vx: Math.cos(angle) * 20,
        vy: Math.sin(angle) * 5,
        life: 1,
        decay: 0.06,
        size: 2,
        length: 40 * power,
        color: '#ffff88',
        type: 'line'
      });
    }
  }

  /* ─── Block Effect ──────────────────────────── */
  blockEffect(x, y) {
    const px = x * this.W;
    const py = y * this.H;

    // Blue shield flash
    this.particles.push({
      x: px, y: py,
      vx: 0, vy: 0,
      life: 1,
      decay: 0.05,
      size: 30,
      maxSize: 80,
      color: '#0088ff',
      type: 'ring'
    });

    // Small blue sparks
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      this.particles.push({
        x: px, y: py,
        vx: Math.cos(angle) * (2 + Math.random() * 3),
        vy: Math.sin(angle) * (2 + Math.random() * 3),
        life: 1,
        decay: 0.04,
        size: 2 + Math.random() * 2,
        color: '#44aaff',
        type: 'circle'
      });
    }
  }

  /* ─── Player Hit (red flash) ────────────────── */
  playerHitEffect() {
    // Red screen vignette
    const flash = document.createElement('div');
    flash.className = 'screen-red-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 300);

    // Red particles from edges
    for (let i = 0; i < 15; i++) {
      const side = Math.floor(Math.random() * 4);
      let px, py, vx, vy;
      switch (side) {
        case 0: px = Math.random() * this.W; py = 0; vx = (Math.random() - 0.5) * 3; vy = 3; break;
        case 1: px = this.W; py = Math.random() * this.H; vx = -3; vy = (Math.random() - 0.5) * 3; break;
        case 2: px = Math.random() * this.W; py = this.H; vx = (Math.random() - 0.5) * 3; vy = -3; break;
        case 3: px = 0; py = Math.random() * this.H; vx = 3; vy = (Math.random() - 0.5) * 3; break;
      }
      this.particles.push({
        x: px, y: py, vx, vy,
        life: 1, decay: 0.03,
        size: 4 + Math.random() * 4,
        color: '#ff0000',
        type: 'circle'
      });
    }
  }

  /* ─── Knockdown Explosion ───────────────────── */
  knockdownEffect(x, y) {
    const px = x * this.W;
    const py = y * this.H;

    // Massive burst with more particles
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 12;
      const colors = ['#ffaa00', '#ff6600', '#ff4400', '#ff2200', '#ffcc00'];
      this.particles.push({
        x: px, y: py,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1,
        decay: 0.008 + Math.random() * 0.012,
        size: 4 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        type: 'circle'
      });
    }

    // Spark trails
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      this.particles.push({
        x: px, y: py,
        vx: Math.cos(angle) * 15,
        vy: Math.sin(angle) * 15,
        life: 1,
        decay: 0.03,
        size: 3,
        length: 25,
        color: '#fff',
        type: 'line'
      });
    }

    // Multiple expanding rings
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this.particles.push({
          x: px, y: py,
          vx: 0, vy: 0,
          life: 1,
          decay: 0.018,
          size: 10,
          maxSize: 140 + i * 50,
          color: i % 2 === 0 ? '#ff6600' : '#ffaa00',
          type: 'ring'
        });
      }, i * 80);
    }

    // Central flash burst
    this.particles.push({
      x: px, y: py,
      vx: 0, vy: 0,
      life: 1,
      decay: 0.06,
      size: 20,
      maxSize: 200,
      color: '#ffffff',
      type: 'ring'
    });

    // Screen flash
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 180);
  }

  /* ─── Screen Shake ──────────────────────────── */
  screenShake(intensity = 1) {
    document.body.classList.remove('screen-shake');
    void document.body.offsetWidth;
    document.body.classList.add('screen-shake');
    setTimeout(() => document.body.classList.remove('screen-shake'), 150 * intensity);
  }

  /* ─── Slow Motion ───────────────────────────── */
  triggerSlowMo(durationMs = 500) {
    this.slowMo = true;
    this.slowMoEnd = Date.now() + durationMs;
  }

  /* ─── Stun Stars ────────────────────────────── */
  stunStars(x, y) {
    const px = x * this.W;
    const py = y * this.H;

    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5;
      const radius = 40;
      this.particles.push({
        x: px, y: py,
        centerX: px, centerY: py - 20,
        angle: angle,
        radius: radius,
        angularSpeed: 0.05 + Math.random() * 0.02,
        life: 1,
        decay: 0.005,
        size: 8,
        color: '#ffff00',
        type: 'star'
      });
    }
  }

  /* ─── Sweat Particles ───────────────────────── */
  sweatDrop(x, y) {
    const px = x * this.W;
    const py = y * this.H;

    for (let i = 0; i < 3; i++) {
      this.particles.push({
        x: px + (Math.random() - 0.5) * 30,
        y: py,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 3,
        life: 1,
        decay: 0.015,
        size: 2 + Math.random() * 2,
        color: '#aaddff',
        type: 'circle'
      });
    }
  }

  /* ─── Render Loop ───────────────────────────── */
  render() {
    this.ctx.clearRect(0, 0, this.W, this.H);

    // Slow-mo check
    if (this.slowMo && Date.now() > this.slowMoEnd) {
      this.slowMo = false;
    }

    const timeScale = this.slowMo ? 0.3 : 1;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay * timeScale;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.globalAlpha = p.life;

      switch (p.type) {
        case 'circle':
          p.x += p.vx * timeScale;
          p.y += p.vy * timeScale;
          p.vy += 0.1 * timeScale; // gravity
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          this.ctx.fillStyle = p.color;
          this.ctx.fill();
          break;

        case 'ring':
          const ringSize = p.size + (p.maxSize - p.size) * (1 - p.life);
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, ringSize, 0, Math.PI * 2);
          this.ctx.strokeStyle = p.color;
          this.ctx.lineWidth = 3 * p.life;
          this.ctx.stroke();
          break;

        case 'line':
          p.x += p.vx * timeScale;
          p.y += p.vy * timeScale;
          const len = p.length * p.life;
          const angle = Math.atan2(p.vy, p.vx);
          this.ctx.beginPath();
          this.ctx.moveTo(p.x, p.y);
          this.ctx.lineTo(p.x - Math.cos(angle) * len, p.y - Math.sin(angle) * len);
          this.ctx.strokeStyle = p.color;
          this.ctx.lineWidth = p.size;
          this.ctx.stroke();
          break;

        case 'star':
          p.angle += p.angularSpeed * timeScale;
          p.x = p.centerX + Math.cos(p.angle) * p.radius;
          p.y = p.centerY + Math.sin(p.angle) * p.radius;
          this.ctx.font = `${p.size}px serif`;
          this.ctx.fillText('⭐', p.x - p.size / 2, p.y + p.size / 2);
          break;
      }
    }

    this.ctx.globalAlpha = 1;
  }
}
