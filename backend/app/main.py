from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.annotations import router as annotations_router
from app.api.auth import router as auth_router
from app.api.iaa import router as iaa_router
from app.api.health import router as health_router
from app.api.projects import router as projects_router
from app.api.supervisor import router as supervisor_router
from app.api.tasks import router as tasks_router
from app.api.users import router as users_router
from app.config import settings

app = FastAPI(
    title="ToxiLabel API",
    description="Multimodal annotation tool for toxic content labeling",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")
app.include_router(annotations_router, prefix="/api")
app.include_router(iaa_router, prefix="/api")
app.include_router(supervisor_router, prefix="/api")

app.mount("/uploads", StaticFiles(directory=settings.uploads_dir, html=False), name="uploads")


@app.get("/")
def root():
    return {"message": "ToxiLabel API", "docs": "/docs"}
