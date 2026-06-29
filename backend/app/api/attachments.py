"""Attachments API — upload documents/photos to a malfunction or a project item.

Upload flow (presigned): client calls POST /presign → PUTs the file to the
returned URL (S3 in prod, an API route in dev) → POST "" to record it.
"""
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, require_company_admin, user_can_access_project
from ..integrations import storage
from ..models import Attachment, Malfunction, Project, ProjectItem, User
from ..schemas.attachment import (
    AttachmentCreate,
    AttachmentOut,
    PresignRequest,
    PresignResponse,
)


router = APIRouter(prefix="/api/attachments", tags=["attachments"])


def _safe_name(name: str) -> str:
    name = (name or "file").replace("\\", "/").split("/")[-1]
    return re.sub(r"[^\w.\- ]+", "_", name)[:120] or "file"


def _resolve_target(
    db: Session, actor: User, malfunction_id: int | None, project_item_id: int | None
) -> tuple[int, str, int]:
    """Validate the target + access. Returns (company_id, kind, target_id)."""
    if (malfunction_id is None) == (project_item_id is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set exactly one of malfunction_id / project_item_id",
        )
    if malfunction_id is not None:
        d = db.query(Malfunction).filter(Malfunction.id == malfunction_id).first()
        if not d:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Malfunction not found")
        project = db.query(Project).filter(Project.id == d.project_id).first()
        if not project or not user_can_access_project(actor, project, db):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return d.company_id, "malfunction", malfunction_id
    item = db.query(ProjectItem).filter(ProjectItem.id == project_item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    project = db.query(Project).filter(Project.id == item.project_id).first()
    if not project or not user_can_access_project(actor, project, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return item.company_id, "item", project_item_id


@router.post("/presign", response_model=PresignResponse)
def presign(
    body: PresignRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    company_id, kind, target_id = _resolve_target(
        db, actor, body.malfunction_id, body.project_item_id
    )
    content_type = body.content_type or "application/octet-stream"
    key = f"c{company_id}/{kind}/{target_id}/{uuid.uuid4().hex}_{_safe_name(body.filename)}"
    return PresignResponse(
        storage_key=key,
        upload_url=storage.presign_put(key, content_type),
        content_type=content_type,
    )


def _out(a: Attachment, with_url: bool = True) -> AttachmentOut:
    return AttachmentOut(
        id=a.id,
        malfunction_id=a.malfunction_id,
        project_item_id=a.project_item_id,
        original_filename=a.original_filename,
        content_type=a.content_type,
        size_bytes=a.size_bytes,
        uploaded_at=a.uploaded_at,
        download_url=storage.presign_get(a.storage_key, a.original_filename) if with_url else None,
    )


@router.post("", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
def create_attachment(
    body: AttachmentCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    company_id, _, _ = _resolve_target(db, actor, body.malfunction_id, body.project_item_id)
    a = Attachment(
        company_id=company_id,
        malfunction_id=body.malfunction_id,
        project_item_id=body.project_item_id,
        storage_key=body.storage_key,
        original_filename=body.original_filename,
        content_type=body.content_type,
        size_bytes=body.size_bytes,
        uploaded_by=actor.id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return _out(a)


@router.get("", response_model=list[AttachmentOut])
def list_attachments(
    malfunction_id: int | None = Query(default=None),
    project_item_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    _resolve_target(db, actor, malfunction_id, project_item_id)
    q = db.query(Attachment)
    if malfunction_id is not None:
        q = q.filter(Attachment.malfunction_id == malfunction_id)
    else:
        q = q.filter(Attachment.project_item_id == project_item_id)
    return [_out(a) for a in q.order_by(Attachment.uploaded_at.desc()).all()]


@router.delete("/{att_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    att_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    a = db.query(Attachment).filter(Attachment.id == att_id).first()
    if not a:
        return
    if actor.role != "super_admin" and a.company_id != actor.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    try:
        storage.delete(a.storage_key)
    except storage.StorageError:
        pass  # don't block the row delete on a storage hiccup
    db.delete(a)
    db.commit()


# ---- Local backend only: serve the bytes the presigned URLs point to ----

@router.put("/local/{key:path}")
async def local_upload(key: str, request: Request):
    if storage.is_s3():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    storage.local_write(key, await request.body())
    return {"ok": True}


@router.get("/local/{key:path}")
def local_download(key: str):
    if storage.is_s3():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    try:
        data = storage.local_read(key)
    except storage.StorageError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return Response(content=data, media_type="application/octet-stream")
