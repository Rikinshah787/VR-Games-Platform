/* ═══════════════════════════════════════════════════════════
   🥊 KNOCKOUT — Boxing Hand Tracker (boxing.js)
   Detects punches, guard, and dodge from both hands
   ═══════════════════════════════════════════════════════════ */

class BoxingTracker {
  constructor() {
    // State for each hand
    this.hands = {
      left:  { x: 0.3, y: 0.7, z: 0, prevZ: 0, prevX: 0.3, prevY: 0.7, visible: false, fistClosed: false },
      right: { x: 0.7, y: 0.7, z: 0, prevZ: 0, prevX: 0.7, prevY: 0.7, visible: false, fistClosed: false }
    };

    // Punch detection
    this.punchCooldown = { left: 0, right: 0 };
    this.PUNCH_COOLDOWN_MS = 250;
    this.PUNCH_Z_THRESHOLD = 0.015;      // z-axis forward motion threshold (lowered)
    this.PUNCH_VELOCITY_THRESHOLD = 0.005; // minimum velocity for punch (very sensitive)
    
    // Punch reach tracking - must extend arm for real punch
    this.punchState = {
      left: { reaching: false, startZ: 0, peakZ: 0, startTime: 0, extended: false },
      right: { reaching: false, startZ: 0, peakZ: 0, startTime: 0, extended: false }
    };
    this.ARM_EXTENSION_THRESHOLD = 0.03; // how much closer to camera for "extended" arm
    this.PUNCH_REACH_TIME = 400;         // max time for punch to connect (longer window)
    this.MIN_PUNCH_TRAVEL = 0.02;        // minimum z distance for valid punch (lowered)

    // Guard detection
    this.isGuarding = false;
    this.guardStartTime = 0;
    this.GUARD_Y_THRESHOLD = 0.45;       // hands must be above this (upper part of screen)
    this.GUARD_X_RANGE = 0.25;           // hands must be within this range of center

    // Dodge detection
    this.dodgeDirection = null;           // 'left', 'right', or null
    this.dodgeCooldown = 0;
    this.DODGE_COOLDOWN_MS = 500;
    this.DODGE_X_THRESHOLD = 0.15;       // how far hands must shift for dodge
    this.centerX = 0.5;                  // baseline center
    this.centerSmooth = 0.5;

    // Punch type classification
    this.lastPunch = null;

    // History for velocity calculation
    this.history = { left: [], right: [] };
    this.MAX_HISTORY = 5;

    // Callbacks
    this.onPunch = null;       // (hand, type, power) => {}
    this.onGuardChange = null; // (isGuarding) => {}
    this.onDodge = null;       // (direction) => {}
  }

  /* ─── Process MediaPipe Results ─────────────── */
  update(results) {
    const now = Date.now();

    // Reset visibility
    this.hands.left.visible = false;
    this.hands.right.visible = false;

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this._updateGuard(now);
      this._updateDodge(now);
      return;
    }

    // Process each detected hand
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
      const landmarks = results.multiHandLandmarks[i];
      const handedness = results.multiHandedness[i];

      // MediaPipe labels are mirrored: "Left" in camera = your right hand
      const label = handedness.label === 'Left' ? 'right' : 'left';
      const hand = this.hands[label];

      // Wrist position (landmark 0) as primary position
      const wrist = landmarks[0];
      // Middle finger MCP (landmark 9) for additional reference
      const midMCP = landmarks[9];

      // Store previous
      hand.prevX = hand.x;
      hand.prevY = hand.y;
      hand.prevZ = hand.z;

      // Update position (use average of wrist and mid MCP for stability)
      hand.x = (wrist.x + midMCP.x) / 2;
      hand.y = (wrist.y + midMCP.y) / 2;
      hand.z = wrist.z;
      hand.visible = true;

      // Check if fist is closed
      hand.fistClosed = this._isFistClosed(landmarks);
      
      // Calculate arm extension (distance from wrist to knuckles indicates extension)
      const knuckle = landmarks[9]; // middle finger MCP
      hand.armLength = Math.sqrt(
        Math.pow(wrist.x - knuckle.x, 2) + 
        Math.pow(wrist.y - knuckle.y, 2) + 
        Math.pow(wrist.z - knuckle.z, 2)
      );
      hand.forwardZ = -wrist.z; // how close to camera (higher = more extended forward)

