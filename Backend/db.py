"""MongoDB connection, shared by anything that needs persistent storage (accounts, etc.)."""

import os

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

_client = None


def get_client():
    global _client
    if _client is None:
        uri = os.environ.get("MONGO_URI")
        if not uri:
            raise RuntimeError(
                "MONGO_URI is not set. Copy .env.example to .env and fill in your "
                "MongoDB connection string."
            )
        _client = MongoClient(uri)
    return _client


def get_db():
    db_name = os.environ.get("MONGO_DB", "chess_app")
    return get_client()[db_name]


def get_users_collection():
    collection_name = os.environ.get("MONGO_USERS_COLLECTION", "users")
    return get_db()[collection_name]
