"""Display-only chess-piece avatars, stored separately from the chess engine.

Installation in Backend/app.py:
    from Backend.Logic.player_icons import register_player_icons
    # Place this AFTER players = {WHITE: None, BLACK: None}:
    register_player_icons(app, get_players=lambda: players)

No board, turn, clock, or move code is modified by this module.
"""

from contextlib import contextmanager
from pathlib import Path
import hmac
import secrets
import sqlite3
from typing import Callable, Mapping, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from flask import Flask

ICON_CHOICES = ("king", "queen", "rook", "bishop", "knight", "pawn")
DEFAULT_ICON = "king"
COLORS = ("white", "black")


class PlayerIconStore:
    """A small persistent store keyed by the authenticated username."""

    def __init__(self, database_path):
        self.path = Path(database_path)

    @contextmanager
    def _connection(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(str(self.path), timeout=5)
        try:
            with connection:
                connection.execute(
                    "CREATE TABLE IF NOT EXISTS player_icons ("
                    "username TEXT PRIMARY KEY NOT NULL, "
                    "piece TEXT NOT NULL CHECK (piece IN "
                    "('king', 'queen', 'rook', 'bishop', 'knight', 'pawn')))"
                )
                yield connection
        finally:
            connection.close()

    def get_many(self, usernames):
        """Return stored icons, with a king for accounts without a preference."""
        names = tuple(dict.fromkeys(
            name for name in usernames if isinstance(name, str) and name
        ))
        result = {name: DEFAULT_ICON for name in names}
        if not names:
            return result
        with self._connection() as connection:
            for name in names:
                row = connection.execute(
                    "SELECT piece FROM player_icons WHERE username = ?", (name,)
                ).fetchone()
                if row and row[0] in ICON_CHOICES:
                    result[name] = row[0]
        return result

    def save(self, username, piece):
        if not isinstance(username, str) or not username:
            raise ValueError("A logged-in username is required.")
        if not isinstance(piece, str) or piece not in ICON_CHOICES:
            raise ValueError("Choose king, queen, rook, bishop, knight, or pawn.")
        with self._connection() as connection:
            connection.execute(
                "INSERT INTO player_icons (username, piece) VALUES (?, ?) "
                "ON CONFLICT(username) DO UPDATE SET piece = excluded.piece",
                (username, piece),
            )


def register_player_icons(
    app: "Flask",
    get_players: Callable[[], Mapping[str, Optional[str]]],
    get_player_types: Optional[Callable[[], Mapping[str, str]]] = None,
):
    """Add GET/POST /api/player-icons to the existing Flask application.

    get_players reads the CURRENT seats, even after /api/new-game replaces
    the players dictionary. Never pass a frozen copy of the seats.

    Optional future AI integration:
        get_player_types=lambda: {"white": "human", "black": "computer"}
    Only return 'computer' for a seat the game actually controls with an AI.
    A username such as 'Bot' is NOT treated as a computer automatically.

    PLAYER_ICONS_DATABASE can override the default instance/player_icons.sqlite3
    path. The server needs writable, persistent storage to retain preferences.
    """
    from flask import Blueprint, jsonify, request, session

    store = PlayerIconStore(app.config.get(
        "PLAYER_ICONS_DATABASE", Path(app.instance_path) / "player_icons.sqlite3"
    ))
    blueprint = Blueprint("player_icons", __name__)

    def snapshot():
        username = session.get("username")
        if not isinstance(username, str) or not username:
            username = None
        seats = dict(get_players())
        types = dict(get_player_types()) if get_player_types else {}
        names = [username] + [seats.get(color) for color in COLORS]
        choices = store.get_many(names)
        player_data = {}
        my_color = None
        for color in COLORS:
            name = seats.get(color)
            if types.get(color) == "computer":
                player_data[color] = {
                    "username": None, "kind": "computer", "icon": None,
                }
            elif isinstance(name, str) and name:
                player_data[color] = {
                    "username": name, "kind": "human", "icon": choices[name],
                }
                if name == username:
                    my_color = color
            else:
                player_data[color] = {
                    "username": None, "kind": "empty", "icon": None,
                }

        csrf_token = None
        if username:
            # The token is scoped to this authenticated session, not to a seat.
            if (session.get("player_icon_token_user") != username
                    or not session.get("player_icon_csrf")):
                session["player_icon_token_user"] = username
                session["player_icon_csrf"] = secrets.token_urlsafe(32)
            csrf_token = session["player_icon_csrf"]

        return {
            "username": username,
            "color": my_color,
            "current_icon": choices.get(username, DEFAULT_ICON),
            "choices": list(ICON_CHOICES),
            "csrf_token": csrf_token,
            "players": player_data,
        }

    @blueprint.after_request
    def no_cache(response):
        # This payload contains per-session information and must not be shared.
        response.headers["Cache-Control"] = "no-store"
        return response

    @blueprint.route("/api/player-icons", methods=["GET"])
    def read_icons():
        try:
            return jsonify(snapshot())
        except (sqlite3.Error, OSError):
            app.logger.exception("Unable to read player icon preferences")
            return jsonify(error="Player icons are temporarily unavailable."), 503

    @blueprint.route("/api/player-icons", methods=["POST"])
    def update_icon():
        username = session.get("username")
        if not isinstance(username, str) or not username:
            return jsonify(error="Log in before choosing your icon."), 401

        token = request.headers.get("X-Player-Icon-CSRF", "")
        expected = session.get("player_icon_csrf", "")
        if (session.get("player_icon_token_user") != username
                or not expected or not token
                or not hmac.compare_digest(token.encode("utf-8"), expected.encode("utf-8"))):
            return jsonify(error="Refresh the page, then choose your icon again."), 403

        data = request.get_json(silent=True)
        if not isinstance(data, dict) or set(data) != {"icon"}:
            return jsonify(error="Send only an 'icon' field for your own account."), 400
        piece = data["icon"]
        if not isinstance(piece, str) or piece not in ICON_CHOICES:
            return jsonify(error="Choose king, queen, rook, bishop, knight, or pawn."), 400

        try:
            # The browser cannot select a target username or edit an opponent.
            store.save(username, piece)
            return jsonify(snapshot())
        except (sqlite3.Error, OSError):
            app.logger.exception("Unable to save a player icon preference")
            return jsonify(error="Your icon could not be saved. Please try again."), 503

    app.register_blueprint(blueprint)
