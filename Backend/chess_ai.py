"""Computer opponent for the chess game."""

import random

from .chess_rules import ChessBoard
from .piece_movement import BLACK, WHITE, QUEEN, PAWN, LAST_RANK


class ChessAI:

    def __init__(self, color=BLACK):
        self.color = color

    def get_all_legal_moves(self, game):
        """Find every legal move available to the computer."""

        if game.turn != self.color:
            return []

        all_moves = []

        for row in range(8):
            for col in range(8):

                piece = game.get_piece((row, col))

                if piece is None:
                    continue

                if piece.color != self.color:
                    continue

                legal_moves = game.legal_moves((row, col))

                for destination in legal_moves:

                    all_moves.append({
                        "from": (row, col),
                        "to": destination
                    })

        return all_moves

    def choose_move(self, game):
        """Choose one random legal move."""

        available_moves = self.get_all_legal_moves(game)

        if not available_moves:
            return None

        return random.choice(available_moves)

    def make_move(self, game):
        """Choose and execute the computer's move."""

        if game.turn != self.color:
            return None

        selected_move = self.choose_move(game)

        if selected_move is None:
            return None

        from_pos = selected_move["from"]
        to_pos = selected_move["to"]

        piece = game.get_piece(from_pos)

        promotion = None

        if piece.type == PAWN:
            if to_pos[0] == LAST_RANK[self.color]:
                promotion = QUEEN

        result = game.move(
            from_pos,
            to_pos,
            promotion=promotion
        )

        return {
            "from": from_pos,
            "to": to_pos,
            "promotion": promotion,
            "result": result
        }
