from game.engine import *
from game.gameplay import *

def test_basic():
    g=LudoGame(GameConfig(BoardConfig(40,4),2))
    assert g.phase is not None
