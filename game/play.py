import sys
import random
from game.engine import *
from game.gameplay import *

class Player:
    def __init__(self, name, is_human):
        self.name = name
        self.is_human = is_human

def choose_ai_move(gp, moves, player_id):
    for m in moves:
        for other in gp.pieces:
            if other.player != player_id and other.pos == m.pos:
                return m
    return random.choice(moves)

def setup_players(n):
    players = []
    for i in range(n):
        print(f"Configure Player {i}")
        name = input("Enter name (empty = AI): ").strip()
        if name == "":
            name = f"AI-{i+1}"
            players.append(Player(name, False))
        else:
            players.append(Player(name, True))
    return players

def main():
    if len(sys.argv) < 2:
        print("Usage: playludo 2p/3p/4p")
        return

    num_players = int(sys.argv[1].replace("p",""))

    config = GameConfig(BoardConfig(40,4), num_players)
    game = LudoGame(config)
    gp = Gameplay(game)
    players = setup_players(num_players)

    print("=== LUDO START ===")

    while True:
        player_id = game.player
        player = players[player_id]

        winner = gp.has_winner()
        if winner is not None:
            print(f"{players[winner].name} wins!")
            return

        print(f"{player.name}'s turn")

        cmd = input("Press Enter to roll (or q): ").strip().lower()
        if cmd == 'q':
            print("Goodbye!")
            return

        roll = game.roll()
        print(f"Rolled: {roll}")

        moves = gp.valid_moves(player_id)

        if not moves:
            print("No valid moves")
            game.end_move()
        elif player.is_human:
            for i,m in enumerate(moves):
                print(f"{i}: pos={m.pos}")
            while True:
                choice = input("Select move (or q): ")
                if choice.lower() == 'q':
                    return
                try:
                    choice = int(choice)
                    if 0 <= choice < len(moves):
                        break
                except:
                    pass
            gp.move(moves[choice])
        else:
            move = choose_ai_move(gp, moves, player_id)
            print(f"AI chooses pos={move.pos}")
            gp.move(move)

        if game.phase == Phase.NEXT:
            game.next()

if __name__ == '__main__':
    main()
