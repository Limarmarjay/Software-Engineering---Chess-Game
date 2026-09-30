"""Game-level chess rules: turns, check safety, capture, promotion, and clocks.

Builds on the pure geometry in piece_movement.py and adds the rules that
require knowledge of the whole game: a move can't leave your own king in
check, it's always someone's turn, and each player's clock only runs while
it's their turn to play.
"""

import time
from typing import Optional

from .piece_movement import (
    Piece,
    get_candidate_moves,
    in_bounds,
    WHITE,
    BLACK,
    PAWN,
    KING,
    PROMOTION_CHOICES,
    LAST_RANK,
)

BACK_RANK_TYPES = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"]

DEFAULT_TIME_SECONDS = 10 * 60  # 10-minute tournament clock per side


class IllegalMoveError(Exception):
    pass


class ChessBoard:
    def __init__(self, time_seconds=DEFAULT_TIME_SECONDS):
        self.board: list[list[Optional[Piece]]] = [[None] * 8 for _ in range(8)]
        self.turn = WHITE
        self.setup_board()

        # Tournament timer: each side's remaining time only ticks down on their turn,
        # and only once the game has actually started (see start()).
        self.time_remaining: dict[str, float] = {WHITE: float(time_seconds), BLACK: float(time_seconds)}
        self.turn_started_at: float = time.monotonic()
        self.started = False

    def start(self):
        """Begins the clock. Call this once both seats are filled."""
        if not self.started:
            self.started = True
            self.turn_started_at = time.monotonic()

    def setup_board(self):
        for col in range(8):
            self.board[0][col] = Piece(BLACK, BACK_RANK_TYPES[col])
            self.board[1][col] = Piece(BLACK, PAWN)
            self.board[6][col] = Piece(WHITE, PAWN)
            self.board[7][col] = Piece(WHITE, BACK_RANK_TYPES[col])
        self.turn = WHITE

    def get_piece(self, pos):
        row, col = pos
        if not in_bounds(row, col):
            return None
        return self.board[row][col]

    def other_color(self, color):
        return BLACK if color == WHITE else WHITE

    # --- Timer -----------------------------------------------------------

    def get_remaining_time(self, color):
        """Current remaining seconds for `color`, accounting for the live turn."""
        remaining = self.time_remaining[color]
        if self.started and color == self.turn:
            elapsed = time.monotonic() - self.turn_started_at
            remaining -= elapsed
        return max(0.0, remaining)

    def is_time_up(self, color):
        return self.started and self.get_remaining_time(color) <= 0

    def _charge_clock_for_turn(self):
        """Deducts the elapsed time from the player who just moved."""
        if not self.started:
            return
        elapsed = time.monotonic() - self.turn_started_at
        self.time_remaining[self.turn] = max(0.0, self.time_remaining[self.turn] - elapsed)

    # --- Check detection ---------------------------------------------------

    def find_king(self, color, board=None):
        board = board if board is not None else self.board
        for row in range(8):
            for col in range(8):
                piece = board[row][col]
                if piece is not None and piece.type == KING and piece.color == color:
                    return (row, col)
        return None

    def is_square_attacked(self, pos, by_color, board=None):
        board = board if board is not None else self.board
        for row in range(8):
            for col in range(8):
                piece = board[row][col]
                if piece is not None and piece.color == by_color:
                    if pos in get_candidate_moves(board, row, col):
                        return True
        return False

    def is_in_check(self, color, board=None):
        board = board if board is not None else self.board
        king_pos = self.find_king(color, board)
        if king_pos is None:
            return False
        return self.is_square_attacked(king_pos, self.other_color(color), board)

    def _simulate(self, from_pos, to_pos):
        """A copy of the board with the move applied, for check-safety testing."""
        board_copy = [[cell.copy() if cell is not None else None for cell in row] for row in self.board]
        fr, fc = from_pos
        tr, tc = to_pos
        board_copy[tr][tc] = board_copy[fr][fc]
        board_copy[fr][fc] = None
        return board_copy

    def legal_moves(self, pos):
        """Candidate moves for the piece at pos, minus any that leave its own king in check."""
        piece = self.get_piece(pos)
        if piece is None or piece.color != self.turn:
            return []

        legal = []
        for candidate in get_candidate_moves(self.board, pos[0], pos[1]):
            simulated = self._simulate(pos, candidate)
            if not self.is_in_check(piece.color, simulated):
                legal.append(candidate)
        return legal

    # --- Moving --------------------------------------------------------

    def move(self, from_pos, to_pos, promotion=None):
        if self.is_time_up(self.turn):
            raise IllegalMoveError(f"{self.turn}'s clock has run out.")

        piece = self.get_piece(from_pos)
        if piece is None:
            raise IllegalMoveError("No piece at source square.")
        if piece.color != self.turn:
            raise IllegalMoveError(f"It is {self.turn}'s turn.")
        if to_pos not in self.legal_moves(from_pos):
            raise IllegalMoveError("That move is not legal for this piece.")

        fr, fc = from_pos
        tr, tc = to_pos

        # Capture: the captured piece disappears and the mover takes its square.
        captured = self.board[tr][tc]

        promoted = False
        reaches_last_rank = piece.type == PAWN and tr == LAST_RANK[piece.color]
        if piece.type == PAWN and reaches_last_rank:
            if promotion not in PROMOTION_CHOICES:
                raise IllegalMoveError(
                    f"This pawn must promote; choose one of {PROMOTION_CHOICES}."
                )
            piece.type = promotion
            promoted = True

        piece.move_count += 1
        self.board[tr][tc] = piece
        self.board[fr][fc] = None

        self._charge_clock_for_turn()
        self.turn = self.other_color(self.turn)
        self.turn_started_at = time.monotonic()

        return {
            "captured": {"color": captured.color, "type": captured.type} if captured else None,
            "promoted": promoted,
            "check": self.is_in_check(self.turn),
        }

    # --- Serialization ---------------------------------------------------

    def to_dict(self):
        rows = []
        for row in range(8):
            row_data = []
            for col in range(8):
                piece = self.board[row][col]
                if piece is None:
                    row_data.append(None)
                else:
                    row_data.append({
                        "color": piece.color,
                        "type": piece.type,
                        "move_count": piece.move_count,
                    })
            rows.append(row_data)
        return {
            "board": rows,
            "turn": self.turn,
            "started": self.started,
            "time_remaining": {
                WHITE: self.get_remaining_time(WHITE),
                BLACK: self.get_remaining_time(BLACK),
            },
        }