      // Store in history
      if (!this.history[label]) this.history[label] = [];
      this.history[label].push({ x: hand.x, y: hand.y, z: hand.z, t: now });
      if (this.history[label].length > this.MAX_HISTORY) {
        this.history[label].shift();
      }

      // Detect punch
      this._detectPunch(label, hand, landmarks, now);
    }

    // Update guard and dodge
    this._updateGuard(now);
    this._updateDodge(now);
  }

  /* ─── Fist Closed Detection ─────────────────── */
  _isFistClosed(landmarks) {
    // Check if fingertips are curled toward palm
    // Finger tips: 8 (index), 12 (middle), 16 (ring), 20 (pinky)
    // Finger MCPs: 5, 9, 13, 17
    const tips = [8, 12, 16, 20];
    const mcps = [5, 9, 13, 17];
    let curled = 0;

    for (let i = 0; i < tips.length; i++) {
      const tipY = landmarks[tips[i]].y;
      const mcpY = landmarks[mcps[i]].y;
      // If tip is below (higher y value) MCP, finger is curled
      if (tipY > mcpY) curled++;
    }

    return curled >= 3; // at least 3 fingers curled = fist
  }

  /* ─── Punch Detection ──────────────────────── */
  _detectPunch(label, hand, landmarks, now) {
    if (now - this.punchCooldown[label] < this.PUNCH_COOLDOWN_MS) return;
    if (this.isGuarding) return;

    const hist = this.history[label];
    if (hist.length < 3) return;

    const state = this.punchState[label];
    
    // Calculate velocities from history
    const recent = hist[hist.length - 1];
    const older = hist[Math.max(0, hist.length - 3)];
    const dt = (recent.t - older.t) || 1;

    const zVelocity = (older.z - recent.z); // positive = moving toward camera = punching
    const yVelocity = older.y - recent.y;    // positive = upward motion
    const xVelocity = recent.x - older.x;    // lateral movement
    const xSpeed = Math.abs(xVelocity);
    
    // Current forward position (closer to camera = more negative z, so we negate)
    const currentReach = -hand.z;
    
    // ═══ PUNCH STATE MACHINE ═══
    // Phase 1: Detect punch START (arm moving forward with velocity)
    if (!state.reaching) {
      const startingPunch = zVelocity > this.PUNCH_VELOCITY_THRESHOLD;
      const startingUppercut = yVelocity > 0.02 && hand.y < 0.6;
      const startingHook = xSpeed > 0.02;
      
      if (startingPunch || startingUppercut || startingHook) {
        // Punch initiated!
        state.reaching = true;
        state.startZ = currentReach;
        state.peakZ = currentReach;
        state.startTime = now;
        state.startY = hand.y;
        state.startX = hand.x;
        state.extended = false;
      }
      return;
    }
    
    // Phase 2: Track punch extension
    if (state.reaching) {
      // Update peak reach (furthest forward)
      if (currentReach > state.peakZ) {
        state.peakZ = currentReach;
      }
      
      // Calculate total travel distance
      const travelDistance = state.peakZ - state.startZ;
      const yTravel = state.startY - hand.y; // upward movement
      const xTravel = Math.abs(hand.x - state.startX);
      
      // Check if arm is now extended (reached forward enough) - very lenient
      const isExtended = travelDistance > this.MIN_PUNCH_TRAVEL || 
                         yTravel > 0.03 || 
                         xTravel > 0.03 ||
                         (now - state.startTime) > 100; // If motion continues for 100ms, count it
      
      // Check for punch completion conditions
      const punchTimedOut = (now - state.startTime) > this.PUNCH_REACH_TIME;
      const armRetreating = zVelocity < -0.01; // moving back
      const punchComplete = punchTimedOut || (isExtended && armRetreating);
      
      if (punchComplete && isExtended) {
        // ═══ VALID PUNCH! ═══
        
        // Classify punch type based on movement pattern
        let type = 'jab';
        let power = 1;
        
        if (yTravel > 0.08 && hand.y < 0.45) {
          // Significant upward motion = uppercut
          type = 'uppercut';
          power = 1.6 + Math.min(yTravel * 4, 1.4);
        } else if (xTravel > 0.08) {
          // Significant lateral motion = hook
          type = 'hook';
          power = 1.3 + Math.min(xTravel * 3, 1.2);
        } else {
          // Forward motion = jab/cross
          type = 'jab';
          power = 1.0 + Math.min(travelDistance * 6, 1.0);
        }
        
        // Bonus power for fast punches
        const punchSpeed = travelDistance / ((now - state.startTime) / 1000);
        if (punchSpeed > 0.3) power += 0.3;
        if (punchSpeed > 0.5) power += 0.3;
        
        // Bonus for fist being closed
        if (hand.fistClosed) power += 0.2;
        
        // Set cooldown
        this.punchCooldown[label] = now;
        this.lastPunch = { hand: label, type, power, time: now, reach: travelDistance };
        
        // Fire callback with reach info
        if (this.onPunch) {
          this.onPunch(label, type, power, hand.x, hand.y, travelDistance);
        }
        
        // Reset state
        state.reaching = false;
        state.extended = false;
      } else if (punchTimedOut && !isExtended) {
        // Punch attempt failed - not enough extension
        state.reaching = false;
        state.extended = false;
      }
    }
  }

  /* ─── Guard Detection ──────────────────────── */
  _updateGuard(now) {
    const L = this.hands.left;
    const R = this.hands.right;

    if (!L.visible || !R.visible) {
      if (this.isGuarding) {
        this.isGuarding = false;
        if (this.onGuardChange) this.onGuardChange(false);
      }
      return;
    }

    // Guard: both hands visible, both above threshold, both near center-ish, fists closed
    const bothHigh = L.y < this.GUARD_Y_THRESHOLD && R.y < this.GUARD_Y_THRESHOLD;
    const bothCenter = Math.abs(L.x - 0.5) < this.GUARD_X_RANGE && Math.abs(R.x - 0.5) < this.GUARD_X_RANGE;
    const handsClose = Math.abs(L.x - R.x) < 0.35;

    const shouldGuard = bothHigh && bothCenter && handsClose;

    if (shouldGuard && !this.isGuarding) {
      this.isGuarding = true;
      this.guardStartTime = now;
      if (this.onGuardChange) this.onGuardChange(true);
    } else if (!shouldGuard && this.isGuarding) {
      this.isGuarding = false;
      if (this.onGuardChange) this.onGuardChange(false);
    }
  }

  /* ─── Dodge Detection ──────────────────────── */
  _updateDodge(now) {
    if (now - this.dodgeCooldown < this.DODGE_COOLDOWN_MS) return;

    const L = this.hands.left;
    const R = this.hands.right;

    if (!L.visible && !R.visible) {
      this.dodgeDirection = null;
      return;
    }

    // Average X of visible hands
    let avgX = 0.5;
    let count = 0;
    if (L.visible) { avgX += L.x; count++; }
    if (R.visible) { avgX += R.x; count++; }
    if (count > 0) avgX = (avgX - 0.5) / count + 0.5; // recalculate properly
    if (count === 0) avgX = 0.5;
    if (count > 0) {
      avgX = 0;
      if (L.visible) avgX += L.x;
      if (R.visible) avgX += R.x;
      avgX /= count;
    }

    // Smooth center tracking
    this.centerSmooth = this.centerSmooth * 0.95 + avgX * 0.05;

    // Check for dodge (sudden shift from center)
    const shift = avgX - 0.5;

    let newDodge = null;
    if (shift < -this.DODGE_X_THRESHOLD) {
      newDodge = 'left';
    } else if (shift > this.DODGE_X_THRESHOLD) {
      newDodge = 'right';
    }

    if (newDodge && newDodge !== this.dodgeDirection) {
      this.dodgeDirection = newDodge;
      this.dodgeCooldown = now;
      if (this.onDodge) this.onDodge(newDodge);
    } else if (!newDodge) {
      this.dodgeDirection = null;
    }
  }

  /* ─── Get fist screen positions for rendering ─── */
  getFistPositions() {
    return {
      left: {
        x: this.hands.left.x,
        y: this.hands.left.y,
        visible: this.hands.left.visible,
        closed: this.hands.left.fistClosed,
        reaching: this.punchState.left.reaching,
        forwardZ: this.hands.left.forwardZ || 0
      },
      right: {
        x: this.hands.right.x,
        y: this.hands.right.y,
        visible: this.hands.right.visible,
        closed: this.hands.right.fistClosed,
        reaching: this.punchState.right.reaching,
        forwardZ: this.hands.right.forwardZ || 0
      }
    };
  }
}
