
# 🏗️ Design

## Architecture Overview

```
engine → gameplay → CLI (play)
```

---

## 1. engine.py

Core system:
- board geometry
- player slots (fairness)
- state machine (phases)

No gameplay rules here.

---

## 2. gameplay.py

Implements Ludo rules:
- piece movement
- captures
- blockades
- win logic

Depends on engine.

---

## 3. play.py

User interface layer:
- CLI interaction
- player input
- AI decisions

---

## Principles

- Separation of concerns
- Deterministic engine
- Configurable game structure
- Testable rules

---

## Data Flow

```
User Input → Engine (state) → Gameplay (rules) → Output
```

---

## Extensibility

Supports:
- new rule sets
- AI improvements
- UI upgrades
