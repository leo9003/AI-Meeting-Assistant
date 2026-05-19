import json
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException


BASE_DIR = Path(__file__).resolve().parent.parent.parent
MEETINGS_DIR = BASE_DIR / "meetings"
MEETINGS_DIR.mkdir(exist_ok=True)


def generate_meeting_id() -> str:
    """Create a unique meeting id."""
    return str(uuid.uuid4())


def get_current_timestamp() -> str:
    """Return current timestamp for meeting metadata."""
    return datetime.now().isoformat()


def get_meeting_result_path(meeting_id: str) -> Path:
    """Return the JSON result path for a meeting."""
    return MEETINGS_DIR / f"{meeting_id}.json"


def save_meeting_result(meeting_id: str, result: dict) -> None:
    """Persist meeting result as a JSON file."""
    result_path = get_meeting_result_path(meeting_id)

    try:
        with result_path.open("w", encoding="utf-8") as output_file:
            json.dump(result, output_file, ensure_ascii=False, indent=2)

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save meeting result: {str(error)}"
        )


def load_meeting_result(meeting_id: str) -> dict:
    """Load meeting result from JSON file."""
    result_path = get_meeting_result_path(meeting_id)

    if not result_path.exists():
        raise HTTPException(status_code=404, detail="Meeting not found")

    try:
        with result_path.open("r", encoding="utf-8") as input_file:
            return json.load(input_file)

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load meeting result: {str(error)}"
        )


def list_meetings() -> list[dict]:
    """List saved meetings with lightweight metadata for history page."""
    meetings = []

    for result_path in MEETINGS_DIR.glob("*.json"):
        try:
            with result_path.open("r", encoding="utf-8") as input_file:
                meeting = json.load(input_file)

            meetings.append({
                "meeting_id": meeting.get("meeting_id", result_path.stem),
                "meeting_title": meeting.get("meeting_title", "Untitled Meeting"),
                "status": meeting.get("status", "unknown"),
                "created_at": meeting.get("created_at"),
                "speaker_count": meeting.get("speaker_count", 0),
                "has_summary": bool(meeting.get("summary"))
            })

        except Exception:
            continue

    meetings.sort(
        key=lambda meeting: meeting.get("created_at") or "",
        reverse=True
    )

    return meetings