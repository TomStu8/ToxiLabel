from collections import defaultdict
from itertools import combinations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_role
from app.database import get_db
from app.models import Annotation, Project, Task, User, UserRole

router = APIRouter(prefix="/iaa", tags=["iaa"])

admin_only = require_role(UserRole.admin)

CATEGORIES = [
    "urážka", "nenávisť", "výhražka", "dezinformácia", "spam",
    "rasa a etnicita", "náboženstvo", "sexuálna orientácia", "migranti",
    "hendikep", "vzhľad", "ideológia", "životný štýl", "kyberšikana", "iné",
]


def cohen_kappa(labels_a: list[int], labels_b: list[int]) -> float | None:
    """
    Compute Cohen's kappa for two lists of binary labels (0/1).
    Returns None if kappa is undefined (pe == 1, i.e. all labels identical).
    """
    n = len(labels_a)
    if n == 0:
        return None

    po = sum(a == b for a, b in zip(labels_a, labels_b)) / n

    # Marginal probabilities for class=1
    p_a1 = sum(labels_a) / n
    p_b1 = sum(labels_b) / n

    pe = p_a1 * p_b1 + (1 - p_a1) * (1 - p_b1)

    if pe == 1.0:
        return None  # degenerate: both annotators chose the same class for every item

    return round((po - pe) / (1 - pe), 4)


def kappa_for_pair(
    shared_tasks: list[int],
    annotations_by_task: dict[int, dict[int, "Annotation"]],
    ann1_id: int,
    ann2_id: int,
) -> tuple[float | None, float | None, int]:
    """
    Returns (kappa_toxic, kappa_categories, n_compared) for an annotator pair
    over their shared tasks.
    """
    toxic_a, toxic_b = [], []
    cat_a, cat_b = [], []   # flattened per-category binary vectors

    for task_id in shared_tasks:
        a1 = annotations_by_task[task_id][ann1_id]
        a2 = annotations_by_task[task_id][ann2_id]

        toxic_a.append(int(a1.is_toxic))
        toxic_b.append(int(a2.is_toxic))

        cats1 = set(a1.categories or [])
        cats2 = set(a2.categories or [])
        for cat in CATEGORIES:
            cat_a.append(int(cat in cats1))
            cat_b.append(int(cat in cats2))

    return (
        cohen_kappa(toxic_a, toxic_b),
        cohen_kappa(cat_a, cat_b),
        len(shared_tasks),
    )


@router.get("/{project_id}")
def get_iaa(
    project_id: int,
    _=Depends(admin_only),
    db: Session = Depends(get_db),
):
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Fetch all annotations for tasks in this project, with annotator info
    rows = (
        db.query(Annotation, User)
        .join(Task, Task.id == Annotation.task_id)
        .join(User, User.id == Annotation.annotator_id)
        .filter(Task.project_id == project_id)
        .all()
    )

    total_tasks = db.query(Task).filter(Task.project_id == project_id).count()

    # Build: task_id -> { annotator_id -> Annotation }
    annotations_by_task: dict[int, dict[int, Annotation]] = defaultdict(dict)
    annotator_info: dict[int, User] = {}

    for annotation, user in rows:
        annotations_by_task[annotation.task_id][annotation.annotator_id] = annotation
        annotator_info[annotation.annotator_id] = user

    # Tasks with 2+ annotations
    double_tasks = {
        task_id: ann_map
        for task_id, ann_map in annotations_by_task.items()
        if len(ann_map) >= 2
    }
    double_annotated_count = len(double_tasks)

    # Build per-pair kappa
    all_annotator_ids = list(annotator_info.keys())
    pair_results = []

    for ann1_id, ann2_id in combinations(sorted(all_annotator_ids), 2):
        shared = [
            task_id
            for task_id, ann_map in double_tasks.items()
            if ann1_id in ann_map and ann2_id in ann_map
        ]
        if not shared:
            continue

        kappa_tox, kappa_cat, n = kappa_for_pair(
            shared, annotations_by_task, ann1_id, ann2_id
        )

        ann1_agree = sum(
            annotations_by_task[t][ann1_id].is_toxic == annotations_by_task[t][ann2_id].is_toxic
            for t in shared
        )

        pair_results.append({
            "annotator_1": annotator_info[ann1_id].email,
            "annotator_2": annotator_info[ann2_id].email,
            "kappa_toxic": kappa_tox,
            "kappa_categories": kappa_cat,
            "agreed_tasks": ann1_agree,
            "total_compared": n,
        })

    # Overall kappa: pool all pairs' label vectors together
    if double_tasks and len(all_annotator_ids) >= 2:
        all_tox_a, all_tox_b = [], []
        all_cat_a, all_cat_b = [], []

        for ann1_id, ann2_id in combinations(sorted(all_annotator_ids), 2):
            shared = [
                task_id
                for task_id, ann_map in double_tasks.items()
                if ann1_id in ann_map and ann2_id in ann_map
            ]
            for task_id in shared:
                a1 = annotations_by_task[task_id][ann1_id]
                a2 = annotations_by_task[task_id][ann2_id]
                all_tox_a.append(int(a1.is_toxic))
                all_tox_b.append(int(a2.is_toxic))
                cats1 = set(a1.categories or [])
                cats2 = set(a2.categories or [])
                for cat in CATEGORIES:
                    all_cat_a.append(int(cat in cats1))
                    all_cat_b.append(int(cat in cats2))

        overall_kappa_toxic = cohen_kappa(all_tox_a, all_tox_b)
        overall_kappa_categories = cohen_kappa(all_cat_a, all_cat_b)
    else:
        overall_kappa_toxic = None
        overall_kappa_categories = None

    return {
        "project_id": project.id,
        "project_name": project.name,
        "total_tasks": total_tasks,
        "double_annotated_tasks": double_annotated_count,
        "annotator_pairs": pair_results,
        "overall_kappa_toxic": overall_kappa_toxic,
        "overall_kappa_categories": overall_kappa_categories,
    }
