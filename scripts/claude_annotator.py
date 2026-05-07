"""
Claude annotator pre ToxiLabel - automaticka anotacia textovych a obrazovych uloh.

# HOW TO RUN:
# 1. pip install anthropic requests
# 2. Set your API key:
#      Windows:  set ANTHROPIC_API_KEY=sk-ant-...
#      Linux:    export ANTHROPIC_API_KEY=sk-ant-...
# 3. python scripts/claude_annotator.py

# Required pip packages:
# - anthropic
# - requests
"""

import base64
import json
import os
import sys
import time
from pathlib import Path

import anthropic
import requests

# ---------- Configuration ----------

TOXILABEL_BASE_URL = "http://147.232.204.212"
CLAUDE_EMAIL = "claude@toxilabel.com"
CLAUDE_PASSWORD = "Claude123!"
CLAUDE_FULL_NAME = "Claude (Anthropic)"
CLAUDE_MODEL = "claude-sonnet-4-5"

PROGRESS_FILE = Path(__file__).resolve().parent / "progress.json"
RATE_LIMIT_DELAY_SEC = 0.5
HTTP_TIMEOUT_SEC = 30

VALID_CATEGORIES = {
    "urážka", "nenávisť", "výhražka", "dezinformácia", "rasa a etnicita",
    "náboženstvo", "sexuálna orientácia", "migranti", "hendikep", "vzhľad",
    "ideológia", "iné",
}

SYSTEM_PROMPT_TEXT = (
    "Si expert na anotáciu toxického obsahu v slovenskom a českom jazyku. "
    "Tvojou úlohou je klasifikovať texty podľa nasledujúcej schémy. "
    "Odpovedaj VÝHRADNE v JSON formáte bez akéhokoľvek iného textu."
)

SYSTEM_PROMPT_IMAGE = (
    SYSTEM_PROMPT_TEXT
    + " Pre obrázky analyzuj všetok viditeľný text, vizuálny obsah, symboly a kontext."
)


def build_user_prompt(text_content: str) -> str:
    return (
        "Klasifikuj nasledujúci text:\n\n"
        f"TEXT: {text_content}\n\n"
        "Odpovedaj v tomto presnom JSON formáte:\n"
        "{\n"
        '  "is_toxic": true alebo false,\n'
        '  "categories": [zoznam kategórií ak je toxický, inak prázdne pole],\n'
        '  "confidence": číslo od 0 do 1\n'
        "}\n\n"
        "Dostupné kategórie (použij len ak is_toxic=true):\n"
        "urážka, nenávisť, výhražka, dezinformácia, rasa a etnicita,\n"
        "náboženstvo, sexuálna orientácia, migranti, hendikep, vzhľad,\n"
        "ideológia, iné\n\n"
        "Pravidlá:\n"
        "- is_toxic=true ak text obsahuje akúkoľvek formu toxicity\n"
        "- categories môže obsahovať viacero hodnôt\n"
        "- Ak is_toxic=false, categories musí byť prázdne pole []"
    )


# ---------- ToxiLabel API ----------

