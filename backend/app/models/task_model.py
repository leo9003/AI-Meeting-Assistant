import uuid

from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    String,
    Text,
    BigInteger,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.database import Base


class Task(Base):
    __tablename__ = "tasks"

    task_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # file info
    object_key = Column(Text, nullable=False)
    original_filename = Column(String, nullable=True)
    content_type = Column(String, nullable=True)
    file_size_bytes = Column(BigInteger, nullable=True)

    # status & results
    status = Column(String, nullable=False, default="pending")
    transcript = Column(Text, nullable=True)
    summary_json = Column(Text, nullable=True)  # store JSON as text to keep SQLite compatible
    error_stage = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)

    # retry / control
    max_retries = Column(Integer, nullable=False, default=0)
    retry_count = Column(Integer, nullable=False, default=0)

    # claim / locking for workers
    claimed_by = Column(String, nullable=True)
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    lock_expires_at = Column(DateTime(timezone=True), nullable=True)
    version = Column(Integer, nullable=False, default=0)

    # timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:  # pragma: no cover - convenience
        return f"<Task {self.task_id} status={self.status}>"
