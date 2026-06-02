import pytest
from fastapi.testclient import TestClient

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
    state = _advance_turn_via_skip(client, expected_player=0, expect_finished=True)

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
    state = _advance_turn_via_skip(client, expected_player=0, expect_finished=True)

    assert state["winner"] == 2
    assert state["winners"] == [1, 2]