def login_or_register() -> str:
    """Login as Claude. If account does not exist, register it first."""
    login_url = f"{TOXILABEL_BASE_URL}/api/auth/login"
    payload = {"email": CLAUDE_EMAIL, "password": CLAUDE_PASSWORD}

    resp = requests.post(login_url, json=payload, timeout=HTTP_TIMEOUT_SEC)
    if resp.status_code == 200:
        return resp.json()["access_token"]

    if resp.status_code != 401:
        raise RuntimeError(f"Login failed: {resp.status_code} {resp.text}")

    print("Účet Claude neexistuje, registrujem...")
    reg_resp = requests.post(
        f"{TOXILABEL_BASE_URL}/api/auth/register",
        json={
            "email": CLAUDE_EMAIL,
            "password": CLAUDE_PASSWORD,
            "full_name": CLAUDE_FULL_NAME,
            "role": "annotator",
        },
        timeout=HTTP_TIMEOUT_SEC,
    )
    if reg_resp.status_code not in (200, 201):
        raise RuntimeError(f"Registrácia zlyhala: {reg_resp.status_code} {reg_resp.text}")
    print("✓ Účet zaregistrovaný")

    resp = requests.post(login_url, json=payload, timeout=HTTP_TIMEOUT_SEC)
    resp.raise_for_status()
    return resp.json()["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def get_projects(token: str) -> list[dict]:
    resp = requests.get(
        f"{TOXILABEL_BASE_URL}/api/projects",
        headers=auth_headers(token),
        timeout=HTTP_TIMEOUT_SEC,
    )
    resp.raise_for_status()
    return [p for p in resp.json() if p.get("type") in ("text", "image")]


def get_tasks(token: str, project_id: int) -> list[dict]:
    resp = requests.get(
        f"{TOXILABEL_BASE_URL}/api/tasks",
        params={"project_id": project_id},
        headers=auth_headers(token),
        timeout=HTTP_TIMEOUT_SEC,
    )
    resp.raise_for_status()
    return resp.json()


def submit_annotation(token: str, task_id: int, classification: dict) -> None:
    body = {
        "task_id": task_id,
        "is_toxic": bool(classification.get("is_toxic", False)),
        "categories": list(classification.get("categories", [])),
        "notes": f"Anotované modelom Claude {CLAUDE_MODEL}",
    }
    resp = requests.post(
        f"{TOXILABEL_BASE_URL}/api/annotations",
        json=body,
        headers=auth_headers(token),
        timeout=HTTP_TIMEOUT_SEC,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Submit zlyhal: {resp.status_code} {resp.text}")


def download_image(project_id: int, file_name: str) -> tuple[str, str]:
    """Returns (base64_data, media_type)."""
    url = f"{TOXILABEL_BASE_URL}/uploads/{project_id}/{file_name}"
    resp = requests.get(url, timeout=HTTP_TIMEOUT_SEC)
    resp.raise_for_status()

    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    media_type = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "gif": "image/gif",
        "webp": "image/webp",
    }.get(ext, "image/jpeg")

    return base64.standard_b64encode(resp.content).decode("ascii"), media_type


# ---------- Claude classification ----------

def parse_classification(raw: str) -> dict:
    """Extract JSON object from model response, tolerating extra prose."""
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    start, end = raw.find("{"), raw.rfind("}")
    if start >= 0 and end > start:
        return json.loads(raw[start : end + 1])
    raise ValueError(f"Cannot parse JSON from response: {raw[:200]}")


def normalize_classification(parsed: dict) -> dict:
    """Coerce to expected shape and drop unknown categories."""
    is_toxic = bool(parsed.get("is_toxic", False))
    cats = parsed.get("categories") or []
    if not isinstance(cats, list):
        cats = []
    cats = [c for c in cats if isinstance(c, str) and c in VALID_CATEGORIES]
    if not is_toxic:
        cats = []
    return {"is_toxic": is_toxic, "categories": cats}


def classify_text(client: anthropic.Anthropic, text: str) -> dict:
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT_TEXT,
        messages=[{"role": "user", "content": build_user_prompt(text)}],
    )
    text_block = next((b.text for b in response.content if b.type == "text"), "")
    return normalize_classification(parse_classification(text_block))


def classify_image(client: anthropic.Anthropic, image_b64: str, media_type: str) -> dict:
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT_IMAGE,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_b64,
                    },
                },
                {"type": "text", "text": build_user_prompt("[obsah obrázka]")},
            ],
        }],
    )
    text_block = next((b.text for b in response.content if b.type == "text"), "")
    return normalize_classification(parse_classification(text_block))


# ---------- Progress tracking ----------

