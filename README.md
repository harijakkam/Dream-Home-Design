<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0-6366f1?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/build-static-22c55e?style=for-the-badge" alt="Build">
  <img src="https://img.shields.io/badge/license-MIT-94a3b8?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/dependencies-zero-f59e0b?style=for-the-badge" alt="Dependencies">
</p>

# 🏠 Roomio — 2D Floor Plan Designer

A **professional, zero-install** browser-based architectural floor plan designer with Vastu grid support, multi-tab workspaces, and a live JSON editor. Built entirely with vanilla HTML5 Canvas, CSS, and JavaScript — no frameworks, no build step, no backend.

> Drop the folder on any static web server and it just works.

---

## ✨ Features

### 🏗️ Design Tools
- **Wall Tool** — Draw walls with configurable thickness (1–36 inches), solid or dotted line styles, and altitude metadata
- **Room Tool** — Drag to create rectangular rooms with live dimension display
- **Measurement Tool** — Non-structural measurement lines with architectural notation
- **Text Labels** — Place editable text annotations with adjustable font size (8–72px)

### 🪑 Furniture & Elements
> All elements are defined in a **declarative registry** — adding new ones requires zero engine changes.

| Element | Element | Element |
|---------|---------|---------|
| 🚪 Door (with swing arc) | 🪟 Window | 🪜 Stairs |
| 🛏️ Bed (with pillows) | 🍽️ Table (elliptical) | 📚 Bookshelf |
| 🚽 Commode | 🫧 Washing Machine | 🪑 Chair |
| 🛋️ Sofa (with armrests) | 🏷️ Text Label | ➕ *Extensible...* |

### 🧭 Vastu Shastra Grid
- 9-zone overlay aligned to cardinal directions (North, South, East, West + diagonals)
- Adjustable North offset angle (0–359°)
- Color-coded zones with function labels (Kitchen, Pooja Room, Master Bed, etc.)
- Functional compass overlay with real-time rotation

### 🎨 Advanced Interaction
- **Multi-select** — Shift+click or marquee drag to select multiple objects
- **Copy/Cut/Paste** — Ctrl+C, Ctrl+X, Ctrl+V with offset duplication
- **Rotate & Flip** — 90° rotation, horizontal/vertical flip for all objects
- **Resize handles** — Drag corners to resize rooms, objects, and wall endpoints
- **Zoom & Pan** — Scroll to zoom, middle-click or Alt+drag to pan, space+drag to pan
- **Grid snapping** — 1-inch precision architectural snapping
- **Background color** — Fully customizable with automatic contrast adaptation

### 📐 Architectural Precision
- **1-inch grid snapping** — All coordinates snap to 1-inch increments
- **Architectural notation** — Dimensions display as `5' 4"` or `10"` format
- **Corner angle display** — Auto-detects wall intersections and shows the angle between them
- **Square wall endpoints** — Professional architectural `butt` line caps

### 🗂️ Multi-Tab Workspace
- Create unlimited design tabs for parallel schemes
- Each tab maintains independent scene state
- Rename tabs via pencil button or double-click
- Close tabs (minimum one required)

### 🧩 UI & Panels
- **Collapsible sidebar** — Hide/show the entire toolbar to maximize canvas space
- **Collapsible Elements section** — Minimize the elements list within the sidebar
- **Minimizable Properties panel** — Collapse the properties inspector
- **Floating JSON Editor** — Draggable, resizable live editor window with JSON validation

### 💾 Project I/O
- **Save** — Export the current scene as a timestamped `.json` file
- **Load** — Import any previously saved `.json` project
- **Export PNG** — Render the design to a downloadable image
- **Live JSON Editor** — Edit the raw scene array in real-time with validation feedback

---

## 🚀 Getting Started

### Option 1: Just Open It
```
Double-click index.html → Opens in your browser. Done.
```

### Option 2: Local Dev Server (with live-reload)
```bash
npm start
# or
npx -y live-server --port=3000 --open=index.html
```

### Option 3: Static Preview
```bash
npm run preview
# or
npx -y http-server -p 3000 -o
```

