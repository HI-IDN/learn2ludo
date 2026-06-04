from game.engine import BoardConfig, GameConfig, Phase
from game.session import GameSession
from datetime import datetime


def make_session(num_players=4, home_length=6, equal_rounds=False, starting_player=0):
    cfg = GameConfig(
        board=BoardConfig(
            track_size=num_players * (2 * home_length + 1),
            yard_count=num_players,
            home_length=home_length,
        ),
        player_count=num_players,
    )
    return GameSession(cfg, equal_rounds=equal_rounds, starting_player=starting_player)


def piece_for(session, player, local_idx=0):
    return [p for p in session.gp.pieces if p.player == player][local_idx]


class TestHomeStretchEntry:
    def setup_method(self):
        self.s = make_session(num_players=4, home_length=6)
        self.track_size = self.s.game.board.track_size
        self.home_len = self.s.game.config.board.home_length
        self.home_entry = self.track_size - 1

    def _set_pos(self, player, local_idx, pos):
        piece_for(self.s, player, local_idx).pos = pos

    def _relative_for_abs(self, player, abs_pos):
        slot = self.s.game.slots[player]
        start = self.s.game.board.starts[slot]
        return (abs_pos - start + self.track_size) % self.track_size

    def test_red_T6_plus_4_enters_home_at_H3(self):
        red_t6 = self._relative_for_abs(player=0, abs_pos=5)
        assert red_t6 == self.home_entry - 2

        self._set_pos(player=0, local_idx=1, pos=red_t6)
        self.s.game.player = 0
        self.s.game.last_roll = 4
        self.s.game.phase = Phase.MOVING

        moves = self.s._valid_moves_list()
        r2 = next(m for m in moves if m["pawn_id"] == "R2")
        assert r2["target"] == self.home_entry + 2

    def test_finish_arrow_is_last_track_cell_for_each_slot(self):
        for player in range(self.s.game.config.player_count):
            slot = self.s.game.slots[player]
            finish_abs = self.s.game.board.finishes[slot]
            finish_rel = self._relative_for_abs(player, finish_abs)
            assert finish_rel == self.home_entry - 1

    def test_from_finish_arrow_enter_home(self):
        self._set_pos(player=1, local_idx=0, pos=self.home_entry - 1)
        self.s.game.player = 1
        self.s.game.last_roll = 1
        self.s.game.phase = Phase.MOVING

        moves = self.s.gp.valid_moves(1)
        targets = [p.pos + 1 for p in moves]
        assert self.home_entry in targets

    def test_before_finish_arrow_rolling_1_stays_on_track(self):
        self._set_pos(player=1, local_idx=0, pos=self.home_entry - 2)
        self.s.game.player = 1
        self.s.game.last_roll = 1
        self.s.game.phase = Phase.MOVING

        moves = self.s.gp.valid_moves(1)
        targets = [p.pos + 1 for p in moves]
        assert self.home_entry - 1 in targets
        assert self.home_entry not in targets

    def test_exact_finish_uses_shifted_home_entry(self):
        final_home = self.home_entry + self.home_len - 1
        self._set_pos(player=0, local_idx=0, pos=final_home - 1)
        self.s.game.player = 0
        self.s.game.last_roll = 1
        self.s.game.phase = Phase.MOVING

        self.s.apply_move(piece_idx=0, target=final_home)

        pawn = piece_for(self.s, 0, 0)
        assert pawn.pos == final_home
        assert pawn.finished


class TestEqualRounds:
    def _finish_all(self, session, player):
        ts = session.game.board.track_size
        hl = session.game.config.board.home_length
        done = ts + hl - 2
        for p in session.gp.pieces:
            if p.player == player:
                p.pos = done
                p.finished = True

    def test_winner_does_not_get_extra_turn(self):
        s = make_session(num_players=4, equal_rounds=True, starting_player=0)
        self._finish_all(s, 2)
        s._finishing_round_player = 2

        s.game.player = 2
        s.game.phase = Phase.NEXT
        for expected_player in [3, 0, 1]:
            s.game.phase = Phase.NEXT
            s._next_turn()
            assert s.game.player == expected_player
            assert s.game.phase != Phase.FINISHED

        s.game.phase = Phase.NEXT
        s._next_turn()
        assert s.game.player == 2
        assert s.game.phase == Phase.FINISHED

    def test_starting_player_after_winner_gets_final_turn(self):
        s = make_session(num_players=4, equal_rounds=True, starting_player=3)
        self._finish_all(s, 2)
        s._finishing_round_player = 2

        s.game.player = 2
        s.game.phase = Phase.NEXT
        s._next_turn()
        assert s.game.player == 3
        assert s.game.phase != Phase.FINISHED

    def test_starting_player_wins_all_others_get_extra_turn(self):
        s = make_session(num_players=4, equal_rounds=True, starting_player=0)
        self._finish_all(s, 0)
        s._finishing_round_player = 0

        s.game.player = 0
        s.game.phase = Phase.NEXT

        for expected_player in [1, 2, 3]:
            s.game.phase = Phase.NEXT
            s._next_turn()
            assert s.game.player == expected_player
            assert s.game.phase != Phase.FINISHED

        s.game.phase = Phase.NEXT
        s._next_turn()
        assert s.game.phase == Phase.FINISHED


