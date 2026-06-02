from game.bots import REGISTRY, move_features


def state(players, safe_havens=None):
    return {
        "config": {
            "board": {
                "track_size": 52,
                "yard_count": 4,
                "home_length": 6,
                "pawns_per_player": 4,
            }
        },
        "board": {
            "track_size": 52,
            "starts": [0, 13, 26, 39],
            "safe_havens": safe_havens or [],
        },
        "slots": [0, 1, 2, 3],
        "players": players,
    }


def piece(index, pawn_id, position, absolute_position=None, in_yard=False, finished=False):
    return {
        "index": index,
        "pawn_id": pawn_id,
        "position": position,
        "absolute_position": absolute_position,
        "in_yard": in_yard,
        "finished": finished,
    }


def test_shared_features_detect_capture_and_progress():
    game_state = state([
        {"index": 0, "pieces": [piece(0, "R1", 2, 2)]},
        {"index": 1, "pieces": [piece(0, "G1", 44, 5)]},
    ])
    features = move_features({"piece_idx": 0, "pawn_id": "R1", "target": 5}, game_state).as_dict()

    assert features["capture"] == 1.0
    assert features["progress"] > 0
    assert set(features) == {"capture", "risk", "risk_reduction", "progress", "safety", "blockade", "spread", "activation"}


def test_ares_prefers_capture():
    game_state = state([
        {"index": 0, "pieces": [piece(0, "R1", 2, 2), piece(1, "R2", 1, 1)]},
        {"index": 1, "pieces": [piece(0, "G1", 44, 5)]},
    ])
    move = REGISTRY["ares"].choose_move([
        {"piece_idx": 0, "pawn_id": "R1", "target": 5},
        {"piece_idx": 1, "pawn_id": "R2", "target": 3},
    ], game_state)

    assert move["pawn_id"] == "R1"


def test_athena_prefers_reducing_capture_risk():
    game_state = state([
        {"index": 0, "pieces": [piece(0, "R1", 4, 4), piece(1, "R2", -1, None, in_yard=True)]},
        {"index": 1, "pieces": [piece(0, "G1", 40, 1)]},
    ], safe_havens=[8])
    move = REGISTRY["athena"].choose_move([
        {"piece_idx": 0, "pawn_id": "R1", "target": 8},
        {"piece_idx": 1, "pawn_id": "R2", "target": 0},
    ], game_state)

    assert move["pawn_id"] == "R1"


def test_hestia_prefers_most_progressed_pawn():
    game_state = state([
        {"index": 0, "pieces": [piece(0, "R1", 30, 30), piece(1, "R2", 5, 5)]},
    ])
    move = REGISTRY["hestia"].choose_move([
        {"piece_idx": 0, "pawn_id": "R1", "target": 34},
        {"piece_idx": 1, "pawn_id": "R2", "target": 11},
    ], game_state)

    assert move["pawn_id"] == "R1"


def test_hermes_prefers_spreading_pawns():
    game_state = state([
        {"index": 0, "pieces": [piece(0, "R1", 10, 10), piece(1, "R2", 11, 11)]},
    ])
    move = REGISTRY["hermes"].choose_move([
        {"piece_idx": 1, "pawn_id": "R2", "target": 12},
        {"piece_idx": 1, "pawn_id": "R2", "target": 30},
    ], game_state)

    assert move["target"] == 30


def test_hephaestus_prefers_forming_blockades():
    game_state = state([
        {"index": 0, "pieces": [piece(0, "R1", 8, 8), piece(1, "R2", 4, 4)]},
    ])
    move = REGISTRY["hephaestus"].choose_move([
        {"piece_idx": 1, "pawn_id": "R2", "target": 8},
        {"piece_idx": 1, "pawn_id": "R2", "target": 10},
    ], game_state)

    assert move["target"] == 8


def test_artemis_prefers_activating_yard_pawns():
    game_state = state([
        {"index": 0, "pieces": [piece(0, "R1", -1, None, in_yard=True), piece(1, "R2", 8, 8)]},
    ])
    move = REGISTRY["artemis"].choose_move([
        {"piece_idx": 0, "pawn_id": "R1", "target": 0},
        {"piece_idx": 1, "pawn_id": "R2", "target": 12},
    ], game_state)

    assert move["pawn_id"] == "R1"
