
# 🧠 Computer Rules (Formal Spec)

This file defines the **authoritative game logic** using state machines and flowcharts.

---

# ✅ 1. State Machine (Authoritative)

```mermaid
stateDiagram-v2
    [*] --> Rolling
    Rolling --> Moving : roll dice
    Moving --> Rolling : rolled 6
    Moving --> NextPlayer : normal end
    NextPlayer --> Rolling
    Moving --> Finished : win
    Finished --> [*]
```

---

# ✅ 2. Turn Flow

```mermaid
flowchart TD
    A[Start Turn] --> B[Roll Dice]
    B --> C{Valid Moves?}

    C -->|No| D[End Turn]
    C -->|Yes| E[Select Move]

    E --> F[Apply Move]
    F --> G{Roll == 6?}

    G -->|Yes| B
    G -->|No| D

    D --> H[Next Player]
```

---

# ✅ 3. Move Validation

```mermaid
flowchart TD
    A[Piece Selected] --> B{In Yard?}

    B -->|Yes| C{Roll == 6?}
    C -->|No| X[Invalid]
    C -->|Yes| D[Enter Board]

    B -->|No| E[Compute Target]

    E --> F{Exact Finish?}
    F -->|No| G[Continue]
    F -->|Yes| H[Finish]

    G --> I{Blocked?}
    I -->|Yes| X
    I -->|No| J[Move Piece]
```

---

# ✅ 4. Capture Logic

```mermaid
flowchart TD
    A[Landing Tile] --> B{Safe Haven?}
    B -->|Yes| C[No Capture]
    B -->|No| D{Opponent Present?}

    D -->|Yes| E[Send Opponent to Yard]
    D -->|No| F[No Action]
```

---

# ✅ 5. Blockade Rules

```mermaid
flowchart TD
    A[Check Path] --> B{Tile has >= 2 pieces?}
    B -->|Yes| C[Block Movement]
    B -->|No| D[Continue]
```

---

# ✅ 6. Win Condition

```mermaid
flowchart TD
    A[Check Player Pieces] --> B{All finished?}
    B -->|Yes| C[Game Ends]
    B -->|No| D[Continue]
```

---

# ✅ Guarantees

- no invalid state transitions
- no illegal moves
- deterministic gameplay
- fairness handled separately