> **No Node.js required for basic usage.** The app is a static site — `index.html` works offline out of the box.

---

## 🌐 Deployment

### Netlify
Push to a Git repo → connect to Netlify → auto-deploys from `netlify.toml`:
```toml
[build]
  publish = "."
  command = "echo 'Static site, no build needed'"
```

### Vercel
Push to a Git repo → connect to Vercel → auto-deploys from `vercel.json`:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

### GitHub Pages
Settings → Pages → Source: `main` branch, folder `/` → Save.

### Any Static Host
Upload all `.html`, `.css`, `.js` files. No build step. No server runtime.

---

## 🏛️ Architecture

```
┌────────────────────────────────────────────────────┐
│                    index.html                       │
│  (Structure, meta tags, script load order)          │
├────────────────────────────────────────────────────┤
│  event-bus.js  │  Pub/sub infrastructure            │
│  elements.js   │  Declarative element registry      │
│  canvas-engine │  Rendering, hit detection, grid    │
│  tools.js      │  Mouse/keyboard interaction logic  │
│  app.js        │  UI wiring, tabs, panels, I/O      │
│  style.css     │  Design system & layouts            │
└────────────────────────────────────────────────────┘
```

### Element Registry Pattern
Adding a new element requires **one function call** in `elements.js`:

```javascript
ElementRegistry.register({
    id: 'bathtub',           // Tool ID and subType
    name: 'Bathtub',         // Display name in sidebar
    icon: 'droplets',        // Lucide icon name
    width: 80,               // Default width (pixels)
    height: 160,             // Default height (pixels)
    extraProps: {},           // Additional scene properties
    draw(ctx, hw, hh, w, h, scale, shape, colors) {
        // Custom canvas drawing code
        ctx.fillRect(-hw, -hh, w, h);
        ctx.strokeRect(-hw, -hh, w, h);
    }
});
```

Then add a button in `index.html`:
```html
<button class="tool-btn" data-tool="bathtub" title="Add Bathtub">
    <i data-lucide="droplets"></i> Bathtub
</button>
```

That's it. No engine or tools code changes needed.

### Script Load Order
```
event-bus.js → elements.js → canvas-engine.js → tools.js → app.js
```
Each module depends only on the ones loaded before it.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Copy selected items |
| `Ctrl+X` | Cut selected items |
| `Ctrl+V` | Paste with offset |
| `Delete` / `Backspace` | Delete selected |
| `Escape` | Clear selection / cancel drawing |
| `Space` (hold) | Temporary pan mode |
| `Shift+Click` | Add to selection |
| `Alt+Drag` | Pan canvas |
| `Scroll` | Zoom in/out |

---

## 📁 File Structure

```
roomio/
├── index.html          Main HTML (UI structure + SEO)
├── style.css           Design system & component styles
├── event-bus.js        Lightweight pub/sub event bus
├── elements.js         Declarative element registry
├── canvas-engine.js    Core rendering & hit detection engine
├── tools.js            Tool interaction handlers
├── app.js              Application wiring & UI controllers
├── package.json        npm scripts for dev & preview
├── netlify.toml        Netlify deployment config
├── vercel.json         Vercel deployment config
├── .gitignore          Git ignore rules
└── *.json              Sample project files
```

---

## 🔧 Technical Notes

- **Rendering**: HTML5 Canvas 2D with `requestAnimationFrame`-style updates on interaction
- **Contrast Engine**: ITU-R BT.709 Luma-based complementary color generation (cached, not per-frame)
- **Grid**: 25px = 1 foot, snapping at 1-inch increments (`gridSize / 12`)
- **State**: Scene stored as a flat JSON array — fully serializable, no circular references
- **Tabs**: Each tab stores a deep-cloned copy of the scene in a `Map`
- **Icons**: [Lucide](https://lucide.dev/) loaded via CDN
- **Fonts**: [Inter](https://fonts.google.com/specimen/Inter) from Google Fonts

---

## 📄 License

MIT — use it however you like.
