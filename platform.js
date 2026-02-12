/* ═══════════════════════════════════════════════════════════
   🎮 GAME PLATFORM — Core Platform Engine (platform.js)
   Game registry, hand-based menu navigation, hover/select
   ═══════════════════════════════════════════════════════════ */

class GamePlatform {
  constructor() {
    // Registered games
    this.games = [];

    // Hand cursor
    this.handCursor = null;

    // Hover state
    this.hoveredCard = null;
    this.hoverStartTime = 0;
    this.HOVER_SELECT_MS = 1200; // hold finger over card for 1.2s to auto-select
    this.hoverProgress = 0;

    // DOM
    this.gameGrid = null;
    this.statusEl = null;
    this.progressRing = null;

    // State
    this.state = 'loading'; // loading, ready, selecting
  }

  /* ─── Register a Game ───────────────────────── */
  registerGame(gameConfig) {
    // gameConfig: { id, title, emoji, description, color, path, comingSoon }
    this.games.push(gameConfig);
  }

  /* ─── Initialize Platform ───────────────────── */
  async init() {
    this.gameGrid = document.getElementById('game-grid');
    this.statusEl = document.getElementById('platform-status');

    // Render game cards
    this._renderGameCards();

    // Setup hand tracking
    this.statusEl.textContent = '📷 Starting camera & hand tracking...';

    this.handCursor = new HandCursor({
      onReady: () => {
        this.state = 'ready';
        this.statusEl.textContent = '🖐️ Show your palm over a game to select!';
        this.statusEl.classList.add('ready');
        // Unhide instructions
        document.getElementById('instructions').classList.remove('hidden');

        // Pipe hand-tracker's camera stream into webcam preview
        const previewCam = document.getElementById('preview-cam');
        if (previewCam && this.handCursor) {
          const stream = this.handCursor.getStream();
          if (stream) previewCam.srcObject = stream;
        }
      },
      onError: (err) => {
        this.statusEl.textContent = '❌ Camera error: ' + err.message;
        this.statusEl.classList.add('error');
        // Enable mouse fallback
        this._enableMouseFallback();
      },
      onPinch: (x, y) => {
        this._onSelect(x, y);
      },
      onMove: (x, y) => {
        this._onCursorMove(x, y);
      },
      onPalmOpen: (x, y) => {
        // Palm gesture also drives hover detection
        this._onCursorMove(x, y);
      }
    });

    await this.handCursor.init();

    // Also allow mouse as fallback
    this._enableMouseFallback();

    // Start update loop
    this._update();
  }

  /* ─── Render Game Cards ─────────────────────── */
  _renderGameCards() {
    this.gameGrid.innerHTML = '';

    this.games.forEach((game, index) => {
      const card = document.createElement('div');
      card.className = 'game-card' + (game.comingSoon ? ' coming-soon' : '');
      card.dataset.gameId = game.id;
      card.dataset.index = index;

      card.innerHTML = `
        <div class="game-card-glow" style="--card-color: ${game.color}"></div>
        <div class="game-card-inner">
          <div class="game-emoji">${game.emoji}</div>
          <div class="game-title">${game.title}</div>
          <div class="game-desc">${game.description}</div>
          ${game.comingSoon ? '<div class="coming-soon-badge">🔒 COMING SOON</div>' : ''}
          <div class="hover-progress-ring">
            <svg viewBox="0 0 100 100">
              <circle class="ring-bg" cx="50" cy="50" r="45"/>
              <circle class="ring-fill" cx="50" cy="50" r="45"/>
            </svg>
          </div>
        </div>
      `;

      // Mouse click fallback
      card.addEventListener('click', () => {
        if (!game.comingSoon) this._launchGame(game);
      });

      this.gameGrid.appendChild(card);
    });
  }

  /* ─── Cursor Move — Hover Detection ─────────── */
  _onCursorMove(x, y) {
    const cards = document.querySelectorAll('.game-card:not(.coming-soon)');
    let foundHover = null;

    cards.forEach(card => {
      if (this.handCursor.isOver(card)) {
        foundHover = card;
        card.classList.add('hovered');
      } else {
        card.classList.remove('hovered');
      }
    });

    // Hover progress tracking
    if (foundHover !== this.hoveredCard) {
      // Reset progress on previous card
      if (this.hoveredCard) {
        this._setCardProgress(this.hoveredCard, 0);
      }
      this.hoveredCard = foundHover;
      this.hoverStartTime = foundHover ? Date.now() : 0;
      this.hoverProgress = 0;
    }
  }

