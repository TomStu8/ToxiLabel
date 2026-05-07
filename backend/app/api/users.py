from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_role
from app.core.security import hash_password
from app.database import get_db
from app.models import Annotation, TaskAssignment, User, UserRole

router = APIRouter(prefix="/users", tags=["users"])

admin_only = require_role(UserRole.admin)


# ---------- Schemas ----------

class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole = UserRole.annotator


class PatchUserRequest(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None


# ---------- Endpoints ----------

@router.get("", response_model=list[UserResponse])
def list_users(
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    return db.query(User).order_by(User.id).all()


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: CreateUserRequest,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserResponse)
def patch_user(
    user_id: int,
    payload: PatchUserRequest,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    current_user: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    # Remove dependent rows first to satisfy foreign key constraints
    db.query(Annotation).filter(Annotation.annotator_id == user_id).delete()
    db.query(TaskAssignment).filter(TaskAssignment.annotator_id == user_id).delete()
    db.delete(user)
    db.commit()
