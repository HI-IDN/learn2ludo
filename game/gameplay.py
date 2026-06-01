from dataclasses import dataclass
from game.engine import LudoGame, Phase


@dataclass
class Piece:
    player:int
    pos:int=-1
    finished:bool=False


class Gameplay:
    def __init__(self,game:LudoGame):
        self.game=game
        self.track=game.board.track_size
        self.home_len=game.config.board.home_length
        self.home_entry=self.track-1
        self.pieces=[Piece(p) for p in range(game.config.player_count) for _ in range(game.config.board.pawns_per_player)]

    def valid_moves(self,player):
        r=self.game.last_roll
        moves=[]

        for p in self.pieces:
            if p.player!=player or p.finished: continue

            if p.pos==-1:
                if r==6:
                    if not self._blocked(0,player):
                        moves.append(p)
                continue

            target=p.pos+r
            max_pos=self.home_entry+self.home_len-1
            if target>max_pos:
                continue

            if self._path_blocked(p.pos,target,player):
                continue

            moves.append(p)
        return moves

    def _abs(self,p:Piece)->int:
        slot=self.game.slots[p.player]
        return (p.pos+self.game.board.starts[slot])%self.track

    def move(self,p:Piece)->list:
        assert self.game.phase==Phase.MOVING
        r=self.game.last_roll

        if p.pos==-1:
            p.pos=0
        else:
            p.pos+=r

        if p.pos==self.home_entry+self.home_len-1:
            p.finished=True

        captured=[]
        if p.pos<self.home_entry:
            p_abs=self._abs(p)
            if p_abs not in self.game.board.safe_havens:
                targets=[o for o in self.pieces
                         if o.player!=p.player and o.pos>=0 and o.pos<self.home_entry
                         and self._abs(o)==p_abs]
                if len(targets)==1:
                    captured=targets
                    captured[0].pos=-1

        self.game.end_move()
        return captured

    def _blocked(self,pos,player):
        return sum(1 for x in self.pieces if x.pos==pos and x.player==player)>=2

    def _path_blocked(self,start,end,player):
        slot=self.game.slots[player]
        for step in range(start+1,end+1):
            if step>=self.home_entry: break
            step_abs=(step+self.game.board.starts[slot])%self.track
            if step_abs in self.game.board.safe_havens:
                continue
            opp=[x for x in self.pieces if x.player!=player and x.pos>=0 and x.pos<self.home_entry and self._abs(x)==step_abs]
            if len(opp)>=2:
                return True
        return False

    def find_blocker(self,player:int)->int|None:
        r=self.game.last_roll
        slot=self.game.slots[player]
        for pc in self.pieces:
            if pc.player!=player or pc.finished: continue
            if pc.pos==-1:
                if r!=6: continue
                steps=range(0,1)
            else:
                target=pc.pos+r
                if target>self.home_entry+self.home_len-1: continue
                steps=range(pc.pos+1,target+1)
            for step in steps:
                if step>=self.home_entry: break
                step_abs=(step+self.game.board.starts[slot])%self.track
                if step_abs in self.game.board.safe_havens:
                    continue
                for opp in range(self.game.config.player_count):
                    if opp==player: continue
                    cnt=sum(1 for p in self.pieces if p.player==opp and p.pos>=0 and p.pos<self.home_entry and self._abs(p)==step_abs)
                    if cnt>=2:
                        return opp
        return None

    def _find_path_blocker(self,start:int,end:int,player:int)->int|None:
        slot=self.game.slots[player]
        for step in range(start+1,end+1):
            if step>=self.home_entry: break
            step_abs=(step+self.game.board.starts[slot])%self.track
            if step_abs in self.game.board.safe_havens:
                continue
            for opp in range(self.game.config.player_count):
                if opp==player: continue
                cnt=sum(1 for p in self.pieces if p.player==opp and p.pos>=0 and p.pos<self.home_entry and self._abs(p)==step_abs)
                if cnt>=2:
                    return opp
        return None

    def per_piece_block_reasons(self,player:int)->list:
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
                if target>self.home_entry+self.home_len-1:
                    reason,blocked_by='overshoot',None
                else:
                    reason='blockade'
                    blocked_by=self._find_path_blocker(pc.pos,target,player)
            result.append({"piece_idx":gidx,"piece":lidx,"reason":reason,"blocked_by":blocked_by})
        return result

    def has_winner(self):
        for pl in range(self.game.config.player_count):
            if all(p.finished for p in self.pieces if p.player==pl):
                return pl
        return None
