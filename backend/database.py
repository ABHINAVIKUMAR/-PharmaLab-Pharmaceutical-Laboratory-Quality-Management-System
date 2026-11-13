"""SQLAlchemy engine/session. Works with PostgreSQL, Azure SQL (mssql+pyodbc) and SQLite."""
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
_kwargs = {"connect_args": {"check_same_thread": False}} if _is_sqlite else {"pool_pre_ping": True}

engine = create_engine(settings.DATABASE_URL, **_kwargs)

if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _enable_sqlite_fk(dbapi_connection, _record):  # pragma: no cover - trivial
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
