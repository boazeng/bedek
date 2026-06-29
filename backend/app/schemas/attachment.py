"""Schemas for file attachments (presign + record + list)."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PresignRequest(BaseModel):
    """Ask for an upload URL. Exactly one target id must be set."""

    malfunction_id: int | None = None
    project_item_id: int | None = None
    filename: str
    content_type: str | None = None


class PresignResponse(BaseModel):
    storage_key: str
    upload_url: str
    method: str = "PUT"
    content_type: str | None = None


class AttachmentCreate(BaseModel):
    """Record an uploaded object after the PUT to storage succeeded."""

    malfunction_id: int | None = None
    project_item_id: int | None = None
    storage_key: str
    original_filename: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    malfunction_id: int | None
    project_item_id: int | None
    original_filename: str | None
    content_type: str | None
    size_bytes: int | None
    uploaded_at: datetime
    download_url: str | None = None
