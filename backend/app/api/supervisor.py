from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.database import get_db
from app.models import Annotation, Project, Task, TaskAssignment, User, UserRole

router = APIRouter(prefix="/supervisor", tags=["supervisor"])

admin_only = require_role(UserRole.admin)


@router.get("/overview")
def supervisor_overview(
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    # --- Fetch all raw data in bulk ---
    all_tasks       = db.query(Task).all()
    all_assignments = db.query(TaskAssignment).all()
    all_annotations = db.query(Annotation).all()
    annotators      = (
        db.query(User)
        .filter(User.role == UserRole.annotator)
        .order_by(User.full_name)
        .all()
    )
    all_projects = db.query(Project).order_by(Project.id).all()

    # --- Lookup structures ---
    task_to_project: dict[int, int] = {t.id: t.project_id for t in all_tasks}
    project_map: dict[int, Project]  = {p.id: p for p in all_projects}
    annotator_map: dict[int, User]   = {u.id: u for u in annotators}

    tasks_by_project: dict[int, list[int]] = defaultdict(list)
    for t in all_tasks:
        tasks_by_project[t.project_id].append(t.id)

    # annotator_id -> set of task_ids they are assigned
    assigned_by_ann: dict[int, set[int]] = defaultdict(set)
    for a in all_assignments:
        assigned_by_ann[a.annotator_id].add(a.task_id)

    # annotator_id -> set of task_ids they personally annotated
    annotated_by_ann: dict[int, set[int]] = defaultdict(set)
    for ann in all_annotations:
        annotated_by_ann[ann.annotator_id].add(ann.task_id)

    # task_id -> set of annotator_ids who annotated it
    annotators_of_task: dict[int, set[int]] = defaultdict(set)
    for ann in all_annotations:
        annotators_of_task[ann.task_id].add(ann.annotator_id)

    # project_id -> annotator_id -> assigned count
    proj_ann_assigned: dict[int, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for a in all_assignments:
        pid = task_to_project.get(a.task_id)
        if pid is not None:
            proj_ann_assigned[pid][a.annotator_id] += 1

    # project_id -> annotator_id -> completed count (annotation on their own assigned task)
    proj_ann_completed: dict[int, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for ann in all_annotations:
        pid = task_to_project.get(ann.task_id)
        if pid is not None and ann.task_id in assigned_by_ann[ann.annotator_id]:
            proj_ann_completed[pid][ann.annotator_id] += 1

    # --- Per-annotator stats ---
    annotator_stats = []
    for u in annotators:
        assigned_ids  = assigned_by_ann[u.id]
        completed_ids = annotated_by_ann[u.id] & assigned_ids

        ann_projects = []
        for pid, count_map in proj_ann_assigned.items():
            if u.id not in count_map:
                continue
            p = project_map.get(pid)
            if p:
                ann_projects.append({
                    "id":        p.id,
                    "name":      p.name,
                    "assigned":  count_map[u.id],
                    "completed": proj_ann_completed[pid].get(u.id, 0),
                })
        ann_projects.sort(key=lambda x: x["id"])

        annotator_stats.append({
            "id":              u.id,
            "full_name":       u.full_name,
            "email":           u.email,
            "total_assigned":  len(assigned_ids),
            "total_completed": len(completed_ids),
            "projects":        ann_projects,
        })

    # --- Per-project stats ---
    project_stats = []
    for p in all_projects:
        proj_task_ids  = tasks_by_project[p.id]
        total_annotated = sum(1 for tid in proj_task_ids if tid in annotators_of_task)

        proj_annotators = []
        for ann_id, assigned_count in proj_ann_assigned[p.id].items():
            u = annotator_map.get(ann_id)
            if u:
                proj_annotators.append({
                    "id":        u.id,
                    "full_name": u.full_name,
                    "email":     u.email,
                    "assigned":  assigned_count,
                    "completed": proj_ann_completed[p.id].get(ann_id, 0),
                })
        proj_annotators.sort(key=lambda x: x["id"])

        project_stats.append({
            "id":              p.id,
            "name":            p.name,
            "type":            p.type.value,
            "description":     p.description,
            "total_tasks":     len(proj_task_ids),
            "total_annotated": total_annotated,
            "annotators":      proj_annotators,
        })

    # --- Totals ---
    total_tasks          = len(all_tasks)
    annotated_task_count = sum(1 for tid in task_to_project if tid in annotators_of_task)
    completion_pct       = round(annotated_task_count / total_tasks * 100) if total_tasks else 0

    return {
        "annotators": annotator_stats,
        "projects":   project_stats,
        "totals": {
            "tasks":          total_tasks,
            "annotations":    len(all_annotations),
            "annotators":     sum(1 for u in annotators if u.is_active),
            "completion_pct": completion_pct,
        },
    }
