import pytest
from fastapi.testclient import TestClient
from datetime import datetime

import server
from game.engine import Phase


def _new_game_payload(equal_rounds: bool = True) -> dict:
    return {
        "num_players": 4,
        "rules": {
            "equal_rounds": equal_rounds,
            "empty_board_rolls": 3,
        },
        "config": {
            "player_count": 4,
            "board": {
                "track_size": 52,
                "yard_count": 4,
                "home_length": 6,
                "safe_offset": 7,
                "pawns_per_player": 4,
            },
        },
    }


def _finish_all(session, player: int):
    ts = session.game.board.track_size
    hl = session.game.config.board.home_length
    done = ts + hl - 2
    for piece in session.gp.pieces:
        if piece.player == player:
            piece.pos = done
            piece.finished = True


def _advance_turn_via_skip(client: TestClient, expected_player: int, expect_finished: bool = False) -> dict:
    session = server.active_game
    session.game.phase = Phase.NEXT
    r = client.post("/api/game/skip")
    assert r.status_code == 200
    state = r.json()
    assert state["current_player"] == expected_player
    if expect_finished:
        assert state["phase"] == "finished"
    else:
        assert state["phase"] != "finished"
    return state


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(server, "load_stats", lambda: {
        "games_played": 0,
        "training_sessions": 0,
        "best_win_rate": 0.0,
        "history": [],
    })
    monkeypatch.setattr(server, "save_stats", lambda _stats: None)
    server.active_game = None
    with TestClient(server.app) as c:
        yield c
    server.active_game = None


def test_api_equal_rounds_finishes_on_provisional_winner_wrap(client: TestClient):
    r = client.post("/api/game/new", json=_new_game_payload(equal_rounds=True))
    assert r.status_code == 200

    session = server.active_game
    _finish_all(session, 2)
    session._finishing_round_player = 2
    session.game.player = 2

    _advance_turn_via_skip(client, expected_player=3)
    _advance_turn_via_skip(client, expected_player=0)
    _advance_turn_via_skip(client, expected_player=1)
    state = _advance_turn_via_skip(client, expected_player=2, expect_finished=True)

    assert state["winner"] == 2
    assert state["winners"] == [2]


def test_api_equal_rounds_reports_co_winners_at_cutoff(client: TestClient):
    r = client.post("/api/game/new", json=_new_game_payload(equal_rounds=True))
    assert r.status_code == 200

    session = server.active_game
    _finish_all(session, 2)
    _finish_all(session, 1)
    session._finishing_round_player = 2
    session.game.player = 2

    _advance_turn_via_skip(client, expected_player=3)
    _advance_turn_via_skip(client, expected_player=0)
    _advance_turn_via_skip(client, expected_player=1)
    state = _advance_turn_via_skip(client, expected_player=2, expect_finished=True)

    assert state["winner"] == 2
    assert state["winners"] == [1, 2]


def test_api_move_persists_justification_and_timestamp(client: TestClient):
    r = client.post("/api/game/new", json=_new_game_payload(equal_rounds=False))
    assert r.status_code == 200

    session = server.active_game
    session.game.player = 0
    session.game.last_roll = 6
    session.game.phase = Phase.MOVING

    r = client.post("/api/game/move", json={
        "piece_idx": 0,
        "target": 0,
        "justification": "  Open with R1.  ",
    })
    assert r.status_code == 200

    move = next(e for e in reversed(r.json()["game"]["history"]) if e.get("type") == "move")
    assert move["justification"] == "  Open with R1.  "
    assert move["timestamp"].endswith("Z")
    datetime.fromisoformat(move["timestamp"].replace("Z", "+00:00"))


def test_game_player_registry_uses_uuid_and_seed(client: TestClient):
    payload = _new_game_payload(equal_rounds=False)
    payload["seeds"] = [11, 22, 33, 44]
    payload["config"]["player_refs"] = [
        {"player_index": 0, "player_uuid": "uuid-a", "type": "human"},
        {"player_index": 1, "type": "random", "bot_id": "ares"},
        {"player_index": 2, "player_uuid": "uuid-c", "type": "human"},
        {"player_index": 3, "type": "random", "bot_id": "bot-custom", "designer_uuid": "uuid-designer"},
    ]

    r = client.post("/api/game/new", json=payload)
    assert r.status_code == 200

    registry = server.build_game_player_registry(server.active_game)

    assert registry[0] == {
        "player_index": 0,
        "player_uuid": "uuid-a",
        "seed": 11,
        "type": "human",
        "bot_id": None,
        "designer_uuid": None,
    }
    assert registry[3] == {
        "player_index": 3,
        "player_uuid": None,
        "seed": 44,
        "type": "random",
        "bot_id": "bot-custom",
        "designer_uuid": "uuid-designer",
    }


def test_reflection_sanitize_removes_display_name():
    reflections = server.sanitize_reflections([{
        "player": 0,
        "player_uuid": "uuid-a",
        "name": "Pallas",
        "description": "Careful opening.",
    }])

    assert reflections == [{
        "player": 0,
        "player_uuid": "uuid-a",
        "description": "Careful opening.",
    }]
