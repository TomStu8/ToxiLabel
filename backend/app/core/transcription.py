import logging
import threading

logger = logging.getLogger(__name__)

# Module-level Whisper singleton — loaded once and reused across requests.
# Eliminates the 30-60s model reload that was causing nginx proxy timeouts.
_whisper_lock = threading.Lock()
_whisper_model = None
_whisper_model_name: str | None = None


class TranscriptionBusyError(RuntimeError):
    """Raised when a transcription is already in progress."""


def _get_or_load_whisper():
    """Return cached Whisper model, loading it if necessary.
    Tries large-v3 first; falls back to medium on MemoryError.
    Must be called while holding _whisper_lock.
    """
    global _whisper_model, _whisper_model_name

    if _whisper_model is not None:
        return _whisper_model

    from faster_whisper import WhisperModel

    for model_name in ("large-v3", "medium"):
        try:
            logger.info("Loading Whisper model: %s", model_name)
            model = WhisperModel(model_name, device="cpu", compute_type="int8")
            _whisper_model = model
            _whisper_model_name = model_name
            logger.info("Whisper model loaded: %s", model_name)
            return model
        except MemoryError:
            logger.warning("Not enough memory for %s, trying smaller model", model_name)
        except Exception as exc:
            logger.error("Failed to load Whisper model %s: %s", model_name, exc, exc_info=True)

    raise RuntimeError("Could not load any Whisper model — insufficient memory or missing dependency")


def ocr_image(file_path: str) -> str:
    """Run Tesseract OCR on an image file. Returns extracted text or raises RuntimeError."""
    try:
        import pytesseract
        from PIL import Image

        img = Image.open(file_path)
        text = pytesseract.image_to_string(img, lang="slk+ces")
        return text.strip()
    except Exception as exc:
        logger.error("OCR failed for %s: %s", file_path, exc, exc_info=True)
        raise RuntimeError(f"OCR zlyhalo: {exc}") from exc


def transcribe_video(file_path: str) -> str:
    """Run Whisper on a video/audio file. Returns transcript or raises RuntimeError/TranscriptionBusyError."""
    acquired = _whisper_lock.acquire(blocking=False)
    if not acquired:
        raise TranscriptionBusyError("Prepis prebieha, skúste znova o chvíľu")

    try:
        model = _get_or_load_whisper()
        segments, _ = model.transcribe(file_path, language=None)
        return " ".join(seg.text.strip() for seg in segments).strip()
    except TranscriptionBusyError:
        raise
    except MemoryError:
        # Transcription ran out of memory mid-run — invalidate the cached model
        # so next call tries to load a smaller one
        global _whisper_model, _whisper_model_name
        _whisper_model = None
        _whisper_model_name = None
        logger.error("OOM during transcription of %s — model cache cleared", file_path)
        raise RuntimeError("Nedostatok pamäte počas prepisu. Skúste kratšie video.")
    except Exception as exc:
        logger.error("Transcription failed for %s: %s", file_path, exc, exc_info=True)
        raise RuntimeError(f"Prepis zlyhal: {exc}") from exc
    finally:
        _whisper_lock.release()
