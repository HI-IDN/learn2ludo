
from dataclasses import dataclass
from typing import List
from game.engine import LudoGame, Phase

@dataclass
class Piece:
    player:int
    pos:int=-1     # -1 yard, >=0 track/home
    finished:bool=False

class Gameplay:
    def __init__(self,game:LudoGame):
        self.game=game
        self.track=game.board.track_size
        self.home_len=game.config.board.home_length
        self.pieces=[Piece(p) for p in range(game.config.player_count) for _ in range(4)]

    # ---------- VALID MOVES ----------
    def valid_moves(self,player):
        r=self.game.last_roll
        moves=[]

        for p in self.pieces:
            if p.player!=player or p.finished: continue

            # yard entry
            if p.pos==-1:
                if r==6:
                    if not self._blocked(0,player):
                        moves.append(p)
                continue

            target=p.pos+r

            # exact finish required
            max_pos=self.track+self.home_len-1
            if target>max_pos:
                continue

            # blockade check
            if self._path_blocked(p.pos,target,player):
                continue

            moves.append(p)
        return moves

    # ---------- MOVE ----------
    def move(self,p:Piece):
        assert self.game.phase==Phase.MOVING
        r=self.game.last_roll

        # enter
        if p.pos==-1:
            p.pos=0
        else:
            p.pos+=r

        # finish exact
        if p.pos==self.track+self.home_len-1:
            p.finished=True

        # capture (main track only)
        if p.pos<self.track and p.pos not in self.game.board.safe_havens:
            for o in self.pieces:
                if o.player!=p.player and o.pos==p.pos:
                    o.pos=-1

        self.game.end_move()

    # ---------- BLOCKADES ----------
    def _blocked(self,pos,player):
        return sum(1 for x in self.pieces if x.pos==pos and x.player==player)>=2

    def _path_blocked(self,start,end,player):
        for step in range(start+1,end+1):
            for p in self.pieces:
                if p.player!=player and p.pos==step:
                    if sum(1 for x in self.pieces if x.pos==step)>=2:
                        return True
        return False

    # ---------- WIN ----------
    def has_winner(self):
        for pl in range(self.game.config.player_count):
            if all(p.finished for p in self.pieces if p.player==pl):
                return pl
        return None
