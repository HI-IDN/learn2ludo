"""
Unit tests for game logic: home-stretch entry, equal-rounds rule, and track navigation.
"""

import pytest
from game.engine import BoardConfig, GameConfig, BoardLayout, Phase
from game.session import GameSession
from game.gameplay import Gameplay, Piece


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_session(num_players=4, home_length=6, equal_rounds=False, starting_player=0):
    cfg = GameConfig(
        board=BoardConfig(track_size=num_players * (2 * home_length + 1),
                         yard_count=num_players,
                         home_length=home_length),
        player_count=num_players,
    )
    return GameSession(cfg, equal_rounds=equal_rounds, starting_player=starting_player)


def piece_for(session, player, local_idx=0):
    return [p for p in session.gp.pieces if p.player == player][local_idx]


# ---------------------------------------------------------------------------
# Home-stretch entry: T9 → H2 for green (player 1) with dice 5
# ---------------------------------------------------------------------------

class TestHomeStretchEntry:
    def setup_method(self):
        self.s = make_session(num_players=4, home_length=6)
        # track_size = 4 * 13 = 52; green start = abs 13; home = relative 52..57
        self.track_size = self.s.game.board.track_size   # 52
        self.home_len   = self.s.game.config.board.home_length  # 6

    def _set_pos(self, player, local_idx, pos):
        piece_for(self.s, player, local_idx).pos = pos

    def test_green_T9_plus_5_is_H2(self):
        """Green pawn at T9 (abs 9, relative 48) rolling 5 should land on H2 (relative 53)."""
        green_start = self.s.game.board.starts[1]       # abs 13
        # relative pos for abs 9: (9 - 13 + 52) % 52 = 48
        relative_pos = (9 - green_start + self.track_size) % self.track_size
        assert relative_pos == 48

        self._set_pos(player=1, local_idx=0, pos=relative_pos)
        self.s.game.player = 1
        self.s.game.last_roll = 5
        from game.engine import Phase
        self.s.game.phase = Phase.MOVING

        moves = self.s.gp.valid_moves(1)
        targets = [0 if p.pos == -1 else p.pos + 5 for p in moves]
        assert 53 in targets, f"Expected H2 (relative 53) in valid moves, got {targets}"

        # H2 means home cell 2 → relative position ts + 1 = 53
        assert 53 == self.track_size + 1  # H2

    def test_green_home_entry_label(self):
        """Verify relative→display label: abs 9 for green is T9 (0-indexed), H2 at relative 53."""
        green_start = self.s.game.board.starts[1]  # 13
        # T9 (0-indexed) = abs 9 → relative = (9 - 13 + 52) % 52 = 48
        abs_pos = 9
        relative = (abs_pos - green_start + self.track_size) % self.track_size
        assert relative == 48
        # T9 → roll 5 → 53 → H2
        target = relative + 5
        assert target == self.track_size + 1  # relative 53 = H2

    def test_last_track_cell_green(self):
        """Green's last valid track cell is relative 51 (abs 12 = T12)."""
        green_start = self.s.game.board.starts[1]  # 13
        last_abs = (green_start - 1 + self.track_size) % self.track_size  # 12
        last_rel = (last_abs - green_start + self.track_size) % self.track_size  # 51
        assert last_abs == 12
        assert last_rel == 51

    def test_finish_arrow_position_green(self):
        """Green's finish arrow is at abs 11 (= start - 2 = T11, 0-indexed)."""
        green_start = self.s.game.board.starts[1]  # 13
        arrow_abs = (green_start - 2 + self.track_size) % self.track_size
        assert arrow_abs == 11  # T11

    def test_from_last_track_cell_enter_home(self):
        """From relative 51 (T12 for green), rolling 1 → H1 (relative 52)."""
        self._set_pos(player=1, local_idx=0, pos=51)
        self.s.game.player = 1
        self.s.game.last_roll = 1
        from game.engine import Phase
        self.s.game.phase = Phase.MOVING

        moves = self.s.gp.valid_moves(1)
        targets = [p.pos + 1 for p in moves]
        assert 52 in targets  # H1

    def test_from_second_to_last_rolling_1_stays_on_track(self):
        """From relative 50 (T11 for green), rolling 1 → relative 51 (T12, still on track)."""
        self._set_pos(player=1, local_idx=0, pos=50)
        self.s.game.player = 1
        self.s.game.last_roll = 1
        from game.engine import Phase
        self.s.game.phase = Phase.MOVING

        moves = self.s.gp.valid_moves(1)
        targets = [p.pos + 1 for p in moves]
        assert 51 in targets   # still on track
        assert 52 not in targets  # not jumping to H1


