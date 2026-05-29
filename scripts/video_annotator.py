# HOW TO RUN:
# 1. py -m pip install openai requests
# 2. set OPENAI_API_KEY=sk-...  (Windows)
#    or export OPENAI_API_KEY=sk-...  (Linux)
# 3. py scripts/video_annotator.py

# Required packages:
# pip install openai requests# HOW TO RUN:
# 1. py -m pip install anthropic requests
# 2. set ANTHROPIC_API_KEY=sk-ant-...  (Windows)
#    or export ANTHROPIC_API_KEY=sk-ant-...  (Linux)
# 3. py scripts/claude_video_annotator.py

# Required packages:
# pip install anthropic requests

import anthropic
import requests
import subprocess
import json
import os
import time
from pathlib import Path

API_BASE = "http://147.232.204.212/api"
CLAUDE_MODEL = "claude-sonnet-4-20250514"

SCRIPTS_DIR = Path(__file__).parent
PROGRESS_FILE = SCRIPTS_DIR / "progress_video.json"
SKIPPED_FILE = SCRIPTS_DIR / "skipped_videos.txt"

MAX_VIDEO_BYTES = 24 * 1024 * 1024  # 24 MB

FORMATS_NEEDING_CONVERSION = {".mov", ".avi", ".mkv"}
_ffmpeg_available = None

EMAIL = "claude@toxilabel.com"
PASSWORD = "Claude123!"
FULL_NAME = "Claude (Anthropic)"

ADMIN_EMAIL = "admin@toxilabel.com"
ADMIN_PASSWORD = "admin123"

SYSTEM_PROMPT = (
    "Si expert na anotáciu toxického obsahu v slovenskom a českom jazyku.\n"
    "Tvojou úlohou je klasifikovať texty podľa nasledujúcej schémy.\n"
    "Odpovedaj VÝHRADNE v JSON formáte bez akéhokoľvek iného textu."
)

CLASSIFY_INSTRUCTIONS = """Odpovedaj v tomto presnom JSON formáte:
{
  "is_toxic": true alebo false,
  "categories": [zoznam kategórií ak je toxický, inak prázdne pole],
  "confidence": číslo od 0 do 1
}

Dostupné kategórie (použij len ak is_toxic=true):
urážka, nenávisť, výhražka, dezinformácia, rasa a etnicita,
náboženstvo, sexuálna orientácia, migranti, hendikep, vzhľad,
ideológia, iné

Pravidlá:
- is_toxic=true ak text obsahuje akúkoľvek formu toxicity
- categories môže obsahovať viacero hodnôt
- Ak is_toxic=false, categories musí byť prázdne pole []"""


def login(session, email, password):
    resp = session.post(
        f"{API_BASE}/auth/login",
        json={"email": email, "password": password},
    )

    if resp.status_code == 200:
        data = resp.json()
        return data.get("access_token") or data.get("token")

    return None


def register_and_login_claude(session):
    token = login(session, EMAIL, PASSWORD)

    if token:
        return token

    session.post(
        f"{API_BASE}/auth/register",
        json={
            "email": EMAIL,
            "password": PASSWORD,
            "full_name": FULL_NAME,
            "role": "annotator",
        },
    )

    return login(session, EMAIL, PASSWORD)


def get_video_projects(admin_session):
    resp = admin_session.get(f"{API_BASE}/projects")

    if resp.status_code != 200:
        print(f"Chyba načítania projektov: {resp.status_code}")
        return []

    data = resp.json()
    projects = data if isinstance(data, list) else data.get("projects", [])

    return [p for p in projects if p.get("type") == "video"]


def get_tasks(admin_session, project_id):
    resp = admin_session.get(
        f"{API_BASE}/tasks",
        params={"project_id": project_id},
    )

    if resp.status_code != 200:
        print(f"  Chyba načítania úloh: {resp.status_code}")
        return []

    data = resp.json()
    return data if isinstance(data, list) else data.get("tasks", [])


def get_existing_transcript(admin_session, task_id):
    resp = admin_session.get(f"{API_BASE}/tasks/{task_id}/transcript")

    if resp.status_code == 200:
        data = resp.json()
        transcript = data.get("transcript") or data.get("text") or ""
        return transcript.strip()

    return None


def save_transcript(admin_session, task_id, transcript_text):
    resp = admin_session.post(
        f"{API_BASE}/tasks/{task_id}/transcribe",
        json={"transcript": transcript_text},
    )

    return resp.status_code in (200, 201)


