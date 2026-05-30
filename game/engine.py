
from dataclasses import dataclass
from enum import Enum
import random
from typing import List, Optional

class Phase(Enum): ROLLING="rolling"; MOVING="moving"; NEXT="next"; FINISHED="finished"

@dataclass(frozen=True)
class BoardConfig:
    track_size:int
    yard_count:int
    home_length:int=6
    safe_offset:int=7
    pawns_per_player:int=4

@dataclass
class GameConfig:
    board:BoardConfig
    player_count:int
    explicit_slots:Optional[List[int]]=None

@dataclass(frozen=True)
class BoardLayout:
    track_size:int
    yard_count:int
    starts:List[int]
    finishes:List[int]
    safe_havens:set

    @staticmethod
    def generate(board:BoardConfig):
        s=board.track_size//board.yard_count
        starts=[i*s for i in range(board.yard_count)]
        finishes=[(x-1)%board.track_size for x in starts]
        safe={(i*s+board.safe_offset)%board.track_size for i in range(board.yard_count)}|set(starts)
        return BoardLayout(board.track_size,board.yard_count,starts,finishes,safe)

def assign_slots(cfg):
    if cfg.explicit_slots: return cfg.explicit_slots
    return list(range(cfg.player_count))

class LudoGame:
    def __init__(self,cfg):
        self.config=cfg
        self.board=BoardLayout.generate(cfg.board)
        self.slots=assign_slots(cfg)
        self.phase=Phase.ROLLING
        self.player=0
        self.last_roll=None

    def roll(self):
        assert self.phase==Phase.ROLLING
        self.last_roll=random.randint(1,6)
        self.phase=Phase.MOVING
        return self.last_roll

    def end_move(self):
        assert self.phase==Phase.MOVING
        self.phase=Phase.ROLLING if self.last_roll==6 else Phase.NEXT

    def next(self):
        assert self.phase==Phase.NEXT
        self.player=(self.player+1)%self.config.player_count
        self.phase=Phase.ROLLING
