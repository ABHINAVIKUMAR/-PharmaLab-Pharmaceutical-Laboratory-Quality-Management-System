"""PharmaLab QMS - FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import text

from .config import ROOT_DIR, settings
from .database import Base, SessionLocal, engine
from . import models  # noqa: F401  (register tables on Base.metadata)
from .routers import analytics, audit, auth, batches, capas, deviations, files, products, samples, tests

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    if settings.AUTO_SEED:  # first start on an empty database -> demo accounts + sample data
        from .seed import seed_if_empty
        seed_if_empty()
    yield


app = FastAPI(title=settings.APP_NAME, version=settings.VERSION, lifespan=lifespan,
              description="Pharmaceutical Laboratory Quality Management System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, products, batches, samples, tests, deviations, capas, files, analytics, audit):
    app.include_router(module.router)


@app.get("/api/health", tags=["system"])
def health():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}


# ---- Optionally serve the built React app (single-service deployment, e.g. Azure App Service) ----
_DIST = ROOT_DIR / "frontend" / "dist"
if _DIST.is_dir():
    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "Not found")
        candidate = (_DIST / full_path).resolve()
        if full_path and _DIST.resolve() in candidate.parents and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")
