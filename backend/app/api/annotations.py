import csv
import io
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models import Annotation, Project, Task, TaskStatus, User, UserRole

router = APIRouter(prefix="/annotations", tags=["annotations"])

admin_only = require_role(UserRole.admin)


# ---------- Schemas ----------

class AnnotationRequest(BaseModel):
    task_id: int
    is_toxic: bool
    categories: list[str] = []
    notes: str | None = None
    transcript_correction: str | None = None


class AnnotationResponse(BaseModel):
    id: int
    task_id: int
    annotator_id: int
    is_toxic: bool
    categories: list[str] | None
    notes: str | None
    transcript_correction: str | None
    submitted_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------- Endpoints ----------

@router.post("", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
def submit_annotation(
    payload: AnnotationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.get(Task, payload.task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    existing = (
        db.query(Annotation)
        .filter(
            Annotation.task_id == payload.task_id,
            Annotation.annotator_id == current_user.id,
        )
        .first()
    )

    now = datetime.utcnow()

    if existing:
        existing.is_toxic = payload.is_toxic
        existing.categories = payload.categories
        existing.notes = payload.notes
        existing.transcript_correction = payload.transcript_correction
        existing.updated_at = now
        annotation = existing
    else:
        annotation = Annotation(
            task_id=payload.task_id,
            annotator_id=current_user.id,
            is_toxic=payload.is_toxic,
            categories=payload.categories,
            notes=payload.notes,
            transcript_correction=payload.transcript_correction,
        )
        db.add(annotation)

    # Always mark task done after any annotation is saved
    task.status = TaskStatus.done

    db.commit()
    db.refresh(annotation)
    return annotation


@router.get("", response_model=list[AnnotationResponse])
def list_annotations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Annotation)
    if current_user.role != UserRole.admin:
        query = query.filter(Annotation.annotator_id == current_user.id)
    return query.order_by(Annotation.id).all()


@router.get("/my/{task_id}", response_model=AnnotationResponse)
def my_annotation(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    annotation = (
        db.query(Annotation)
        .filter(
            Annotation.task_id == task_id,
            Annotation.annotator_id == current_user.id,
        )
        .first()
    )
    if not annotation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No annotation found")
    return annotation


@router.get("/export/{project_id}")
def export_project_annotations(
    project_id: int,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    rows = (
        db.query(Annotation, Task, User)
        .join(Task, Task.id == Annotation.task_id)
        .join(User, User.id == Annotation.annotator_id)
        .filter(Task.project_id == project_id)
        .order_by(Annotation.id)
        .all()
    )

    payload = {
        "project": {"id": project.id, "name": project.name, "type": project.type.value},
        "exported_at": datetime.utcnow().isoformat(),
        "annotations": [
            {
                "task_id": annotation.task_id,
                "filename": task.original_filename,
                "annotator_email": user.email,
                "annotator_name": user.full_name,
                "is_toxic": annotation.is_toxic,
                "categories": annotation.categories or [],
                "notes": annotation.notes,
                "transcript": task.transcript,
                "transcript_correction": annotation.transcript_correction,
                "submitted_at": annotation.submitted_at.isoformat(),
            }
            for annotation, task, user in rows
        ],
    }

    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="export_{project_id}.json"'},
    )


@router.get("/export/{project_id}/csv")
def export_project_annotations_csv(
    project_id: int,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    rows = (
        db.query(Annotation, Task, User)
        .join(Task, Task.id == Annotation.task_id)
        .join(User, User.id == Annotation.annotator_id)
        .filter(Task.project_id == project_id)
        .order_by(Annotation.id)
        .all()
    )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "task_id", "filename", "annotator_email", "annotator_name",
        "is_toxic", "categories", "notes",
        "transcript", "transcript_correction",
        "submitted_at",
    ])
    for annotation, task, user in rows:
        writer.writerow([
            annotation.task_id,
            task.original_filename,
            user.email,
            user.full_name,
            annotation.is_toxic,
            ";".join(annotation.categories or []),
            annotation.notes or "",
            task.transcript or "",
            annotation.transcript_correction or "",
            annotation.submitted_at.isoformat(),
        ])

    return Response(
        content=buf.getvalue().encode("utf-8-sig"),   # utf-8-sig for Excel compatibility
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="export_{project_id}.csv"'},
    )


@router.get("/task/{task_id}", response_model=list[AnnotationResponse])
def task_annotations(
    task_id: int,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return (
        db.query(Annotation)
        .filter(Annotation.task_id == task_id)
        .order_by(Annotation.id)
        .all()
    )
