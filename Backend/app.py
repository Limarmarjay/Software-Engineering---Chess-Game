"""Flask app: serves the frontend, the chess rules API, and account/login endpoints."""

import os

from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, request, send_from_directory, session

from Backend.Logic.auth import InvalidCredentialsError, UsernameTakenError, log_in, sign_up
from Backend.Logic.chess_rules import ChessBoard, IllegalMoveError
from Backend.Logic.piece_movement import PROMOTION_CHOICES, WHITE, BLACK

load_dotenv()

app = Flask(__name__, static_folder="../Design", static_url_path="")
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Frontend")

# Single in-memory game. Good enough for one board at a time; swap for a
# per-session/per-game-id store if multiple concurrent games are ever needed.
game = ChessBoard()

# Which logged-in username (if any) is playing each color this round.
players = {WHITE: None, BLACK: None}


@app.route("/")
def index():
    if not session.get("username"):
        return redirect("/login")
    return app.send_static_file("index.html")


@app.route("/login")
def login_page():
    if session.get("username"):
        return redirect("/")
    return send_from_directory(FRONTEND_DIR, "login.html")


@app.route("/auth.js")
def auth_js():
    return send_from_directory(FRONTEND_DIR, "auth.js")


# --- Accounts ------------------------------------------------------------

@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    try:
        sign_up(data.get("username"), data.get("password"))
    except (ValueError, UsernameTakenError) as exc:
        return jsonify({"error": str(exc)}), 400

    session["username"] = data.get("username").strip()
    return jsonify({"username": session["username"]})


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    try:
        username = log_in(data.get("username"), data.get("password"))
    except InvalidCredentialsError as exc:
        return jsonify({"error": str(exc)}), 401

    session["username"] = username
    return jsonify({"username": username})


@app.route("/api/logout", methods=["POST"])
def logout():
    username = session.pop("username", None)
    for color, holder in players.items():
        if holder == username:
            players[color] = None
    return jsonify({"ok": True})


@app.route("/api/session", methods=["GET"])
def get_session():
    username = session.get("username")
    color = None
    if username is not None:
        color = next((c for c, holder in players.items() if holder == username), None)
    return jsonify({"username": username, "color": color, "players": players})


# --- Player seating (max two players per round: one white, one black) ----

@app.route("/api/join", methods=["POST"])
def join():
    username = session.get("username")
    if not username:
        return jsonify({"error": "You must be logged in to join a game."}), 401

    data = request.get_json(silent=True) or {}
    color = data.get("color")
    if color not in (WHITE, BLACK):
        return jsonify({"error": f"'color' must be '{WHITE}' or '{BLACK}'."}), 400

    if players[color] is not None and players[color] != username:
        return jsonify({"error": f"{color} is already taken."}), 409

    # A player can only occupy one seat at a time.
    for other_color, holder in players.items():
        if holder == username and other_color != color:
            players[other_color] = None

    players[color] = username

    if players[WHITE] and players[BLACK]:
        game.start()

    return jsonify({"players": players, "started": game.started})


# --- Chess game ------------------------------------------------------------

@app.route("/api/board", methods=["GET"])
def get_board():
    return jsonify(game.to_dict())


@app.route("/api/new-game", methods=["POST"])
def new_game():
    global game, players
    data = request.get_json(silent=True) or {}
    time_seconds = data.get("time_seconds")
    game = ChessBoard(time_seconds) if time_seconds else ChessBoard()
    players = {WHITE: None, BLACK: None}
    return jsonify(game.to_dict())


@app.route("/api/legal-moves", methods=["GET"])
def legal_moves():
    try:
        row = int(request.args["row"])
        col = int(request.args["col"])
    except (KeyError, ValueError):
        return jsonify({"error": "Query params 'row' and 'col' are required integers."}), 400

    moves = game.legal_moves((row, col))
    return jsonify({"moves": [list(m) for m in moves]})


def _parse_square(value, field_name):
    if (
        not isinstance(value, (list, tuple))
        or len(value) != 2
        or not all(isinstance(v, int) for v in value)
    ):
        raise IllegalMoveError(f"'{field_name}' must be a [row, col] pair of integers.")
    return tuple(value)


@app.route("/api/move", methods=["POST"])
def make_move():
    data = request.get_json(silent=True) or {}

    try:
        from_pos = _parse_square(data.get("from"), "from")
        to_pos = _parse_square(data.get("to"), "to")
        promotion = data.get("promotion")
        if promotion is not None and promotion not in PROMOTION_CHOICES:
            return jsonify({"error": f"'promotion' must be one of {PROMOTION_CHOICES}."}), 400

        result = game.move(from_pos, to_pos, promotion)
    except IllegalMoveError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({**result, "state": game.to_dict()})


if __name__ == "__main__":
    app.run(debug=True, port=5001)