def submit_annotation(session, task_id, is_toxic, categories):
    resp = session.post(
        f"{API_BASE}/annotations",
        json={
            "task_id": task_id,
            "is_toxic": is_toxic,
            "categories": categories,
            "notes": f"Anotované modelom Claude {CLAUDE_MODEL} na základe Whisper prepisu",
        },
    )

    return resp.status_code in (200, 201)


def load_progress():
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, encoding="utf-8") as f:
            return json.load(f)

    return {"annotated": []}


def save_progress(progress):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2, ensure_ascii=False)


def log_skipped(task_id, file_name, reason):
    with open(SKIPPED_FILE, "a", encoding="utf-8") as f:
        f.write(f"Task #{task_id} | {file_name} | reason: {reason}\n")


def parse_result(result_text):
    text = result_text.strip()

    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(
            lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        )

    return json.loads(text)


def classify_transcript(client, transcript_text):
    user_message = (
        f"Klasifikuj nasledujúci prepis reči z videa:\n\n"
        f"PREPIS: {transcript_text}\n\n"
        f"{CLASSIFY_INSTRUCTIONS}"
    )

    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=200,
        system=[{
            "type": "text",
            "text": SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[
            {
                "role": "user",
                "content": user_message,
            }
        ],
    )

    return response.content[0].text


def check_ffmpeg():
    global _ffmpeg_available

    if _ffmpeg_available is None:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
        )

        _ffmpeg_available = result.returncode == 0

    return _ffmpeg_available


def convert_to_mp3(input_path):
    output_path = input_path.with_suffix(".mp3")

    result = subprocess.run(
        [
            "ffmpeg",
            "-i",
            str(input_path),
            "-vn",
            "-acodec",
            "mp3",
            str(output_path),
            "-y",
        ],
        capture_output=True,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg zlyhal: "
            f"{result.stderr.decode(errors='replace')[:200]}"
        )

    return output_path


def transcribe_with_whisper_api(video_path):
    """
    Používa OpenAI Whisper REST API priamo cez requests.
    Vyhne sa potrebe openai knižnice.
    """

    api_key = os.environ.get("OPENAI_API_KEY")

    if not api_key:
        raise ValueError("Chýba OPENAI_API_KEY pre Whisper prepis")

    with open(video_path, "rb") as audio_file:
        response = requests.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={
                "Authorization": f"Bearer {api_key}",
            },
            files={
                "file": audio_file,
            },
            data={
                "model": "whisper-1",
                "language": "sk",
            },
            timeout=300,
        )

    response.raise_for_status()

    data = response.json()

    return data["text"].strip()


