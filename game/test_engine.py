from game.engine import assign_slots, board_track_size, BoardLayout, GameConfig, BoardConfig

def test_explicit_slots():
    cfg = GameConfig(board=BoardConfig(track_size=52, yard_count=4), player_count=3, explicit_slots=[0,1,3])
    assert assign_slots(cfg) == [0, 1, 3]

def test_default_slots():
    cfg = GameConfig(board=BoardConfig(track_size=52, yard_count=4), player_count=2)
    assert assign_slots(cfg) == [0, 1]

def test_two_yard_board_uses_elongated_track():
    track_size = board_track_size(2, 6)
    layout = BoardLayout.generate(BoardConfig(track_size=track_size, yard_count=2, home_length=6))
    assert track_size == 30
    assert layout.starts == [9, 24]
    assert layout.finishes == [7, 22]
