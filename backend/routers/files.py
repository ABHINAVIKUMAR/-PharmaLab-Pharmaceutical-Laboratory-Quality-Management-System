"""/api/files - upload/download supporting lab documents (Azure Blob Storage or local fallback)."""
import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ..audit import log_action, snapshot
from ..config import settings
from ..database import get_db
from ..models import TestResult, User
from ..security import get_current_user, require_roles
from ..services.storage import STORED_NAME_RE, get_storage

router = APIRouter(prefix="/api/files", tags=["files"])


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_file(file: UploadFile = File(...), result_id: int | None = Form(default=None),
                      db: Session = Depends(get_db),
                      user: User = Depends(require_roles("LAB_TECHNICIAN", "QC_OFFICER", "QA_OFFICER"))):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in settings.ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(415, f"File type '{ext or 'unknown'}' not allowed. Allowed: "
                                 f"{', '.join(sorted(settings.ALLOWED_UPLOAD_EXTENSIONS))}")
    data = await file.read()
    if not data:
        raise HTTPException(422, "Empty file")
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {settings.MAX_UPLOAD_MB} MB limit")

    result = None
    if result_id is not None:
        result = db.get(TestResult, result_id)
        if result is None:
            raise HTTPException(404, "Test result not found")
        if user.role == "LAB_TECHNICIAN" and result.tested_by != user.id:
            raise HTTPException(403, "You can only attach documents to your own results")

    storage = get_storage()
    stored = storage.save(file.filename or "file", data, file.content_type)
    url = f"/api/files/{stored}"
    if result is not None:
        old = snapshot(result)
        result.report_blob_url = url
        db.flush()
        log_action(db, user, "REPORT_ATTACHED", "test_result", result.id, old, snapshot(result))
    else:
        log_action(db, user, "FILE_UPLOADED", "file", None, None,
                   {"stored_name": stored, "size": len(data), "storage": storage.backend_name})
    db.commit()
    return {"stored_name": stored, "filename": stored.split("_", 1)[1], "url": url, "size": len(data),
            "storage": storage.backend_name, "result_id": result_id}


@router.get("/{stored_name}")
def download_file(stored_name: str, _: User = Depends(get_current_user)):
    if not STORED_NAME_RE.match(stored_name):
        raise HTTPException(400, "Invalid file name")
    try:
        data = get_storage().read(stored_name)
    except FileNotFoundError:
        raise HTTPException(404, "File not found")
    original = stored_name.split("_", 1)[1]
    media = mimetypes.guess_type(original)[0] or "application/octet-stream"
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{original}"'})