class TestGameHistoryMetadata:
    def test_history_starts_with_starting_player(self):
        s = make_session(num_players=4, home_length=6, starting_player=1)
        state = s.to_dict()

        assert state["starting_player"] == 1
        assert state["starting_player_color"] == "green"
        ev = state["history"][0]
        assert ev["type"] == "game_start"
        assert ev["player"] == 1
        assert ev["color"] == "green"
        assert len(ev["seeds"]) == 4
        assert all(isinstance(seed, int) for seed in ev["seeds"])

    def test_winner_is_recorded_in_history_and_state(self):
        s = make_session(num_players=2, home_length=6)
        final_home = s.game.board.track_size + s.game.config.board.home_length - 2
        for piece in s.gp.pieces:
            if piece.player == 0:
                piece.pos = final_home
                piece.finished = True
        last_piece = piece_for(s, 0, 0)
        last_piece.pos = final_home - 1
        last_piece.finished = False
        s.game.player = 0
        s.game.last_roll = 1
        s.game.phase = Phase.MOVING

        s.apply_move(piece_idx=0, target=final_home)
        state = s.to_dict()
        winner_event = state["history"][-1]

        assert state["winner"] == 0
        assert state["winner_color"] == "red"
        assert winner_event["type"] == "game_winner"
        assert winner_event["player"] == 0
        assert winner_event["color"] == "red"
        assert winner_event["winners"] == [0]

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
        target_abs = (1 + s.game.board.starts[0]) % s.game.board.track_size
        green.pos = (target_abs - s.game.board.starts[1] + s.game.board.track_size) % s.game.board.track_size

        red.pos = 0
        s.game.player = 0
        s.game.last_roll = 1
        s.game.phase = Phase.MOVING

        s.apply_move(piece_idx=0, target=1)

        capture = next(e for e in s.history if e.get("type") == "capture")
        assert capture["by_pawn_id"] == "R1"
        assert capture["captured_pawn_id"] == "G1"

    def test_move_history_records_justification_and_timestamp(self):
        s = make_session(num_players=4, home_length=6)
        s.game.player = 0
        s.game.last_roll = 6
        s.game.phase = Phase.MOVING

        s.apply_move(piece_idx=0, target=0, justification="  Move R1 out now.  ")
        latest = s.history[-1]

        assert latest["type"] == "move"
        assert latest["justification"] == "  Move R1 out now.  "
        assert latest["timestamp"].endswith("Z")
        datetime.fromisoformat(latest["timestamp"].replace("Z", "+00:00"))

    def test_move_history_records_null_justification_when_absent(self):
        s = make_session(num_players=4, home_length=6)
        s.game.player = 0
        s.game.last_roll = 6
        s.game.phase = Phase.MOVING

        s.apply_move(piece_idx=0, target=0)
        latest = s.history[-1]

        assert latest["type"] == "move"
        assert latest["justification"] is None
        assert latest["timestamp"].endswith("Z")


class TestPerPlayerSeeding:
    def test_seeds_auto_generated_and_stored(self):
        s = make_session(num_players=3, home_length=6)
        assert len(s.seeds) == 3
        assert all(isinstance(seed, int) for seed in s.seeds)
        assert len(set(s.seeds)) == 3  # very likely distinct

    def test_seeds_in_to_dict_and_game_start_event(self):
        s = make_session(num_players=2, home_length=6)
        state = s.to_dict()
        assert state["seeds"] == s.seeds
        assert s.history[0]["seeds"] == s.seeds

    def test_explicit_seeds_produce_identical_roll_sequences(self):
        seeds = [42, 99]
        cfg = GameConfig(
            board=BoardConfig(track_size=2 * (2 * 6 + 1), yard_count=2, home_length=6),
            player_count=2,
        )
        rolls_a, rolls_b = [], []
        for rolls in (rolls_a, rolls_b):
            s = GameSession(cfg, seeds=seeds)
            for _ in range(10):
                if s.game.phase.value == "rolling":
                    rolls.append(s.roll_dice())
        assert rolls_a == rolls_b

    def test_different_seeds_produce_independent_rng_per_player(self):
        import random
        s = make_session(num_players=2, home_length=6)
        assert s._rngs[0] is not s._rngs[1]
        # RNG state of player 0 is unaffected by rolling player 1's RNG
        state_before = s._rngs[0].getstate()
        s._rngs[1].randint(1, 6)
        assert s._rngs[0].getstate() == state_before