  /* ─── Pinch Select ──────────────────────────── */
  _onSelect(x, y) {
    const cards = document.querySelectorAll('.game-card:not(.coming-soon)');

    cards.forEach(card => {
      if (this.handCursor.isOver(card)) {
        const gameId = card.dataset.gameId;
        const game = this.games.find(g => g.id === gameId);
        if (game) {
          card.classList.add('selected');
          setTimeout(() => this._launchGame(game), 400);
        }
      }
    });
  }

  /* ─── Launch Game ───────────────────────────── */
  _launchGame(game) {
    // Transition animation
    document.body.classList.add('launching');

    // Show launch overlay
    const overlay = document.getElementById('launch-overlay');
    const launchEmoji = document.getElementById('launch-emoji');
    const launchTitle = document.getElementById('launch-title');
    launchEmoji.textContent = game.emoji;
    launchTitle.textContent = game.title;
    overlay.classList.remove('hidden');

    // Cleanup hand tracking before navigating
    setTimeout(() => {
      if (this.handCursor) this.handCursor.destroy();
      window.location.href = game.path;
    }, 1200);
  }

  /* ─── Update Loop (hover progress) ──────────── */
  _update() {
    if (this.hoveredCard && this.hoverStartTime > 0) {
      const elapsed = Date.now() - this.hoverStartTime;
      this.hoverProgress = Math.min(1, elapsed / this.HOVER_SELECT_MS);
      this._setCardProgress(this.hoveredCard, this.hoverProgress);

      // Auto-select on full hover
      if (this.hoverProgress >= 1) {
        this.hoverStartTime = 0;
        const gameId = this.hoveredCard.dataset.gameId;
        const game = this.games.find(g => g.id === gameId);
        if (game) {
          this.hoveredCard.classList.add('selected');
          setTimeout(() => this._launchGame(game), 400);
        }
      }
    }

    requestAnimationFrame(() => this._update());
  }

  /* ─── Set card hover progress ring ──────────── */
  _setCardProgress(card, progress) {
    const ring = card.querySelector('.ring-fill');
    if (ring) {
      const circumference = 2 * Math.PI * 45;
      const offset = circumference * (1 - progress);
      ring.style.strokeDasharray = circumference;
      ring.style.strokeDashoffset = offset;
      ring.style.opacity = progress > 0 ? '1' : '0';
    }
  }

  /* ─── Mouse Fallback ────────────────────────── */
  _enableMouseFallback() {
    const cards = document.querySelectorAll('.game-card:not(.coming-soon)');
    cards.forEach(card => {
      card.addEventListener('mouseenter', () => card.classList.add('hovered'));
      card.addEventListener('mouseleave', () => card.classList.remove('hovered'));
    });
  }
}

// ═══ REGISTER GAMES & INIT ═══
document.addEventListener('DOMContentLoaded', () => {
  const platform = new GamePlatform();

  // 🥊 Game 1: Boxing
  platform.registerGame({
    id: 'boxing',
    title: 'KNOCKOUT',
    emoji: '🥊',
    description: 'Real hand-tracking boxing! Punch, guard & dodge with your fists.',
    color: '#ff4400',
    path: 'games/boxing/index.html',
    comingSoon: false
  });

  // 🐦 Game 2: Flappy Finger
  platform.registerGame({
    id: 'flappy',
    title: 'FLAPPY FINGER',
    emoji: '🐦',
    description: 'Fly through pipes by pointing your finger up and down!',
    color: '#44cc88',
    path: 'games/flappy/index.html',
    comingSoon: false
  });

  // 🌌 Game 3: Particle Forge
  platform.registerGame({
    id: '3d-play',
    title: 'PARTICLE FORGE',
    emoji: '🌌',
    description: 'Manipulate 20K particles into 9 shapes with your hands!',
    color: '#8844ff',
    path: 'games/3d-play/index.html',
    comingSoon: false
  });

  // 🍉 Game 4: Fruit Ninja
  platform.registerGame({
    id: 'fruit-ninja',
    title: 'FRUIT NINJA',
    emoji: '🍉',
    description: 'Slice flying fruits with your finger swipe! Avoid bombs!',
    color: '#ff4400',
    path: 'games/fruit-ninja/index.html',
    comingSoon: false
  });

  platform.init();
});
