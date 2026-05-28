from game.engine import fair_slots

def test_slots():
    assert fair_slots(4,2)==[0,2]