def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        try:
            return json.loads(PROGRESS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass
    return {"completed_task_ids": []}


def save_progress(progress: dict) -> None:
    PROGRESS_FILE.write_text(
        json.dumps(progress, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ---------- Main ----------

def main() -> int:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("CHYBA: Nastavte ANTHROPIC_API_KEY environment premennú.")
        return 1

    print("Prihlasujem Claude anotátora...")
    token = login_or_register()
    print("✓ Prihlásený\n")

    client = anthropic.Anthropic()
    progress = load_progress()
    completed = set(progress.get("completed_task_ids", []))

    print("Načítavam projekty...")
    projects = get_projects(token)
    print(f"✓ Nájdených {len(projects)} text/image projektov\n")

    stats = {
        "total": 0,
        "annotated": 0,
        "toxic": 0,
        "non_toxic": 0,
        "skipped": 0,
        "errors": 0,
    }

    for project in projects:
        project_id = project["id"]
        project_name = project["name"]
        project_type = project["type"]

        print(f"=== Projekt: {project_name} (ID {project_id}, typ {project_type}) ===")
        try:
            tasks = get_tasks(token, project_id)
        except Exception as e:
            print(f"  Nepodarilo sa načítať úlohy: {e}\n")
            continue

        total_in_project = len(tasks)
        print(f"  Úloh v projekte: {total_in_project}\n")

        for idx, task in enumerate(tasks, start=1):
            stats["total"] += 1
            task_id = task["id"]

            if task_id in completed or task.get("annotated_by_me"):
                completed.add(task_id)
                stats["skipped"] += 1
                continue

            try:
                if project_type == "text":
                    content = task.get("content") or ""
                    if not content.strip():
                        print(f"  Projekt: {project_name} | Úloha {idx}/{total_in_project} (#{task_id}) | preskočené - prázdny obsah")
                        stats["skipped"] += 1
                        continue
                    classification = classify_text(client, content)
                else:  # image
                    file_name = task.get("file_name")
                    if not file_name:
                        print(f"  Projekt: {project_name} | Úloha {idx}/{total_in_project} (#{task_id}) | preskočené - bez súboru")
                        stats["skipped"] += 1
                        continue
                    try:
                        image_b64, media_type = download_image(project_id, file_name)
                    except Exception as e:
                        print(f"  Projekt: {project_name} | Úloha {idx}/{total_in_project} (#{task_id}) | CHYBA pri sťahovaní: {e}")
                        stats["errors"] += 1
                        time.sleep(RATE_LIMIT_DELAY_SEC)
                        continue
                    classification = classify_image(client, image_b64, media_type)

                submit_annotation(token, task_id, classification)

                is_toxic = classification["is_toxic"]
                cats = ", ".join(classification["categories"]) or "—"
                print(
                    f"  Projekt: {project_name} | Úloha {idx}/{total_in_project} | "
                    f"is_toxic: {is_toxic} | kategórie: {cats}"
                )

                stats["annotated"] += 1
                if is_toxic:
                    stats["toxic"] += 1
                else:
                    stats["non_toxic"] += 1

                completed.add(task_id)
                progress["completed_task_ids"] = sorted(completed)
                save_progress(progress)

            except anthropic.APIError as e:
                print(f"  Projekt: {project_name} | Úloha {idx}/{total_in_project} (#{task_id}) | Claude API chyba: {e}")
                stats["errors"] += 1
            except Exception as e:
                print(f"  Projekt: {project_name} | Úloha {idx}/{total_in_project} (#{task_id}) | CHYBA: {e}")
                stats["errors"] += 1

            time.sleep(RATE_LIMIT_DELAY_SEC)

        print()

    print("=" * 60)
    print("HOTOVO. Súhrn:")
    print(f"  Celkovo prejdených úloh:   {stats['total']}")
    print(f"  Anotovaných:                {stats['annotated']}")
    print(f"    - toxických:               {stats['toxic']}")
    print(f"    - netoxických:             {stats['non_toxic']}")
    print(f"  Preskočených (existujúce):  {stats['skipped']}")
    print(f"  Chýb:                       {stats['errors']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