def download_and_transcribe(project_id, task_id, file_name):
    ext = os.path.splitext(file_name)[1].lower() or ".mp4"

    temp_video = SCRIPTS_DIR / f"temp_video_{task_id}{ext}"
    temp_audio = None

    video_url = f"http://147.232.204.212/uploads/{project_id}/{file_name}"

    try:
        with requests.get(video_url, stream=True, timeout=60) as r:
            r.raise_for_status()

            content_length = r.headers.get("Content-Length")

            if content_length and int(content_length) > MAX_VIDEO_BYTES:
                raise ValueError(
                    f"súbor príliš veľký "
                    f"({int(content_length) // (1024 * 1024)} MB > 24 MB)"
                )

            downloaded = 0

            with open(temp_video, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    downloaded += len(chunk)

                    if downloaded > MAX_VIDEO_BYTES:
                        raise ValueError(
                            "súbor príliš veľký (>24 MB počas sťahovania)"
                        )

                    f.write(chunk)

        whisper_file = temp_video

        if ext in FORMATS_NEEDING_CONVERSION:
            if check_ffmpeg():
                temp_audio = convert_to_mp3(temp_video)
                whisper_file = temp_audio

        transcript = transcribe_with_whisper_api(whisper_file)

        return transcript

    finally:
        for path in (temp_video, temp_audio):
            if path and path.exists():
                path.unlink()


def main():
    anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY")

    if not anthropic_api_key:
        print("Chyba: Nastavte premennú ANTHROPIC_API_KEY")
        return

    if not os.environ.get("OPENAI_API_KEY"):
        print("Chyba: Nastavte OPENAI_API_KEY pre Whisper")
        return

    client = anthropic.Anthropic(api_key=anthropic_api_key)

    claude_session = requests.Session()
    admin_session = requests.Session()

    print("Prihlasovanie do ToxiLabel...")

    claude_token = register_and_login_claude(claude_session)
    admin_token = login(admin_session, ADMIN_EMAIL, ADMIN_PASSWORD)

    if not claude_token or not admin_token:
        print("Chyba: Prihlasovanie zlyhalo!")
        return

    claude_session.headers.update({
        "Authorization": f"Bearer {claude_token}"
    })

    admin_session.headers.update({
        "Authorization": f"Bearer {admin_token}"
    })

    print("Prihlasovanie úspešné (Claude + admin).")

    progress = load_progress()
    annotated_ids = set(progress.get("annotated", []))

    total_transcribed = 0
    total_annotated = 0
    total_skipped = 0
    total_errors = 0

    projects = get_video_projects(admin_session)

    print(f"Nájdených {len(projects)} video projektov.\n")

    for project in projects:
        project_id = project["id"]
        project_name = project.get("name", f"Projekt {project_id}")

        tasks = get_tasks(admin_session, project_id)
        total_tasks = len(tasks)

        print(f"Projekt: {project_name} | Úloh: {total_tasks}")

        for idx, task in enumerate(tasks, 1):
            task_id = task["id"]

            file_name = (
                task.get("file_name")
                or task.get("filename")
                or task.get("video")
                or task.get("file")
                or ""
            )

            if task_id in annotated_ids:
                continue

            transcript = None
            transcribed_now = False

            try:
                existing = get_existing_transcript(admin_session, task_id)

                if existing and len(existing) >= 10:
                    transcript = existing

            except Exception:
                pass

            if transcript is None:
                if not file_name:
                    print(
                        f"  Úloha {idx}/{total_tasks} | "
                        f"Žiadny súbor, preskočená"
                    )

                    log_skipped(
                        task_id,
                        file_name or "unknown",
                        "žiadny súbor",
                    )

                    total_skipped += 1
                    continue

                try:
                    transcript = download_and_transcribe(
                        project_id,
                        task_id,
                        file_name,
                    )

                    transcribed_now = True

                except ValueError as ve:
                    reason = str(ve)

                    print(
                        f"  Úloha {idx}/{total_tasks} | "
                        f"PRESKOČENÉ - {reason}"
                    )

                    log_skipped(task_id, file_name, reason)

                    total_skipped += 1
                    continue

                except Exception as e:
                    print(
                        f"  Úloha {idx}/{total_tasks} | "
                        f"Chyba sťahovania/prepisu: {e}"
                    )

                    log_skipped(
                        task_id,
                        file_name,
                        f"chyba sťahovania: {e}",
                    )

                    total_skipped += 1
                    total_errors += 1
                    continue

            if not transcript or len(transcript) < 10:
                print(
                    f"  Úloha {idx}/{total_tasks} | "
                    f"PRESKOČENÉ - prázdny/chybný prepis"
                )

                log_skipped(task_id, file_name, "prázdny prepis")

                total_skipped += 1
                continue

            if transcribed_now:
                try:
                    save_transcript(
                        admin_session,
                        task_id,
                        transcript,
                    )

                    total_transcribed += 1

                except Exception as e:
                    print(
                        f"  Úloha {idx}/{total_tasks} | "
                        f"Varovanie: uloženie prepisu zlyhalo: {e}"
                    )

            try:
                result_text = classify_transcript(
                    client,
                    transcript,
                )

                result = parse_result(result_text)

                is_toxic = bool(result.get("is_toxic", False))

                categories = (
                    result.get("categories", [])
                    if is_toxic else []
                )

            except json.JSONDecodeError as e:
                print(
                    f"  Úloha {idx}/{total_tasks} | "
                    f"Chyba JSON: {e}"
                )

                total_errors += 1
                time.sleep(0.5)
                continue

            except anthropic.APIError as e:
                print(
                    f"  Úloha {idx}/{total_tasks} | "
                    f"Claude API chyba: {e}"
                )

                total_errors += 1
                time.sleep(0.5)
                continue

            except Exception as e:
                print(
                    f"  Úloha {idx}/{total_tasks} | "
                    f"Chyba: {e}"
                )

                total_errors += 1
                time.sleep(0.5)
                continue

            transcript_preview = transcript[:50].replace("\n", " ")

            cats_str = ", ".join(categories) if categories else "žiadne"

            print(
                f"  Projekt: {project_name} | "
                f"Úloha {idx}/{total_tasks} | "
                f"Prepis: '{transcript_preview}...' | "
                f"is_toxic: {is_toxic} | "
                f"kategórie: {cats_str}"
            )

            if submit_annotation(
                claude_session,
                task_id,
                is_toxic,
                categories,
            ):
                annotated_ids.add(task_id)

                progress["annotated"] = list(annotated_ids)

                save_progress(progress)

                total_annotated += 1

            else:
                print(
                    f"  Úloha {idx}/{total_tasks} | "
                    f"Chyba odoslania anotácie"
                )

            time.sleep(0.5)

        print()

    print("=" * 60)
    print("SÚHRN")
    print(f"  Prepísaných videí:   {total_transcribed}")
    print(f"  Anotovaných úloh:    {total_annotated}")
    print(f"  Preskočených:        {total_skipped}")
    print(f"  Chýb:                {total_errors}")
    print("=" * 60)

    if SKIPPED_FILE.exists():
        print(f"  Preskočené úlohy uložené v: {SKIPPED_FILE}")


if __name__ == "__main__":
    main()

from openai import OpenAI
import requests
import subprocess
import json
import os
import time
from pathlib import Path

API_BASE = "http://147.232.204.212/api"
GPT_MODEL = "gpt-4o"
SCRIPTS_DIR = Path(__file__).parent
PROGRESS_FILE = SCRIPTS_DIR / "progress_video.json"
SKIPPED_FILE = SCRIPTS_DIR / "skipped_videos.txt"
MAX_VIDEO_BYTES = 24 * 1024 * 1024  # 24 MB (OpenAI hard limit is 25 MB)

# Formats Whisper doesn't officially support — convert to mp3 via ffmpeg first
FORMATS_NEEDING_CONVERSION = {".mov", ".avi", ".mkv"}
_ffmpeg_available = None

ANNOTATOR_EMAIL = "dano@toxilabel.com"
ANNOTATOR_PASSWORD = "Dano123"
ADMIN_EMAIL = "admin@toxilabel.com"
ADMIN_PASSWORD = "admin123"

SYSTEM_PROMPT = (
    "Si expert na anotáciu toxického obsahu v slovenskom a českom jazyku.\n"
    "Tvojou úlohou je klasifikovať texty podľa nasledujúcej schémy.\n"
    "Odpovedaj VÝHRADNE v JSON formáte bez akéhokoľvek iného textu."
)

CLASSIFY_INSTRUCTIONS = """Odpovedaj v tomto presnom JSON formáte:
{
  "is_toxic": true alebo false,
  "categories": [zoznam kategórií ak je toxický, inak prázdne pole],
  "confidence": číslo od 0 do 1
}

Dostupné kategórie (použij len ak is_toxic=true):
urážka, nenávisť, výhražka, dezinformácia, rasa a etnicita,
náboženstvo, sexuálna orientácia, migranti, hendikep, vzhľad,
ideológia, iné

Pravidlá:
- is_toxic=true ak text obsahuje akúkoľvek formu toxicity
- categories môže obsahovať viacero hodnôt
- Ak is_toxic=false, categories musí byť prázdne pole []"""


def login(session, email, password, role_label):
    resp = session.post(f"{API_BASE}/auth/login", json={"email": email, "password": password})
    if resp.status_code == 200:
        data = resp.json()
        token = data.get("access_token") or data.get("token")
        if token:
            return token
    print(f"Chyba: Prihlasovanie zlyhalo pre {role_label} ({resp.status_code})")
    return None


def get_video_projects(admin_session):
    resp = admin_session.get(f"{API_BASE}/projects")
    if resp.status_code != 200:
        print(f"Chyba načítania projektov: {resp.status_code}")
        return []
    data = resp.json()
    projects = data if isinstance(data, list) else data.get("projects", [])
    return [p for p in projects if p.get("type") == "video"]


def get_tasks(admin_session, project_id):
    resp = admin_session.get(f"{API_BASE}/tasks", params={"project_id": project_id})
    if resp.status_code != 200:
        print(f"  Chyba načítania úloh: {resp.status_code}")
        return []
    data = resp.json()
    return data if isinstance(data, list) else data.get("tasks", [])


def get_existing_transcript(admin_session, task_id):
    resp = admin_session.get(f"{API_BASE}/tasks/{task_id}/transcript")
    if resp.status_code == 200:
        data = resp.json()
        transcript = data.get("transcript") or data.get("text") or ""
        return transcript.strip()
    return None


def save_transcript(admin_session, task_id, transcript_text):
    resp = admin_session.post(f"{API_BASE}/tasks/{task_id}/transcribe",
                               json={"transcript": transcript_text})
    return resp.status_code in (200, 201)


def submit_annotation(dano_session, task_id, is_toxic, categories):
    resp = dano_session.post(f"{API_BASE}/annotations", json={
        "task_id": task_id,
        "is_toxic": is_toxic,
        "categories": categories,
        "notes": "Anotované GPT-4o na základe Whisper prepisu",
    })
    return resp.status_code in (200, 201)


def load_progress():
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"annotated": []}


