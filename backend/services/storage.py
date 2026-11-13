"""Document storage abstraction: Azure Blob Storage with a local filesystem fallback."""
import re
import uuid
from functools import lru_cache
from pathlib import Path

from ..config import settings

STORED_NAME_RE = re.compile(r"^[0-9a-f]{32}_[A-Za-z0-9._-]{1,150}$")


def safe_filename(name: str) -> str:
    name = Path(name or "file").name
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._") or "file"
    return name[-150:]


class LocalStorage:
    backend_name = "local"

    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, original_name: str, data: bytes, content_type: str | None = None) -> str:
        stored = f"{uuid.uuid4().hex}_{safe_filename(original_name)}"
        (self.root / stored).write_bytes(data)
        return stored

    def read(self, stored_name: str) -> bytes:
        path = (self.root / stored_name).resolve()
        if self.root.resolve() not in path.parents or not path.is_file():
            raise FileNotFoundError(stored_name)
        return path.read_bytes()


class AzureBlobStorage:
    backend_name = "azure-blob"

    def __init__(self, connection_string: str, container: str):
        from azure.storage.blob import BlobServiceClient  # lazy import: only needed in Azure mode

        self.service = BlobServiceClient.from_connection_string(connection_string)
        self.container = self.service.get_container_client(container)
        try:
            self.container.create_container()
        except Exception:  # already exists / no permission to create
            pass

    def save(self, original_name: str, data: bytes, content_type: str | None = None) -> str:
        from azure.storage.blob import ContentSettings

        stored = f"{uuid.uuid4().hex}_{safe_filename(original_name)}"
        self.container.upload_blob(
            stored, data, overwrite=False,
            content_settings=ContentSettings(content_type=content_type or "application/octet-stream"),
        )
        return stored

    def read(self, stored_name: str) -> bytes:
        from azure.core.exceptions import ResourceNotFoundError

        try:
            return self.container.download_blob(stored_name).readall()
        except ResourceNotFoundError as exc:
            raise FileNotFoundError(stored_name) from exc


@lru_cache(maxsize=1)
def get_storage():
    if settings.AZURE_STORAGE_CONNECTION_STRING:
        return AzureBlobStorage(settings.AZURE_STORAGE_CONNECTION_STRING, settings.AZURE_STORAGE_CONTAINER)
    return LocalStorage(settings.UPLOAD_DIR)
