# 🎮 How to Add a New Game to GESTURE ARENA

## Folder Structure

Create your game folder under `/games/`:

```
games/
  your-game/
    index.html    ← Game page (loads from here)
    game.js       ← Your game logic
    style.css     ← Game-specific styles
    ...           ← Any other files
```

## Step 1: Create Your Game Folder

```
games/my-awesome-game/
```

## Step 2: Register Your Game in `platform.js`

Open `/platform.js` and find the `DOMContentLoaded` section. Add:

```javascript
platform.registerGame({
  id: 'my-awesome-game',        // unique ID
  title: 'MY AWESOME GAME',     // display title
  emoji: '🎯',                  // card emoji
  description: 'Description of your game.', // short tagline
  color: '#4488ff',             // theme color for card glow
  path: 'games/my-awesome-game/index.html', // path to game page
  comingSoon: false             // set true for placeholder cards
});
```

## Step 3: Build Your Game Page

Your `games/my-awesome-game/index.html` should include:

1. **A back button** to return to the hub:
```html
<button id="back-to-hub" onclick="window.location.href='../../index.html'">
  ← GAMES
</button>
```

2. **MediaPipe Hands** (if you use hand tracking):
```html
<script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"></script>
```

3. Or use the shared **HandCursor** module:
```html
<script src="../../hand-tracker.js"></script>
<script>
  const cursor = new HandCursor({
    onReady: () => console.log('Hands ready!'),
    onPinch: (x, y) => console.log('Pinched at', x, y),
    onMove: (x, y) => { /* cursor moved */ }
  });
  cursor.init();
</script>
```

## Hand Tracking API (hand-tracker.js)

The shared `HandCursor` class gives you:

| Method/Property | Description |
|----------------|-------------|
| `cursor.init()` | Start camera + hand tracking |
| `cursor.getPosition()` | Get `{x, y, screenX, screenY, visible, pinching, pointing}` |
| `cursor.isOver(element)` | Check if finger is hovering over a DOM element |
| `cursor.destroy()` | Cleanup camera and DOM |
| `onPinch(x, y)` | Callback: user pinched (thumb + index) |
| `onRelease(x, y)` | Callback: user released pinch |
| `onMove(x, y)` | Callback: finger moved |
| `onResults(results)` | Callback: raw MediaPipe results for full landmark access |

## Tips

- **Keep emoji gloves 🥊** — they track better than 3D models
- Test with mouse fallback (clicks always work too)
- Use the `onResults` callback if you need full hand landmark data
- Each game is a separate HTML page — total isolation, no conflicts