def save_progress(progress):
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, indent=2, ensure_ascii=False)


def log_skipped(task_id, file_name, reason):
    with open(SKIPPED_FILE, "a", encoding="utf-8") as f:
        f.write(f"Task #{task_id} | {file_name} | reason: {reason}\n")


def parse_result(result_text):
    text = result_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(text)


def classify_transcript(client, transcript_text):
    user_message = (
        f"Klasifikuj nasledujúci prepis reči z videa:\n\n"
        f"PREPIS: {transcript_text}\n\n"
        f"{CLASSIFY_INSTRUCTIONS}"
    )
    response = client.chat.completions.create(
        model=GPT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_tokens=200,
    )
    return response.choices[0].message.content


def check_ffmpeg():
    global _ffmpeg_available
    if _ffmpeg_available is None:
        result = subprocess.run(["ffmpeg", "-version"], capture_output=True)
        _ffmpeg_available = result.returncode == 0
    return _ffmpeg_available


def convert_to_mp3(input_path):
    output_path = input_path.with_suffix(".mp3")
    result = subprocess.run(
        ["ffmpeg", "-i", str(input_path), "-vn", "-acodec", "mp3", str(output_path), "-y"],
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg zlyhal: {result.stderr.decode(errors='replace')[:200]}")
    return output_path


def download_and_transcribe(client, project_id, task_id, file_name):
    ext = os.path.splitext(file_name)[1].lower() or ".mp4"
    temp_video = SCRIPTS_DIR / f"temp_video_{task_id}{ext}"
    temp_audio = None
    video_url = f"http://147.232.204.212/uploads/{project_id}/{file_name}"

    try:
        with requests.get(video_url, stream=True, timeout=60) as r:
            r.raise_for_status()
            content_length = r.headers.get("Content-Length")
            if content_length and int(content_length) > MAX_VIDEO_BYTES:
                raise ValueError(
                    f"súbor príliš veľký ({int(content_length) // (1024 * 1024)} MB > 24 MB)"
                )
            downloaded = 0
            with open(temp_video, "wb") as f:
                for chunk in r.iter_content(chunk_size=1024 * 1024):
                    downloaded += len(chunk)
                    if downloaded > MAX_VIDEO_BYTES:
                        raise ValueError("súbor príliš veľký (>24 MB počas sťahovania)")
                    f.write(chunk)

        # For formats Whisper doesn't natively support, convert to mp3 via ffmpeg
        whisper_file = temp_video
        if ext in FORMATS_NEEDING_CONVERSION:
            if check_ffmpeg():
                temp_audio = convert_to_mp3(temp_video)
                whisper_file = temp_audio
            # else: attempt direct send; catch failure below

        try:
            with open(whisper_file, "rb") as f:
                result = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                    language="sk",
                )
        except Exception:
            if ext in FORMATS_NEEDING_CONVERSION and not check_ffmpeg():
                raise ValueError(
                    f"nepodporovaný formát {ext} (nainštalujte ffmpeg pre .mov/.avi/.mkv)"
                )
            raise

        return result.text.strip()

    finally:
        for path in (temp_video, temp_audio):
            if path and path.exists():
                path.unlink()


