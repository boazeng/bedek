"""File storage integration — swappable Local (dev) vs S3 (prod).

Pure integration layer: no DB, no models. The API layer calls these to mint
presigned upload/download URLs and to delete objects.

- S3: `generate_presigned_url` is a local signing operation (no network), so the
  browser uploads/downloads directly to S3. `delete` is a real call (egresses
  via the VPC NAT).
- Local: returns API-served URLs (`/api/attachments/local/...`) so the same
  frontend flow works without S3.
"""
from __future__ import annotations

import os
from pathlib import Path

from ..config import settings


class StorageError(RuntimeError):
    pass


def _safe_local_path(key: str) -> Path:
    base = Path(settings.uploads_local_dir).resolve()
    target = (base / key).resolve()
    if not str(target).startswith(str(base)):
        raise StorageError("Invalid storage key")
    return target


def is_s3() -> bool:
    return settings.storage_backend.lower() == "s3"


def _s3_client():
    import boto3  # lazy — present on Lambda; not needed for local dev

    return boto3.client("s3")


def presign_put(key: str, content_type: str) -> str:
    """URL the browser PUTs the file to."""
    if is_s3():
        return _s3_client().generate_presigned_url(
            "put_object",
            Params={"Bucket": settings.uploads_bucket, "Key": key, "ContentType": content_type},
            ExpiresIn=settings.upload_url_ttl,
        )
    return f"/api/attachments/local/{key}"


def presign_get(key: str, filename: str | None = None) -> str:
    """URL the browser GETs the file from."""
    if is_s3():
        params = {"Bucket": settings.uploads_bucket, "Key": key}
        if filename:
            params["ResponseContentDisposition"] = f'inline; filename="{filename}"'
        return _s3_client().generate_presigned_url(
            "get_object", Params=params, ExpiresIn=settings.upload_url_ttl
        )
    return f"/api/attachments/local/{key}"


def delete(key: str) -> None:
    if is_s3():
        try:
            _s3_client().delete_object(Bucket=settings.uploads_bucket, Key=key)
        except Exception as e:  # best-effort; never block the row delete
            raise StorageError(str(e))
        return
    path = _safe_local_path(key)
    if path.exists():
        path.unlink()


# ---- Local backend file IO (used only by the local upload/download routes) ----

def local_write(key: str, data: bytes) -> None:
    path = _safe_local_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def local_read(key: str) -> bytes:
    path = _safe_local_path(key)
    if not path.exists():
        raise StorageError("Not found")
    return path.read_bytes()
