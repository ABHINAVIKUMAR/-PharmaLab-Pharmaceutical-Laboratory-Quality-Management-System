"""Central configuration, driven by environment variables (.env supported)."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return f"sqlite:///{(ROOT_DIR / 'pharmalab.db').as_posix()}"
    # Make relative SQLite paths independent of the current working directory.
    if url.startswith("sqlite:///") and not url.startswith("sqlite:////") and ":memory:" not in url:
        rel = url[len("sqlite:///"):]
        if not (len(rel) > 1 and rel[1] == ":"):  # not a Windows drive path
            url = f"sqlite:///{(ROOT_DIR / rel).as_posix()}"
    return url


class Settings:
    APP_NAME = "PharmaLab QMS"
    VERSION = "1.0.0"
    DATABASE_URL = _database_url()
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-insecure-secret-change-me-please-0123456789")
    JWT_ALGORITHM = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "").strip()
    AZURE_STORAGE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER", "lab-documents")
    UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
    if not UPLOAD_DIR.is_absolute():
        UPLOAD_DIR = ROOT_DIR / UPLOAD_DIR
    MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "10"))
    ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".csv", ".xlsx", ".txt", ".docx"}
    AUTO_SEED = os.getenv("AUTO_SEED", "true").strip().lower() in ("1", "true", "yes")
    LOG_DIR = Path(os.getenv("LOG_DIR", str(ROOT_DIR / "logs")))
    CORS_ORIGINS = [o.strip() for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]


settings = Settings()
