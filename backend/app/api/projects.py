import json
import os
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.database import get_db
from app.models import Annotation, Project, ProjectType, Task, TaskAssignment, TaskStatus, User, UserRole

router = APIRouter(prefix="/projects", tags=["projects"])

admin_only = require_role(UserRole.admin)


# ---------- Schemas ----------

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str | None
    type: ProjectType
    created_at: datetime
    created_by: int

    model_config = {"from_attributes": True}


class CreateProjectRequest(BaseModel):
    name: str
    description: str | None = None
    type: ProjectType


class BulkAssignRequest(BaseModel):
    annotator_id: int


class BulkAssignResponse(BaseModel):
    assigned: int
    skipped: int


# ---------- Endpoints ----------

@router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == UserRole.admin:
        return db.query(Project).order_by(Project.id).all()

    # Annotators/supervisors see only projects that have tasks assigned to them
    assigned_project_ids = (
        db.query(Task.project_id)
        .join(TaskAssignment, TaskAssignment.task_id == Task.id)
        .filter(TaskAssignment.annotator_id == current_user.id)
        .distinct()
        .subquery()
    )
    return (
        db.query(Project)
        .filter(Project.id.in_(assigned_project_ids))
        .order_by(Project.id)
        .all()
    )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: CreateProjectRequest,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    project = Project(
        name=payload.name,
        description=payload.description,
        type=payload.type,
        created_by=current_user.id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    if current_user.role != UserRole.admin:
        # Check the user has at least one assigned task in this project
        assigned = (
            db.query(TaskAssignment)
            .join(Task, Task.id == TaskAssignment.task_id)
            .filter(Task.project_id == project_id, TaskAssignment.annotator_id == current_user.id)
            .first()
        )
        if not assigned:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return project


@router.post("/{project_id}/assign", response_model=BulkAssignResponse)
def bulk_assign_project(
    project_id: int,
    payload: BulkAssignRequest,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    annotator = db.get(User, payload.annotator_id)
    if not annotator or not annotator.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotator not found or inactive")

    tasks = db.query(Task).filter(Task.project_id == project_id).all()

    assigned = 0
    skipped = 0

    for task in tasks:
        existing = (
            db.query(TaskAssignment)
            .filter(TaskAssignment.task_id == task.id, TaskAssignment.annotator_id == payload.annotator_id)
            .first()
        )
        if existing:
            skipped += 1
        else:
            db.add(TaskAssignment(task_id=task.id, annotator_id=payload.annotator_id))
            if task.status == TaskStatus.pending:
                task.status = TaskStatus.in_progress
            assigned += 1

    db.commit()
    return {"assigned": assigned, "skipped": skipped}


@router.get("/{project_id}/download")
def download_project_data(
    project_id: int,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    tasks = db.query(Task).filter(Task.project_id == project_id).order_by(Task.id).all()

    zip_path = Path(f"/tmp/project_{project_id}_export.zip")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        if project.type == ProjectType.text:
            data = [
                {"id": t.id, "filename": t.original_filename, "content": t.content}
                for t in tasks
            ]
            zf.writestr("tasks.json", json.dumps(data, ensure_ascii=False, indent=2))
        else:
            upload_dir = Path(f"/app/uploads/{project_id}")
            if upload_dir.exists():
                for file_path in sorted(upload_dir.iterdir()):
                    if file_path.is_file():
                        zf.write(file_path, file_path.name)

    return FileResponse(
        path=str(zip_path),
        media_type="application/zip",
        filename=f"project_{project_id}_data.zip",
        background=None,
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    tasks = db.query(Task).filter(Task.project_id == project_id).all()
    task_ids = [t.id for t in tasks]

    if task_ids:
        db.query(Annotation).filter(Annotation.task_id.in_(task_ids)).delete()
        db.query(TaskAssignment).filter(TaskAssignment.task_id.in_(task_ids)).delete()

    # Delete uploaded files from disk
    for task in tasks:
        if task.file_path:
            try:
                Path(task.file_path).unlink(missing_ok=True)
            except OSError:
                pass

    db.query(Task).filter(Task.project_id == project_id).delete()
    db.delete(project)
    db.commit()
