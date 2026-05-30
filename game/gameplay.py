
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
        self.pieces=[Piece(p) for p in range(game.config.player_count) for _ in range(game.config.board.pawns_per_player)]

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

    # ---------- ABSOLUTE POSITION ----------
    def _abs(self,p:Piece)->int:
        slot=self.game.slots[p.player]
        return (p.pos+self.game.board.starts[slot])%self.track

    # ---------- MOVE ----------
    def move(self,p:Piece)->list:
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

        # capture (main track only, compare absolute positions)
        # Two distinct protections:
        #   safe haven  — no capture regardless of how many opponents are there;
        #                 2+ opponents on a safe haven is NOT a blockade and you CAN
        #                 still land there, you just cannot capture anyone.
        #   blockade    — 2+ opponents on a normal cell; valid_moves already prevents
        #                 landing there, but we refuse to capture defensively too.
        captured=[]
        if p.pos<self.track:
            p_abs=self._abs(p)
            if p_abs not in self.game.board.safe_havens:
                targets=[o for o in self.pieces
                         if o.player!=p.player and o.pos>=0 and o.pos<self.track
                         and self._abs(o)==p_abs]
                if len(targets)==1:   # single pawn on normal cell — capturable
                    captured=targets
                    captured[0].pos=-1

        self.game.end_move()
        return captured

    # ---------- BLOCKADES ----------
    def _blocked(self,pos,player):
        return sum(1 for x in self.pieces if x.pos==pos and x.player==player)>=2

    def _path_blocked(self,start,end,player):
        slot=self.game.slots[player]
        for step in range(start+1,end+1):
            if step>=self.track: break  # home stretch — never blocked by main-track pawns
            step_abs=(step+self.game.board.starts[slot])%self.track
            if step_abs in self.game.board.safe_havens:
                continue  # safe havens neutralise blockades
            opp=[x for x in self.pieces if x.player!=player and x.pos>=0 and x.pos<self.track and self._abs(x)==step_abs]
            if len(opp)>=2:
                return True
        return False

    # ---------- BLOCKER ----------
    def find_blocker(self,player:int)->int|None:
        """Return the opponent whose blockade prevents any move for `player`, if any."""
        r=self.game.last_roll
        slot=self.game.slots[player]
        for pc in self.pieces:
            if pc.player!=player or pc.finished: continue
            if pc.pos==-1:
                if r!=6: continue
                steps=range(0,1)           # only the entry cell
            else:
                target=pc.pos+r
                if target>self.track+self.home_len-1: continue
                steps=range(pc.pos+1,target+1)
            for step in steps:
                if step>=self.track: break  # home stretch — never blocked
                step_abs=(step+self.game.board.starts[slot])%self.track
                if step_abs in self.game.board.safe_havens:
                    continue  # safe havens neutralise blockades
                for opp in range(self.game.config.player_count):
                    if opp==player: continue
                    cnt=sum(1 for p in self.pieces if p.player==opp and p.pos>=0 and p.pos<self.track and self._abs(p)==step_abs)
                    if cnt>=2:
                        return opp
        return None

    def _find_path_blocker(self,start:int,end:int,player:int)->int|None:
        """Return the opponent index with a blockade anywhere on start+1..end, or None."""
        slot=self.game.slots[player]
        for step in range(start+1,end+1):
            if step>=self.track: break  # home stretch — never blocked by main-track pawns
            step_abs=(step+self.game.board.starts[slot])%self.track
            if step_abs in self.game.board.safe_havens:
                continue
            for opp in range(self.game.config.player_count):
                if opp==player: continue
                cnt=sum(1 for p in self.pieces if p.player==opp and p.pos>=0 and p.pos<self.track and self._abs(p)==step_abs)
                if cnt>=2:
                    return opp
        return None

    def per_piece_block_reasons(self,player:int)->list:
        """For each non-finished piece that cannot move, return its blocking reason."""
        r=self.game.last_roll
        valid_ids=set(id(p) for p in self.valid_moves(player))
        pawns=self.game.config.board.pawns_per_player
        player_pieces=[p for p in self.pieces if p.player==player]
        result=[]
        for lidx,pc in enumerate(player_pieces):
            if pc.finished or id(pc) in valid_ids:
                continue
            gidx=player*pawns+lidx
            if pc.pos==-1:
                reason,blocked_by='yard',None
            else:
                target=pc.pos+r
                if target>self.track+self.home_len-1:
                    reason,blocked_by='overshoot',None
                else:
                    reason='blockade'
                    blocked_by=self._find_path_blocker(pc.pos,target,player)
            result.append({"piece_idx":gidx,"piece":lidx,"reason":reason,"blocked_by":blocked_by})
        return result

    # ---------- WIN ----------
    def has_winner(self):
        for pl in range(self.game.config.player_count):
            if all(p.finished for p in self.pieces if p.player==pl):
                return pl
        return None
