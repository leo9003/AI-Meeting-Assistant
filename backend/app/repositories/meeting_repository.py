from uuid import UUID

from sqlalchemy.orm import Session

from app.models.meeting_model import Meeting


def create_meeting(
    db: Session,
    meeting_id: str,
    meeting_title: str,
    status: str,
    speaker_count: int,
    transcript: str,
    timeline_transcript: str,
    summary: str | None = None,
    content_type: str | None = None,
) -> Meeting:
    """Create and persist a meeting record."""
    meeting = Meeting(
        id=UUID(meeting_id),
        meeting_title=meeting_title,
        status=status,
        speaker_count=speaker_count,
        transcript=transcript,
        timeline_transcript=timeline_transcript,
        summary=summary,
        content_type=content_type,
    )

    db.add(meeting)
    db.commit()
    db.refresh(meeting)

    return meeting


def get_meeting_by_id(
    db: Session,
    meeting_id: str
) -> Meeting | None:
    """Get one meeting by id."""
    return (
        db.query(Meeting)
        .filter(Meeting.id == UUID(meeting_id))
        .first()
    )


def list_meetings(
    db: Session,
    limit: int = 50
) -> list[Meeting]:
    """List recent meetings."""
    return (
        db.query(Meeting)
        .order_by(Meeting.created_at.desc())
        .limit(limit)
        .all()
    )