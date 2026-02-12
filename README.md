# 🎮 VR Games Platform

A **hand-tracking game platform** built entirely with vanilla JavaScript and MediaPipe. No controllers needed — just your hands and a webcam.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![MediaPipe](https://img.shields.io/badge/MediaPipe-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white)

---

## ✨ Features

- **🖐️ Palm Hover-to-Select** — Show your open palm over any button to auto-select (no clicking!)
- **🔫 Gun-Point Gesture** — Point your index finger like a gun for precise in-game aiming
- **🎯 One-Euro Filter** — Adaptive smoothing for buttery-smooth hand tracking with zero perceived lag
- **⚡ Synchronous Detection** — Zero-latency MediaPipe Tasks Vision API with GPU acceleration
- **🎮 5 Games** — Each with unique mechanics, all controlled by your hands

---

## 🕹️ Games

| Game | Description | Controls |
|------|-------------|----------|
| 🍉 **Fruit Ninja** | Slice fruits, dodge bombs | 🔫 Point to aim, 🖐️ Palm for menus |
| 🐦 **Flappy Finger** | Navigate through pipes | ☝️ Finger height = bird height, 🤏 Pinch = flap |
| 🥊 **KNOCKOUT** | Real-time boxing | 👊 Punch forward, 🛡️ Guard, ↔️ Dodge |
| 🌌 **Particle Forge** | 3D particle manipulation | 🤏 Pinch to grab & rotate, ✌️ Peace = cycle shapes |
| 🎨 **3D Object Play** | Interactive 3D objects | 🤏 Pinch to interact, 🖐️ Open palm to release |

---

## 🚀 Getting Started

### Prerequisites
- A modern browser (Chrome, Edge, or Firefox)
- A webcam

### Run Locally

```bash
# Clone the repo
git clone https://github.com/Rikinshah787/VR-Games-Platform.git
cd VR-Games-Platform

# Serve locally (any static server works)
npx serve .
```

Then open **http://localhost:3000** in your browser.

> **Note:** Camera access is required. Allow the browser permission when prompted.

---

## 🎯 Gesture Guide

| Gesture | What It Does |
|---------|-------------|
| 🖐️ **Open Palm** | Menu navigation — hover over buttons to select |
| ☝️ **Point (Index Finger)** | Gameplay cursor / aiming |
| 🤏 **Pinch (Thumb + Index)** | Select, grab objects, flap |
| ✊ **Fist** | Punch (boxing), confirm actions |
| ✌️ **Peace Sign** | Cycle shapes (Particle Forge) |

---

## 🏗️ Tech Stack

- **MediaPipe Tasks Vision** — Real-time hand landmark detection (21 points per hand)
- **Three.js** — 3D rendering for Particle Forge & 3D Object Play
- **Web Audio API** — Dynamic sound effects
- **Canvas 2D** — Fruit Ninja & Flappy Finger rendering
- **One-Euro Filter** — Adaptive signal smoothing algorithm
- **GSAP** — Boxing animations

---

## 📁 Project Structure

```
VR-Games-Platform/
├── index.html          # Hub — Game selection screen
├── platform.js         # Hub logic (hover-to-select cards)
├── platform.css        # Hub styles
├── hand-tracker.js     # Shared hand tracking module (One-Euro Filter)
│
├── games/
│   ├── fruit-ninja/    # 🍉 Fruit Ninja
│   │   ├── index.html
│   │   ├── fruit-ninja.js
│   │   └── style.css
│   │
│   ├── flappy/         # 🐦 Flappy Finger
│   │   ├── index.html
│   │   ├── flappy.js
│   │   └── style.css
│   │
│   ├── boxing/         # 🥊 KNOCKOUT
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── boxing.js
│   │   ├── game.js
│   │   ├── opponent.js
│   │   ├── sound.js
│   │   ├── vfx.js
│   │   └── style.css
│   │
│   └── 3d-play/        # 🌌 Particle Forge
│       ├── index.html
│       ├── main.js
│       └── styles.css
│
└── Playwith3D-Object/  # 🎨 3D Object Play
    ├── index.html
    ├── main.js
    └── styles.css
```

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/new-game`)
3. Commit your changes (`git commit -m 'Add new game'`)
4. Push to the branch (`git push origin feature/new-game`)
5. Open a Pull Request

See [ADD_GAME_GUIDE.md](ADD_GAME_GUIDE.md) for instructions on adding new games to the platform.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<p align="center">
  <strong>Built with 🖐️ hands, not controllers</strong>
</p>
