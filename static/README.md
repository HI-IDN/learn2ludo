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
├── styles/
│   ├── css/
│   │   └── main.css
│   ├── base/
│   ├── components/
│   ├── features/
│   ├── layout/
│   └── main.scss
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

## 🎨 CSS Compilation
This project uses Sass (SCSS) for styling.
### ✅ Compile and watch for changes
Run the following command from the `static` directory:

    npx sass styles/main.scss styles/css/main.css

### 📁 What this does

Compiles:
    
    styles/main.scss → styles/css/main.css

---

## ✅ Summary

Lightweight, modular frontend for Learn2Ludo.
