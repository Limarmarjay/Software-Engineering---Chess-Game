"""Geometric move generation for chess pieces.

Every function here answers "where could this piece physically go from this
square, given only what occupies the board" - it does not know about turns,
check, or the game as a whole. That layer lives in chess_rules.py.
"""

WHITE = "white"
BLACK = "black"

PAWN = "pawn"
ROOK = "rook"
KNIGHT = "knight"
BISHOP = "bishop"
QUEEN = "queen"
KING = "king"

PROMOTION_CHOICES = (QUEEN, ROOK, BISHOP, KNIGHT)


# The rank each color's pawns promote on when they reach it.
LAST_RANK = {WHITE: 0, BLACK: 7}


class Piece:
    def __init__(self, color, piece_type, move_count=0):
        self.color = color
        self.type = piece_type
        self.move_count = move_count

    @property
    def is_promotion_eligible(self):
        return self.type == PAWN

    def copy(self):
        return Piece(self.color, self.type, self.move_count)

    def __repr__(self):
        return f"Piece({self.color}, {self.type}, moves={self.move_count})"


def in_bounds(row, col):
    return 0 <= row < 8 and 0 <= col < 8


def _slide_moves(board, row, col, color, directions):
    """Moves along given directions until blocked, capturing the first enemy piece found."""
    moves = []
    for d_row, d_col in directions:
        r, c = row + d_row, col + d_col
        while in_bounds(r, c):
            occupant = board[r][c]
            if occupant is None:
                moves.append((r, c))
            else:
                if occupant.color != color:
                    moves.append((r, c))
                break
            r += d_row
            c += d_col
    return moves


def _pawn_moves(board, row, col, piece):
    moves = []
    # White starts at row 6 moving toward row 0; black starts at row 1 moving toward row 7.
    direction = -1 if piece.color == WHITE else 1

    # Forward movement: never allowed onto an occupied square, and pawns cannot move backward.
    one_forward = (row + direction, col)
    if in_bounds(*one_forward) and board[one_forward[0]][one_forward[1]] is None:
        moves.append(one_forward)

        if piece.move_count == 0:
            two_forward = (row + 2 * direction, col)
            if in_bounds(*two_forward) and board[two_forward[0]][two_forward[1]] is None:
                moves.append(two_forward)

    # Diagonal capture only, one square forward.
    for d_col in (-1, 1):
        target = (row + direction, col + d_col)
        if in_bounds(*target):
            occupant = board[target[0]][target[1]]
            if occupant is not None and occupant.color != piece.color:
                moves.append(target)

    return moves


def _knight_moves(board, row, col, color):
    offsets = [
        (-2, -1), (-2, 1), (-1, -2), (-1, 2),
        (1, -2), (1, 2), (2, -1), (2, 1),
    ]
    moves = []
    for d_row, d_col in offsets:
        r, c = row + d_row, col + d_col
        if in_bounds(r, c):
            occupant = board[r][c]
            if occupant is None or occupant.color != color:
                moves.append((r, c))
    return moves


def _king_moves(board, row, col, color):
    moves = []
    for d_row in (-1, 0, 1):
        for d_col in (-1, 0, 1):
            if d_row == 0 and d_col == 0:
                continue
            r, c = row + d_row, col + d_col
            if in_bounds(r, c):
                occupant = board[r][c]
                if occupant is None or occupant.color != color:
                    moves.append((r, c))
    return moves


ROOK_DIRECTIONS = [(-1, 0), (1, 0), (0, -1), (0, 1)]
BISHOP_DIRECTIONS = [(-1, -1), (-1, 1), (1, -1), (1, 1)]
QUEEN_DIRECTIONS = ROOK_DIRECTIONS + BISHOP_DIRECTIONS


def get_candidate_moves(board, row, col):
    """Returns (row, col) squares a piece at (row, col) could move to, ignoring check."""
    piece = board[row][col]
    if piece is None:
        return []

    if piece.type == PAWN:
        return _pawn_moves(board, row, col, piece)
    if piece.type == KNIGHT:
        return _knight_moves(board, row, col, piece.color)
    if piece.type == KING:
        return _king_moves(board, row, col, piece.color)
    if piece.type == ROOK:
        return _slide_moves(board, row, col, piece.color, ROOK_DIRECTIONS)
    if piece.type == BISHOP:
        return _slide_moves(board, row, col, piece.color, BISHOP_DIRECTIONS)
    if piece.type == QUEEN:
        return _slide_moves(board, row, col, piece.color, QUEEN_DIRECTIONS)

    raise ValueError(f"Unknown piece type: {piece.type}")
