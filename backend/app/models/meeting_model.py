import uuid

from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database import Base


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    meeting_title = Column(
        String,
        nullable=False,
        default="Untitled Meeting"
    )

    status = Column(
        String,
        nullable=False,
        default="completed"
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    speaker_count = Column(
        Integer,
        nullable=False,
        default=0
    )

    transcript = Column(
        Text,
        nullable=False
    )

    timeline_transcript = Column(
        Text,
        nullable=False
    )

    summary = Column(
        Text,
        nullable=True
    )

    content_type = Column(
        String,
        nullable=True
    )