# ---------------------------------------------------------------------------
# Equal-rounds: game ends when it returns to starting_player, not to winner
# ---------------------------------------------------------------------------

class TestEqualRounds:
    def _finish_all(self, session, player):
        """Force all pieces of a player to the finished state."""
        ts   = session.game.board.track_size
        hl   = session.game.config.board.home_length
        done = ts + hl - 1  # relative pos of final home cell
        for p in session.gp.pieces:
            if p.player == player:
                p.pos = done
                p.finished = True

    def test_winner_does_not_get_extra_turn(self):
        """
        4-player, equal_rounds, starting_player=0 (red).
        Yellow (player 2) wins. Only green (3) should get one extra turn
        — game stops when play would return to starting_player (red=0).
        """
        s = make_session(num_players=4, equal_rounds=True, starting_player=0)
        # Manually finish yellow (player 2)
        self._finish_all(s, 2)
        s._finishing_round_player = 2  # simulates what apply_move sets

        from game.engine import Phase

        # Simulate turns after yellow wins: green (3) → then red (0) → should stop
        s.game.player = 2
        s.game.phase = Phase.NEXT
        s._next_turn()  # advance to green (3)
        assert s.game.player == 3
        assert s.game.phase != Phase.FINISHED   # game still going

        s.game.phase = Phase.NEXT
        s._next_turn()  # advance to red (0) = starting_player → should end
        assert s.game.phase == Phase.FINISHED

    def test_starting_player_wins_all_others_get_extra_turn(self):
        """
        4-player, equal_rounds, starting_player=0 (red).
        Red (player 0) wins. Blue(1), yellow(2), green(3) all get one extra turn.
        Game ends when it wraps back to starting_player (red=0).
        """
        s = make_session(num_players=4, equal_rounds=True, starting_player=0)
        self._finish_all(s, 0)
        s._finishing_round_player = 0

        from game.engine import Phase
        s.game.player = 0
        s.game.phase = Phase.NEXT

        # advance through blue(1), yellow(2), green(3) — each should still be running
        for expected_player in [1, 2, 3]:
            s.game.phase = Phase.NEXT   # _next_turn asserts phase==NEXT, then sets ROLLING
            s._next_turn()
            assert s.game.player == expected_player
            assert s.game.phase != Phase.FINISHED

        # Now advance to red(0) = starting_player → game over
        s.game.phase = Phase.NEXT
        s._next_turn()
        assert s.game.phase == Phase.FINISHED


class TestPawnIdentifiers:
    def test_players_expose_color_prefixed_pawn_ids(self):
        s = make_session(num_players=4, home_length=6)
        state = s.to_dict()

        red_pawns = [pc["pawn_id"] for pc in state["players"][0]["pieces"]]
        green_pawns = [pc["pawn_id"] for pc in state["players"][1]["pieces"]]
        assert red_pawns == ["R1", "R2", "R3", "R4"]
        assert green_pawns == ["G1", "G2", "G3", "G4"]

        all_ids = [pc["pawn_id"] for p in state["players"] for pc in p["pieces"]]
        assert len(all_ids) == len(set(all_ids))

    def test_valid_moves_include_pawn_id_and_can_move_by_pawn_id(self):
        s = make_session(num_players=4, home_length=6)
        s.game.player = 0
        s.game.last_roll = 6
        s.game.phase = Phase.MOVING

        move = s._valid_moves_list()[0]
        assert move["pawn_id"].startswith("R")

        s.apply_move(piece_idx=None, target=move["target"], pawn_id_value=move["pawn_id"])
        latest = s.history[-1]
        assert latest["type"] == "move"
        assert latest["pawn_id"] == move["pawn_id"]

    def test_capture_history_records_pawn_ids(self):
        s = make_session(num_players=2, home_length=6)
        red = piece_for(s, 0, 0)
        green = piece_for(s, 1, 0)

        red.pos = 0
        green.pos = 1
        s.game.player = 0
        s.game.last_roll = 1
        s.game.phase = Phase.MOVING

        s.apply_move(piece_idx=0, target=1)

        capture = next(e for e in s.history if e.get("type") == "capture")
        assert capture["by_pawn_id"] == "R1"
        assert capture["captured_pawn_id"] == "G1"
