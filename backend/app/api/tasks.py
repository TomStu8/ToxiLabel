import json as json_mod
import logging
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.core.dependencies import get_current_user, require_role
from app.core.transcription import TranscriptionBusyError, ocr_image, transcribe_video
from app.database import get_db
from app.models import Annotation, Project, ProjectType, Task, TaskAssignment, TaskStatus, User, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tasks", tags=["tasks"])

admin_only = require_role(UserRole.admin)


# ---------- Schemas ----------

class TaskResponse(BaseModel):
    id: int
    project_id: int
    file_path: str | None
    file_name: str | None
    original_filename: str
    content: str | None
    transcript: str | None
    status: TaskStatus
    created_at: datetime
    annotated_by_me: bool = False

    model_config = {"from_attributes": True}


class AssignRequest(BaseModel):
    annotator_id: int


class AssignmentResponse(BaseModel):
    id: int
    task_id: int
    annotator_id: int
    assigned_at: datetime

    model_config = {"from_attributes": True}


class TranscriptResponse(BaseModel):
    task_id: int
    transcript: str | None
    has_transcript: bool


class TranscribeResponse(BaseModel):
    transcript: str


# ---------- Endpoints ----------

@router.post("/upload", response_model=list[TaskResponse], status_code=status.HTTP_201_CREATED)
async def upload_files(
    project_id: int = Form(...),
    files: list[UploadFile] = File(...),
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    upload_dir = Path(settings.uploads_dir) / str(project_id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    created_tasks: list[Task] = []

    for file in files:
        contents = await file.read()
        filename = file.filename or "upload"

        # JSON files: parse and create one Task per item
        if Path(filename).suffix.lower() == ".json":
            try:
                items = json_mod.loads(contents.decode("utf-8"))
            except (json_mod.JSONDecodeError, UnicodeDecodeError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid JSON in {filename}: {exc}",
                )
            if not isinstance(items, list):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"{filename} must contain a JSON array",
                )
            for i, item in enumerate(items):
                text = item.get("text") if isinstance(item, dict) else str(item)
                if text is None:
                    continue
                task = Task(
                    project_id=project_id,
                    original_filename=f"{filename}[{i}]",
                    content=text,
                )
                db.add(task)
                created_tasks.append(task)
        else:
            # Binary file (image / video / plain text)
            suffix = Path(filename).suffix
            unique_name = f"{uuid.uuid4().hex}{suffix}"
            dest = upload_dir / unique_name
            dest.write_bytes(contents)

            task = Task(
                project_id=project_id,
                file_path=str(dest),
                file_name=unique_name,
                original_filename=filename,
            )
            db.add(task)
            created_tasks.append(task)

    db.commit()
    for t in created_tasks:
        db.refresh(t)

    return created_tasks


@router.get("", response_model=list[TaskResponse])
def list_tasks(
    project_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Task)

    if project_id is not None:
        query = query.filter(Task.project_id == project_id)

    if current_user.role != UserRole.admin:
        assigned_task_ids = (
            db.query(TaskAssignment.task_id)
            .filter(TaskAssignment.annotator_id == current_user.id)
            .subquery()
        )
        query = query.filter(Task.id.in_(assigned_task_ids))

    tasks = query.order_by(Task.id).all()

    # Determine which tasks the current user has personally annotated
    annotated_ids = {
        row[0]
        for row in db.query(Annotation.task_id)
        .filter(Annotation.annotator_id == current_user.id)
        .all()
    }

    result = []
    for task in tasks:
        response = TaskResponse.model_validate(task)
        response.annotated_by_me = task.id in annotated_ids
        result.append(response)
    return result


@router.post("/{task_id}/transcribe", response_model=TranscribeResponse)
def transcribe_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    # Access control: admin always allowed; annotators need an assignment
    if current_user.role != UserRole.admin:
        assignment = (
            db.query(TaskAssignment)
            .filter(TaskAssignment.task_id == task_id, TaskAssignment.annotator_id == current_user.id)
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if task.content is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text tasks don't need transcription",
        )

    if not task.file_path:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task has no file")

    file_path = Path(task.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    # Determine transcription type from the project
    project = db.get(Project, task.project_id)
    try:
        if project and project.type == ProjectType.image:
            transcript = ocr_image(str(file_path))
        elif project and project.type == ProjectType.video:
            transcript = transcribe_video(str(file_path))
        else:
            transcript = ocr_image(str(file_path))
    except TranscriptionBusyError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )
    except Exception as exc:
        logger.error("Unexpected transcription error for task %s: %s", task_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prepis zlyhal: {exc}",
        )

    task.transcript = transcript or None
    db.commit()

    return {"transcript": transcript or ""}


@router.get("/{task_id}/transcript", response_model=TranscriptResponse)
def get_transcript(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if current_user.role != UserRole.admin:
        assignment = (
            db.query(TaskAssignment)
            .filter(TaskAssignment.task_id == task_id, TaskAssignment.annotator_id == current_user.id)
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return {
        "task_id": task_id,
        "transcript": task.transcript,
        "has_transcript": bool(task.transcript),
    }


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if current_user.role != UserRole.admin:
        assignment = (
            db.query(TaskAssignment)
            .filter(TaskAssignment.task_id == task_id, TaskAssignment.annotator_id == current_user.id)
            .first()
        )
        if not assignment:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    annotated = (
        db.query(Annotation)
        .filter(Annotation.task_id == task_id, Annotation.annotator_id == current_user.id)
        .first()
    ) is not None
    response = TaskResponse.model_validate(task)
    response.annotated_by_me = annotated
    return response


@router.post("/{task_id}/assign", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
def assign_task(
    task_id: int,
    payload: AssignRequest,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    annotator = db.get(User, payload.annotator_id)
    if not annotator or not annotator.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Annotator not found or inactive")

    existing = (
        db.query(TaskAssignment)
        .filter(TaskAssignment.task_id == task_id, TaskAssignment.annotator_id == payload.annotator_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Task already assigned to this annotator")

    assignment = TaskAssignment(task_id=task_id, annotator_id=payload.annotator_id)
    db.add(assignment)

    if task.status == TaskStatus.pending:
        task.status = TaskStatus.in_progress

    db.commit()
    db.refresh(assignment)
    return assignment
