"""Account creation and login verification, backed by a MongoDB users collection."""

from werkzeug.security import check_password_hash, generate_password_hash

from Backend.db import get_users_collection


class UsernameTakenError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


def sign_up(username, password):
    username = (username or "").strip()
    if not username or not password:
        raise ValueError("Username and password are required.")

    users = get_users_collection()
    if users.find_one({"username": username}):
        raise UsernameTakenError(f"'{username}' is already taken.")

    users.insert_one({
        "username": username,
        "password_hash": generate_password_hash(password),
    })


def log_in(username, password):
    username = (username or "").strip()
    users = get_users_collection()
    user = users.find_one({"username": username})
    if user is None or not check_password_hash(user["password_hash"], password):
        raise InvalidCredentialsError("Incorrect username or password.")
    return username
