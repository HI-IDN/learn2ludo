import json

from game import bots


def test_custom_bots_live_under_data():
    assert bots.BOTS_CUSTOM_PATH.name == "bots_custom.json"
    assert bots.BOTS_CUSTOM_PATH.parent.name == "data"


def test_save_custom_bot_creates_data_file(tmp_path, monkeypatch):
    custom_path = tmp_path / "data" / "bots_custom.json"
    monkeypatch.setattr(bots, "BOTS_CUSTOM_PATH", custom_path)

    bots.save_custom_bot({
        "id": "bot-test",
        "name": "Test Bot",
        "tldr": "Test",
        "description": "A test bot.",
        "designer": "player-uuid-1",
        "weights": {"capture": 1},
    })

    saved = json.loads(custom_path.read_text(encoding="utf-8"))
    assert saved["bots"][0]["designer"] == "player-uuid-1"
