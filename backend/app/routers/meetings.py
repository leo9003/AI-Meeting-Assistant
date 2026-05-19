import os
import tempfile

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.ai_service import process_meeting_audio
from app.database import get_db
from app.repositories.meeting_repository import create_meeting, list_meetings
from app.schemas.meeting_schema import (
    SummaryResponse,
    TranscriptRequest,
    TranscribeResponse,
    TranscribeSummaryResponse,
)
from app.services.meeting_storage_service import (
    generate_meeting_id,
    get_current_timestamp,
    load_meeting_result,
    save_meeting_result,
)
from app.services.summary_service import generate_meeting_summary
from app.services.transcription_service import transcribe_audio_with_timeline


router = APIRouter(prefix="/meetings", tags=["Meetings"])


def save_uploaded_audio_to_temp_file(audio_file: UploadFile) -> str:
    suffix = os.path.splitext(audio_file.filename or "recording.m4a")[1] or ".m4a"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_audio:
        temp_audio.write(audio_file.file.read())
        return temp_audio.name


def extract_content_type_from_summary(summary_text: str | None) -> str | None:
    if not summary_text or "## 內容類型" not in summary_text:
        return None

    try:
        section = summary_text.split("## 內容類型", 1)[1]
        return section.splitlines()[1].strip().lower()
    except Exception:
        return None


