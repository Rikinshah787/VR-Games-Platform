/* ═══════════════════════════════════════════════════════════
   🖐️ HAND TRACKER — Shared Hand Tracking Module
   Provides finger cursor + pinch-to-select for all games
   VERSION: Tasks-Vision (Latest, Synchronous, Zero-Lag)
   + One-Euro Filter for buttery smooth tracking
   + Palm gesture detection + onPalmOpen callback
   ═══════════════════════════════════════════════════════════ */

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

class HandCursor {
  constructor(options = {}) {
    this.video = null;
    this.handLandmarker = null;
    this.ready = false;
    this.lastVideoTime = -1;

    // One-Euro Filters for primary hand
    this.filters = {
      x: new OneEuroFilter(60, 1.2, 0.005),
      y: new OneEuroFilter(60, 1.2, 0.005)
    };

    // Cursor state
    this.cursor = {
      x: 0.5, y: 0.5,
      screenX: window.innerWidth / 2,
      screenY: window.innerHeight / 2,
      visible: false,
      pinching: false,
      pointing: false,
      fistClosed: false,
      palmOpen: false
    };

    // Second hand
    this.secondHand = {
      x: 0.5, y: 0.5,
      visible: false,
      pinching: false
    };

    // Pinch detection
    this.PINCH_THRESHOLD = options.pinchThreshold || 0.08;
    this.pinchStartTime = 0;
    this.PINCH_HOLD_MS = 60;

    // Callbacks
    this.onReady = options.onReady || null;
    this.onError = options.onError || null;
    this.onPinch = options.onPinch || null;
    this.onRelease = options.onRelease || null;
    this.onMove = options.onMove || null;
    this.onResults = options.onResults || null;
    this.onPalmOpen = options.onPalmOpen || null;

    // Cursor DOM element
    this.cursorEl = null;
    this.rippleContainer = null;
    this._createCursorElement(options.cursorParent || document.body);
  }

