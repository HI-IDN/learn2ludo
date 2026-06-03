from game.bots import REGISTRY, get_bot_info


def test_bot_catalog_includes_available_and_planned_bots():
    bots = get_bot_info()
    by_id = {bot["id"]: bot for bot in bots}

    assert by_id["eris"]["selectable"] is True
    assert by_id["eris"]["implemented"] is True
    assert by_id["eris"]["type"] == "baseline"
    assert by_id["eris"]["epithet"] == "Goddess of Discord"

    assert by_id["ares"]["selectable"] is True
    assert by_id["ares"]["implemented"] is True
    assert by_id["ares"]["epithet"] == "God of War"

    assert by_id["athena"]["selectable"] is True
    assert by_id["athena"]["implemented"] is True
    assert by_id["athena"]["id"] in REGISTRY

    assert by_id["apollo"]["type"] == "weighted"
    assert by_id["apollo"]["status"] == "Available"
    assert by_id["apollo"]["selectable"] is True
    assert by_id["apollo"]["implemented"] is True
    assert by_id["apollo"]["id"] in REGISTRY

    assert by_id["user-weighted"]["type"] == "weighted"
    assert by_id["user-weighted"]["status"] == "Custom"
    assert by_id["user-weighted"]["selectable"] is True
    assert by_id["user-weighted"]["implemented"] is True
    assert by_id["user-weighted"]["id"] in REGISTRY

    assert by_id["hephaestus"]["selectable"] is True
    assert by_id["hephaestus"]["implemented"] is True
    assert by_id["hephaestus"]["id"] in REGISTRY

    assert by_id["artemis"]["selectable"] is True
    assert by_id["artemis"]["implemented"] is True
    assert by_id["artemis"]["id"] in REGISTRY