@router.get("/view", response_class=HTMLResponse)
def meetings_page(db: Session = Depends(get_db)):
    meetings = list_meetings(db)

    meeting_cards = ""

    if not meetings:
        meeting_cards = """
        <div class="empty-state">
            <div class="empty-icon">🗂️</div>
            <h2>No meetings yet</h2>
            <p>Upload an audio file from Swagger API to generate your first meeting summary.</p>
            <a class="primary-button" href="/docs">Go to API Docs</a>
        </div>
        """
    else:
        for meeting in meetings:
            content_type = meeting.content_type or "unknown"
            icon = {
                "meeting": "👥",
                "lecture": "🎓",
                "interview": "🎤",
                "story": "📖",
                "general": "📝",
            }.get(content_type, "📝")

            meeting_cards += f"""
            <a class="meeting-card" href="/meetings/{meeting.id}">
                <div class="meeting-icon">{icon}</div>
                <div class="meeting-info">
                    <h3>{meeting.meeting_title}</h3>
                    <p>{content_type} · {meeting.speaker_count} speaker(s)</p>
                    <span>{meeting.created_at}</span>
                </div>
                <div class="meeting-status">{meeting.status}</div>
            </a>
            """

    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Meeting History</title>
        <style>
            body {{
                margin: 0;
                background: #0f172a;
                color: white;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            }}
            .layout {{
                max-width: 1100px;
                margin: 0 auto;
                padding: 48px 28px;
            }}
            .nav {{
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 48px;
            }}
            .brand {{
                font-size: 22px;
                font-weight: 700;
            }}
            .nav a {{
                color: #94a3b8;
                text-decoration: none;
                margin-left: 20px;
            }}
            .nav a:hover {{
                color: white;
            }}
            .hero {{
                margin-bottom: 36px;
            }}
            .hero h1 {{
                font-size: 44px;
                margin-bottom: 12px;
            }}
            .hero p {{
                color: #94a3b8;
                font-size: 18px;
            }}
            .meeting-list {{
                display: grid;
                gap: 18px;
            }}
            .meeting-card {{
                display: flex;
                align-items: center;
                gap: 20px;
                background: #1e293b;
                padding: 22px;
                border-radius: 24px;
                text-decoration: none;
                color: white;
                transition: 0.2s;
            }}
            .meeting-card:hover {{
                transform: translateY(-3px);
                background: #334155;
            }}
            .meeting-icon {{
                width: 54px;
                height: 54px;
                border-radius: 18px;
                background: #0f172a;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 26px;
            }}
            .meeting-info {{
                flex: 1;
            }}
            .meeting-info h3 {{
                margin: 0 0 6px;
                font-size: 20px;
            }}
            .meeting-info p {{
                margin: 0 0 6px;
                color: #94a3b8;
            }}
            .meeting-info span {{
                font-size: 13px;
                color: #64748b;
            }}
            .meeting-status {{
                background: rgba(34,197,94,0.15);
                color: #4ade80;
                padding: 8px 14px;
                border-radius: 999px;
                font-size: 14px;
                font-weight: 600;
            }}
            .empty-state {{
                text-align: center;
                padding: 80px 30px;
                background: #1e293b;
                border-radius: 28px;
            }}
            .empty-icon {{
                font-size: 52px;
                margin-bottom: 20px;
            }}
            .empty-state p {{
                color: #94a3b8;
                margin-bottom: 28px;
            }}
            .primary-button {{
                display: inline-block;
                background: #6366f1;
                color: white;
                text-decoration: none;
                padding: 12px 20px;
                border-radius: 14px;
                font-weight: 600;
            }}
        </style>
    </head>
    <body>
        <div class="layout">
            <div class="nav">
                <div class="brand">🎙️ AI Meeting Assistant</div>
                <div>
                    <a href="/">Home</a>
                    <a href="/docs">API Docs</a>
                </div>
            </div>

            <div class="hero">
                <h1>Meeting History</h1>
                <p>Saved AI transcription and summary records from PostgreSQL.</p>
            </div>

            <div class="meeting-list">
                {meeting_cards}
            </div>
        </div>
    </body>
    </html>
    """


@router.get("")
def get_meetings(db: Session = Depends(get_db)):
    meetings = list_meetings(db)

    return [
        {
            "meeting_id": str(meeting.id),
            "meeting_title": meeting.meeting_title,
            "status": meeting.status,
            "created_at": meeting.created_at,
            "speaker_count": meeting.speaker_count,
            "content_type": meeting.content_type,
            "has_summary": bool(meeting.summary),
        }
        for meeting in meetings
    ]


@router.post("/summary", response_model=SummaryResponse)
def summarize_meeting(request: TranscriptRequest):
    ai_summary = generate_meeting_summary(request.transcript)

    return {
        "meeting_title": request.meeting_title,
        "summary": ai_summary,
    }


@router.post("/transcribe-summary", response_model=TranscribeSummaryResponse)
def transcribe_and_summarize_meeting(
    meeting_title: str = Form(...),
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    temp_audio_path = save_uploaded_audio_to_temp_file(audio_file)

    try:
        meeting_result = process_meeting_audio(temp_audio_path)
        meeting_id = generate_meeting_id()
        content_type = extract_content_type_from_summary(meeting_result.get("summary"))

        response = {
            "meeting_id": meeting_id,
            "meeting_title": meeting_title,
            "status": "completed",
            "created_at": get_current_timestamp(),
            "speaker_count": meeting_result["speaker_count"],
            "transcript": meeting_result["transcript"],
            "timeline_transcript": meeting_result["timeline_transcript"],
            "segments": meeting_result["segments"],
            "summary": meeting_result["summary"],
        }

        save_meeting_result(meeting_id, response)

        create_meeting(
            db=db,
            meeting_id=meeting_id,
            meeting_title=meeting_title,
            status="completed",
            speaker_count=meeting_result["speaker_count"],
            transcript=meeting_result["transcript"],
            timeline_transcript=meeting_result["timeline_transcript"],
            summary=meeting_result.get("summary"),
            content_type=content_type,
        )

        return response

    finally:
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)


@router.post("/transcribe", response_model=TranscribeResponse)
def transcribe_meeting_audio(
    meeting_title: str = Form(...),
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    temp_audio_path = save_uploaded_audio_to_temp_file(audio_file)

    try:
        transcription_result = transcribe_audio_with_timeline(temp_audio_path)
        meeting_id = generate_meeting_id()

        response = {
            "meeting_id": meeting_id,
            "meeting_title": meeting_title,
            "status": "transcribed",
            "created_at": get_current_timestamp(),
            "speaker_count": transcription_result["speaker_count"],
            "transcript": transcription_result["transcript"],
            "timeline_transcript": transcription_result["timeline_transcript"],
            "segments": transcription_result["segments"],
        }

        save_meeting_result(meeting_id, response)

        create_meeting(
            db=db,
            meeting_id=meeting_id,
            meeting_title=meeting_title,
            status="transcribed",
            speaker_count=transcription_result["speaker_count"],
            transcript=transcription_result["transcript"],
            timeline_transcript=transcription_result["timeline_transcript"],
            summary=None,
            content_type=None,
        )

        return response

    finally:
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)


@router.get("/{meeting_id}")
def get_meeting_result(meeting_id: str):
    return load_meeting_result(meeting_id)