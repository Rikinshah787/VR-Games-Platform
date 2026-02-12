/* ═══════════════════════════════════════════════════════════
   🥊 KNOCKOUT — Sound Engine (sound.js)
   All sounds synthesized via Web Audio API — no files needed
   ═══════════════════════════════════════════════════════════ */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.4;
    this.master.connect(this.ctx.destination);
  }

  _ensureCtx() {
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  /* ─── Punch Impact ──────────────────────────── */
  punchHit(power = 1) {
    this._ensureCtx();
    const t = this.ctx.currentTime;

    // Low thud
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80 * power, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.15);
    gain.gain.setValueAtTime(0.6 * Math.min(power, 2), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.2);

    // Noise burst (impact)
    this._noiseBurst(0.3 * power, 0.08);
  }

  /* ─── Punch Whoosh (miss) ───────────────────── */
  punchWhoosh() {
    this._ensureCtx();
    const t = this.ctx.currentTime;

    const bufSize = this.ctx.sampleRate * 0.15;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize) * 0.2;
    }

    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2000, t);
    filter.frequency.exponentialRampToValueAtTime(500, t + 0.15);
    filter.Q.value = 2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    src.buffer = buf;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  /* ─── Block Sound ───────────────────────────── */
  block() {
    this._ensureCtx();
    const t = this.ctx.currentTime;

    // Metallic clang
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.1);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.15);

    this._noiseBurst(0.2, 0.05);
  }

  /* ─── Guard Activate ────────────────────────── */
  guardUp() {
    this._ensureCtx();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(500, t + 0.1);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /* ─── Dodge Whoosh ──────────────────────────── */
  dodge() {
    this._ensureCtx();
    const t = this.ctx.currentTime;

    const bufSize = this.ctx.sampleRate * 0.2;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      const env = Math.sin(Math.PI * i / bufSize);
      data[i] = (Math.random() * 2 - 1) * env * 0.15;
    }
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.2;
    src.buffer = buf;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  /* ─── Opponent Blocked ──────────────────────── */
  oppBlock() {
    this._ensureCtx();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 150;
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /* ─── Stun Sound ────────────────────────────── */
  stun() {
    this._ensureCtx();
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 600 + i * 200;
      gain.gain.setValueAtTime(0.12, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.3);
      osc.connect(gain).connect(this.master);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.3);
    }
  }

  /* ─── Knockdown Boom ────────────────────────── */
  knockdown() {
    this._ensureCtx();
    const t = this.ctx.currentTime;

    // Big boom
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(20, t + 0.5);
    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.6);

    this._noiseBurst(0.5, 0.2);

    // Crowd roar
    setTimeout(() => this.crowdRoar(), 300);
  }

  /* ─── Bell ──────────────────────────────────── */
  bell(count = 1) {
    this._ensureCtx();
    const t = this.ctx.currentTime;

    for (let i = 0; i < count; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 1200;
      gain.gain.setValueAtTime(0.3, t + i * 0.4);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.4 + 0.35);
      osc.connect(gain).connect(this.master);
      osc.start(t + i * 0.4);
      osc.stop(t + i * 0.4 + 0.35);
    }
  }

  /* ─── Crowd Roar ────────────────────────────── */
  crowdRoar() {
    this._ensureCtx();
    const t = this.ctx.currentTime;
    const duration = 1.5;
    const bufSize = this.ctx.sampleRate * duration;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);

    for (let i = 0; i < bufSize; i++) {
      const env = Math.sin(Math.PI * i / bufSize);
      data[i] = (Math.random() * 2 - 1) * env * 0.3;
    }

    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.5);
    gain.gain.linearRampToValueAtTime(0.001, t + duration);

    src.buffer = buf;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
  }

  /* ─── Player Hit (took damage) ──────────────── */
  playerHit() {
    this._ensureCtx();
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.25);

    this._noiseBurst(0.3, 0.1);
  }

  /* ─── Victory Fanfare ───────────────────────── */
  victory() {
    this._ensureCtx();
    const t = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6

    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, t + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.4);
      osc.connect(gain).connect(this.master);
      osc.start(t + i * 0.15);
      osc.stop(t + i * 0.15 + 0.4);
    });
  }

  /* ─── Defeat Sound ──────────────────────────── */
  defeat() {
    this._ensureCtx();
    const t = this.ctx.currentTime;
    const notes = [400, 350, 300, 200];

    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, t + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.2 + 0.3);
      osc.connect(gain).connect(this.master);
      osc.start(t + i * 0.2);
      osc.stop(t + i * 0.2 + 0.3);
    });
  }

  /* ─── Noise Burst Utility ───────────────────── */
  _noiseBurst(volume = 0.3, duration = 0.1) {
    const t = this.ctx.currentTime;
    const bufSize = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    }
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.buffer = buf;
    src.connect(gain).connect(this.master);
    src.start(t);
  }
}