def main():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Chyba: Nastavte premennú OPENAI_API_KEY")
        return

    client = OpenAI(api_key=api_key)

    # Login both accounts
    dano_session = requests.Session()
    admin_session = requests.Session()

    print("Prihlasovanie do ToxiLabel...")
    dano_token = login(dano_session, ANNOTATOR_EMAIL, ANNOTATOR_PASSWORD, "dano (anotátor)")
    admin_token = login(admin_session, ADMIN_EMAIL, ADMIN_PASSWORD, "admin")

    if not dano_token or not admin_token:
        print("Chyba: Prihlasovanie zlyhalo, skript končí.")
        return

    dano_session.headers.update({"Authorization": f"Bearer {dano_token}"})
    admin_session.headers.update({"Authorization": f"Bearer {admin_token}"})
    print("Prihlasovanie úspešné (dano + admin).")

    progress = load_progress()
    annotated_ids = set(progress.get("annotated", []))

    total_transcribed = 0
    total_annotated = 0
    total_skipped = 0
    total_errors = 0

    projects = get_video_projects(admin_session)
    print(f"Nájdených {len(projects)} video projektov.\n")

    for project in projects:
        project_id = project["id"]
        project_name = project.get("name", f"Projekt {project_id}")

        tasks = get_tasks(admin_session, project_id)
        total_tasks = len(tasks)
        print(f"Projekt: {project_name} | Úloh: {total_tasks}")

        for idx, task in enumerate(tasks, 1):
            task_id = task["id"]
            file_name = (task.get("file_name") or task.get("filename")
                         or task.get("video") or task.get("file") or "")

            if task_id in annotated_ids:
                continue

            transcript = None
            transcribed_now = False

            # Step 1: check for existing transcript
            try:
                existing = get_existing_transcript(admin_session, task_id)
                if existing and len(existing) >= 10:
                    transcript = existing
            except Exception:
                pass

            # Step 2: download + transcribe if needed
            if transcript is None:
                if not file_name:
                    print(f"  Úloha {idx}/{total_tasks} | Žiadny súbor, preskočená")
                    log_skipped(task_id, file_name or "unknown", "žiadny súbor")
                    total_skipped += 1
                    continue

                try:
                    transcript = download_and_transcribe(client, project_id, task_id, file_name)
                    transcribed_now = True
                except ValueError as ve:
                    reason = str(ve)
                    print(f"  Úloha {idx}/{total_tasks} | PRESKOČENÉ - {reason}")
                    log_skipped(task_id, file_name, reason)
                    total_skipped += 1
                    continue
                except Exception as e:
                    print(f"  Úloha {idx}/{total_tasks} | Chyba sťahovania/prepisu: {e}")
                    log_skipped(task_id, file_name, f"chyba sťahovania: {e}")
                    total_skipped += 1
                    total_errors += 1
                    continue

            # Step 3: validate transcript
            if not transcript or len(transcript) < 10:
                print(f"  Úloha {idx}/{total_tasks} | PRESKOČENÉ - prázdny/chybný prepis")
                log_skipped(task_id, file_name, "prázdny prepis")
                total_skipped += 1
                continue

            # Step 4: save transcript to server (only if freshly transcribed)
            if transcribed_now:
                try:
                    save_transcript(admin_session, task_id, transcript)
                    total_transcribed += 1
                except Exception as e:
                    print(f"  Úloha {idx}/{total_tasks} | Varovanie: uloženie prepisu zlyhalo: {e}")

            # Step 5: classify with GPT-4o
            try:
                result_text = classify_transcript(client, transcript)
                result = parse_result(result_text)
                is_toxic = bool(result.get("is_toxic", False))
                categories = result.get("categories", []) if is_toxic else []
            except json.JSONDecodeError as e:
                print(f"  Úloha {idx}/{total_tasks} | Chyba JSON: {e}")
                total_errors += 1
                time.sleep(0.5)
                continue
            except Exception as e:
                print(f"  Úloha {idx}/{total_tasks} | GPT chyba: {e}")
                total_errors += 1
                time.sleep(0.5)
                continue

            # Step 6: submit annotation
            transcript_preview = transcript[:50].replace("\n", " ")
            cats_str = ", ".join(categories) if categories else "žiadne"
            print(f"  Projekt: {project_name} | Úloha {idx}/{total_tasks} | "
                  f"Prepis: '{transcript_preview}...' | is_toxic: {is_toxic} | kategórie: {cats_str}")

            if submit_annotation(dano_session, task_id, is_toxic, categories):
                annotated_ids.add(task_id)
                progress["annotated"] = list(annotated_ids)
                save_progress(progress)
                total_annotated += 1
            else:
                print(f"  Úloha {idx}/{total_tasks} | Chyba odoslania anotácie (možno už existuje)")

            time.sleep(0.5)

        print()

    print("=" * 60)
    print("SÚHRN")
    print(f"  Prepísaných videí:   {total_transcribed}")
    print(f"  Anotovaných úloh:    {total_annotated}")
    print(f"  Preskočených:        {total_skipped}")
    print(f"  Chýb:                {total_errors}")
    print("=" * 60)
    if SKIPPED_FILE.exists():
        print(f"  Preskočené úlohy uložené v: {SKIPPED_FILE}")


if __name__ == "__main__":
    main()
