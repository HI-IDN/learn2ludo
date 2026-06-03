from game.bots import REGISTRY, ApolloBot, MoveFeatures, UserWeightedBot, apollo_score, move_features


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


def test_apollo_prefers_weighted_capture_over_plain_progress():
    game_state = state([
        {"index": 0, "pieces": [piece(0, "R1", 2, 2), piece(1, "R2", 30, 30)]},
        {"index": 1, "pieces": [piece(0, "G1", 44, 5)]},
    ])
    move = REGISTRY["apollo"].choose_move([
        {"piece_idx": 0, "pawn_id": "R1", "target": 5},
        {"piece_idx": 1, "pawn_id": "R2", "target": 36},
    ], game_state)

    assert move["pawn_id"] == "R1"


def test_apollo_uses_safety_and_activation_when_capture_is_unavailable():
    game_state = state([
        {"index": 0, "pieces": [piece(0, "R1", -1, None, in_yard=True), piece(1, "R2", 18, 18)]},
        {"index": 1, "pieces": [piece(0, "G1", 7, 20)]},
    ], safe_havens=[0])
    move = REGISTRY["apollo"].choose_move([
        {"piece_idx": 0, "pawn_id": "R1", "target": 0},
        {"piece_idx": 1, "pawn_id": "R2", "target": 19},
    ], game_state)

    assert move["pawn_id"] == "R1"


def test_apollo_accepts_custom_weight_combinations():
    game_state = state([
        {"index": 0, "pieces": [piece(0, "R1", -1, None, in_yard=True), piece(1, "R2", 30, 30)]},
    ])
    bot = ApolloBot({"progress": 1.0, "activation": -1.0})
    move = bot.choose_move([
        {"piece_idx": 0, "pawn_id": "R1", "target": 0},
        {"piece_idx": 1, "pawn_id": "R2", "target": 36},
    ], game_state)

    assert move["pawn_id"] == "R2"


def test_apollo_single_weight_dispatches_like_matching_sdr():
    cases = [
        (
            "ares",
            "capture",
            state([
                {"index": 0, "pieces": [piece(0, "R1", 2, 2), piece(1, "R2", 30, 30)]},
                {"index": 1, "pieces": [piece(0, "G1", 44, 5)]},
            ]),
            [
                {"piece_idx": 0, "pawn_id": "R1", "target": 5},
                {"piece_idx": 1, "pawn_id": "R2", "target": 36},
            ],
        ),
        (
            "athena",
            "safety",
            state([
                {"index": 0, "pieces": [piece(0, "R1", 4, 4), piece(1, "R2", -1, None, in_yard=True)]},
                {"index": 1, "pieces": [piece(0, "G1", 40, 1)]},
            ], safe_havens=[8]),
            [
                {"piece_idx": 0, "pawn_id": "R1", "target": 8},
                {"piece_idx": 1, "pawn_id": "R2", "target": 0},
            ],
        ),
        (
            "hestia",
            "progress",
            state([
                {"index": 0, "pieces": [piece(0, "R1", 30, 30), piece(1, "R2", 5, 5)]},
            ]),
            [
                {"piece_idx": 0, "pawn_id": "R1", "target": 34},
                {"piece_idx": 1, "pawn_id": "R2", "target": 11},
            ],
        ),
        (
            "hermes",
            "spread",
            state([
                {"index": 0, "pieces": [piece(0, "R1", 10, 10), piece(1, "R2", 11, 11)]},
            ]),
            [
                {"piece_idx": 1, "pawn_id": "R2", "target": 12},
                {"piece_idx": 1, "pawn_id": "R2", "target": 30},
            ],
        ),
        (
            "hephaestus",
            "blockade",
            state([
                {"index": 0, "pieces": [piece(0, "R1", 8, 8), piece(1, "R2", 4, 4)]},
            ]),
            [
                {"piece_idx": 1, "pawn_id": "R2", "target": 8},
                {"piece_idx": 1, "pawn_id": "R2", "target": 10},
            ],
        ),
        (
            "artemis",
            "activation",
            state([
                {"index": 0, "pieces": [piece(0, "R1", -1, None, in_yard=True), piece(1, "R2", 8, 8)]},
            ]),
            [
                {"piece_idx": 0, "pawn_id": "R1", "target": 0},
                {"piece_idx": 1, "pawn_id": "R2", "target": 12},
            ],
        ),
    ]

    for sdr_id, weight_id, game_state, valid_moves in cases:
        apollo = ApolloBot({weight_id: 100.0})

        assert apollo.choose_move(valid_moves, game_state) == REGISTRY[sdr_id].choose_move(valid_moves, game_state)


def test_apollo_missing_weights_default_to_zero():
    features = MoveFeatures(capture=1.0, progress=0.5, activation=1.0)

    assert apollo_score(features, {"progress": 2.0}) == 1.0


def test_user_weighted_bot_uses_custom_slider_weights():
    game_state = state([
        {"index": 0, "pieces": [piece(0, "R1", 10, 10), piece(1, "R2", 11, 11)]},
    ])
    bot = UserWeightedBot({"spread": 100.0})
    move = bot.choose_move([
        {"piece_idx": 1, "pawn_id": "R2", "target": 12},
        {"piece_idx": 1, "pawn_id": "R2", "target": 30},
    ], game_state)

    assert move["target"] == 30