  /* ─── Static helper for module loading ───────── */
  static waitForMediaPipe(timeout = 15000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function check() {
        if (window.FilesetResolver && window.HandLandmarker) return resolve();
        if (Date.now() - start > timeout) return reject(new Error('MediaPipe library load timeout'));
        setTimeout(check, 100);
      })();
    });
  }

  /* ─── Create cursor DOM element ─────────────── */
  _createCursorElement(parent) {
    this.cursorEl = document.createElement('div');
    this.cursorEl.id = 'hand-cursor';
    this.cursorEl.innerHTML = '👆';
    this.cursorEl.style.cssText = `
      position: fixed; z-index: 10000; pointer-events: none;
      font-size: 48px; line-height: 1;
      transform: translate(-30%, -10%);
      transition: opacity 0.2s;
      opacity: 0; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5));
      display: none;
    `;
    parent.appendChild(this.cursorEl);

    this.rippleContainer = document.createElement('div');
    this.rippleContainer.id = 'pinch-ripples';
    this.rippleContainer.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      z-index: 9999; pointer-events: none;
    `;
    parent.appendChild(this.rippleContainer);
  }

  /* ─── Initialize Camera + MediaPipe ─────────── */
  async init() {
    try {
      this.video = document.createElement('video');
      this.video.setAttribute('autoplay', '');
      this.video.setAttribute('playsinline', '');
      this.video.setAttribute('muted', '');
      this.video.style.display = 'none';
      document.body.appendChild(this.video);

      await HandCursor.waitForMediaPipe();

      const vision = await window.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this.handLandmarker = await window.HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.35
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user', frameRate: { ideal: 60 } }
      });
      this.video.srcObject = stream;

      this.video.onloadeddata = () => {
        this.ready = true;
        if (this.onReady) this.onReady();
        // Delay tracking start to allow camera to stabilize (warm-up)
        setTimeout(() => {
          this._loop();
        }, 1500);
      };

    } catch (err) {
      console.error('HandCursor init error:', err);
      if (this.onError) this.onError(err);
    }
  }

  _loop() {
    if (!this.ready) return;

    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const results = this.handLandmarker.detectForVideo(this.video, performance.now());
      this._onResults({
        multiHandLandmarks: results.landmarks,
        multiHandedness: results.handedness
      });
    }

    requestAnimationFrame(() => this._loop());
  }

  getStream() {
    return this.video && this.video.srcObject ? this.video.srcObject : null;
  }

  /* ─── Process Results (Synchronous) ─────────── */
  _onResults(results) {
    if (this.onResults) this.onResults(results);

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.cursor.visible = false;
      this.secondHand.visible = false;
      // Reset filters when hand is lost so next detection starts fresh
      this.filters.x.reset();
      this.filters.y.reset();
      this._updateCursorVisual();
      return;
    }

    const t = performance.now() / 1000; // seconds for One-Euro filter

    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const landmarks = results.multiHandLandmarks[i];
      const indexTip = landmarks[8];
      const thumbTip = landmarks[4];
      const isPointing = this._isPointing(landmarks);
      const isPinching = this._isPinching(thumbTip, indexTip);
      const isPalmOpen = this._isPalmOpen(landmarks);

      if (i === 0) {
        const rawX = 1 - indexTip.x;
        const rawY = indexTip.y;

        // Apply One-Euro Filter — buttery smooth!
        this.cursor.x = this.filters.x.filter(rawX, t);
        this.cursor.y = this.filters.y.filter(rawY, t);
        this.cursor.screenX = this.cursor.x * window.innerWidth;
        this.cursor.screenY = this.cursor.y * window.innerHeight;
        this.cursor.visible = true;
        this.cursor.pointing = isPointing;
        this.cursor.fistClosed = this._isFistClosed(landmarks);
        this.cursor.palmOpen = isPalmOpen;

        if (isPalmOpen && this.onPalmOpen) {
          this.onPalmOpen(this.cursor.x, this.cursor.y);
        }

        if (isPinching && !this.cursor.pinching) {
          if (!this.pinchStartTime) {
            this.pinchStartTime = Date.now();
          } else if (Date.now() - this.pinchStartTime > this.PINCH_HOLD_MS) {
            this.cursor.pinching = true;
            this.pinchStartTime = 0;
            this._showPinchRipple(this.cursor.screenX, this.cursor.screenY);
            if (this.onPinch) this.onPinch(this.cursor.x, this.cursor.y);
          }
        } else if (!isPinching) {
          if (this.cursor.pinching) {
            this.cursor.pinching = false;
            if (this.onRelease) this.onRelease(this.cursor.x, this.cursor.y);
          }
          this.pinchStartTime = 0;
        }

        if (this.onMove) this.onMove(this.cursor.x, this.cursor.y);
      } else {
        this.secondHand.x = 1 - indexTip.x;
        this.secondHand.y = indexTip.y;
        this.secondHand.visible = true;
        this.secondHand.pinching = isPinching;
      }
    }
    this._updateCursorVisual();
  }

  _isPinching(thumbTip, indexTip) {
    const dist = Math.sqrt(Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2));
    return dist < this.PINCH_THRESHOLD;
  }

  _isPointing(landmarks) {
    const indexExtended = landmarks[8].y < landmarks[6].y;
    const middleCurled = landmarks[12].y > landmarks[10].y;
    const ringCurled = landmarks[16].y > landmarks[14].y;
    const pinkyCurled = landmarks[20].y > landmarks[18].y;
    return indexExtended && middleCurled && ringCurled && pinkyCurled;
  }

  _isFistClosed(landmarks) {
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];
    const wrist = landmarks[0];
    let curled = 0;
    for (let i = 0; i < tips.length; i++) {
      const tipToWrist = Math.hypot(landmarks[tips[i]].x - wrist.x, landmarks[tips[i]].y - wrist.y);
      const pipToWrist = Math.hypot(landmarks[pips[i]].x - wrist.x, landmarks[pips[i]].y - wrist.y);
      if (tipToWrist < pipToWrist * 0.85) curled++;
    }
    return curled >= 3;
  }

  _isPalmOpen(landmarks) {
    const fingersExt = [8, 12, 16, 20].every(tipIdx => landmarks[tipIdx].y < landmarks[tipIdx - 2].y);
    const thumbSpread = Math.hypot(landmarks[4].x - landmarks[5].x, landmarks[4].y - landmarks[5].y) > 0.06;
    return fingersExt && thumbSpread;
  }

  _updateCursorVisual() {
    if (!this.cursorEl) return;
    if (this.cursor.visible) {
      this.cursorEl.style.opacity = '1';
      this.cursorEl.style.left = this.cursor.screenX + 'px';
      this.cursorEl.style.top = this.cursor.screenY + 'px';
      if (this.cursor.pinching) {
        this.cursorEl.innerHTML = '✊';
        this.cursorEl.style.fontSize = '40px';
        this.cursorEl.style.transform = 'translate(-50%, -50%) scale(0.9)';
      } else if (this.cursor.pointing) {
        this.cursorEl.innerHTML = '👆';
        this.cursorEl.style.fontSize = '48px';
        this.cursorEl.style.transform = 'translate(-30%, -10%)';
      } else {
        this.cursorEl.innerHTML = '🖐️';
        this.cursorEl.style.fontSize = '44px';
        this.cursorEl.style.transform = 'translate(-50%, -50%)';
      }
    } else {
      this.cursorEl.style.opacity = '0';
    }
  }

  _showPinchRipple(x, y) {
    const ripple = document.createElement('div');
    ripple.style.cssText = `
      position: absolute; left: ${x}px; top: ${y}px;
      width: 30px; height: 30px; border-radius: 50%;
      border: 3px solid rgba(255, 200, 50, 0.8);
      transform: translate(-50%, -50%) scale(0);
      animation: pinchRipple 0.5s ease forwards;
      pointer-events: none;
    `;
    this.rippleContainer.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
  }

  isOver(element) {
    if (!this.cursor.visible) return false;
    const rect = element.getBoundingClientRect();
    return (this.cursor.screenX >= rect.left && this.cursor.screenX <= rect.right &&
      this.cursor.screenY >= rect.top && this.cursor.screenY <= rect.bottom);
  }

  getPosition() {
    return { ...this.cursor, pinching: this.cursor.pinching, pointing: this.cursor.pointing };
  }

  destroy() {
    this.ready = false;
    if (this.video && this.video.srcObject) {
      this.video.srcObject.getTracks().forEach(t => t.stop());
      this.video.remove();
    }
    if (this.cursorEl) this.cursorEl.remove();
    if (this.rippleContainer) this.rippleContainer.remove();
  }
}
