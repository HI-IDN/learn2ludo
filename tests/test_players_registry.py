from fastapi.testclient import TestClient

import server


def test_register_player_stores_anonymous_user_by_uuid(tmp_path, monkeypatch):
    players_path = tmp_path / "players.json"
    monkeypatch.setattr(server, "PLAYERS_PATH", players_path)

    with TestClient(server.app) as client:
      r = client.post("/api/players/register", json={
          "id": "player-uuid-1",
          "icon": "fa-face-smile",
          "age_range": "18-29",
          "consent_ts": 1717440000000,
          "leaderboard_opt_in": True,
      })

      assert r.status_code == 201
      users = client.get("/api/players").json()["users"]

    assert set(users) == {"player-uuid-1"}
    assert users["player-uuid-1"] == {
        "id": "player-uuid-1",
        "icon": "fa-face-smile",
        "age_range": "18-29",
        "joined_ts": 1717440000000,
        "last_consent_ts": 1717440000000,
        "leaderboard_opt_in": True,
    }
    assert "username" not in users["player-uuid-1"]


def test_register_player_update_preserves_joined_timestamp(tmp_path, monkeypatch):
    players_path = tmp_path / "players.json"
    monkeypatch.setattr(server, "PLAYERS_PATH", players_path)

    with TestClient(server.app) as client:
      client.post("/api/players/register", json={
          "id": "player-uuid-1",
          "icon": "fa-face-smile",
          "age_range": "18-29",
          "consent_ts": 1717440000000,
      })
      client.post("/api/players/register", json={
          "id": "player-uuid-1",
          "icon": "fa-face-grin",
          "age_range": "30-44",
          "consent_ts": 1717443600000,
          "leaderboard_opt_in": False,
      })
      user = client.get("/api/players").json()["users"]["player-uuid-1"]

    assert user["joined_ts"] == 1717440000000
    assert user["last_consent_ts"] == 1717443600000
    assert user["icon"] == "fa-face-grin"
    assert user["age_range"] == "30-44"
