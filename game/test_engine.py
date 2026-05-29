from game.engine import assign_slots, GameConfig, BoardConfig

def test_explicit_slots():
    cfg = GameConfig(board=BoardConfig(track_size=52, yard_count=4), player_count=3, explicit_slots=[0,1,3])
    assert assign_slots(cfg) == [0, 1, 3]

def test_default_slots():
    cfg = GameConfig(board=BoardConfig(track_size=52, yard_count=4), player_count=2)
    assert assign_slots(cfg) == [0, 1]
