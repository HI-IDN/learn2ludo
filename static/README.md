# 🎨 Learn2Ludo Frontend

## 🚀 Quick Start

Run the server:

    python server.py

Open:

    http://localhost:8000

---

## 📁 Structure

```
static/
├── index.html
├── theme.css
├── css/
│   ├── board.css
│   └── controls.css
├── js/
│   ├── app.js
│   ├── sound.js
│   └── loader.js
├── components/
│   ├── header.html
│   └── play.html
├── config/
│   └── sound.json
├── favicon.svg
└── logo.svg
```
---

## 🧠 Architecture

index.html → loader.js → components → app.js

---

## 🎮 UI Panels

- Play
- Train (stub)
- Settings
- Stats
- Bots
- Admin

---

## ⚙️ Design Principles

- modular components
- no frameworks
- clean separation of UI vs logic

---

## 🔄 Data Flow

User → UI → backend → engine → UI update

---

## ✅ Summary

Lightweight, modular frontend for Learn2Ludo.
