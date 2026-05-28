# 🎲 Ludo Engine (CLI + Configurable Rules)

## 🚀 Quick Start

Play the game:

    python play.py 2p
    python play.py 3p

---

## 📁 Project Structure

- engine.py      → core rules (board + state machine)
- gameplay.py    → gameplay logic (moves, capture, blockades)
- play.py        → CLI interface (human + AI)
- test_engine.py → engine tests
- test_gameplay.py → gameplay tests

Docs:
- computer_rules.md → formal rules
- rules.md → human rules
- design.md → system design

---

## 🧠 How it works

engine → gameplay → play (CLI)

---

## 🎮 Rules (TL;DR)

- roll 6 to enter
- exact finish required
- capture sends opponent home
- safe zones protect
- blockades block movement

---

Enjoy 🎲
