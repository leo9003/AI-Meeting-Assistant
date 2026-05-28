from __future__ import annotations

import json
import os
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.task_model import Task
from app.schemas.task_schema import TaskDetailResponse, TaskUploadResponse


router = APIRouter(prefix="/tasks", tags=["Tasks"])

MAX_UPLOAD_SIZE_MB = 50
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a"}
STORAGE_DIR = Path(__file__).resolve().parent.parent.parent / "storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _as_iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _parse_summary(summary_json: str | None) -> dict | None:
    if not summary_json:
        return None

    try:
        return json.loads(summary_json)
    except Exception:
        return None


def _task_to_response(task: Task) -> TaskDetailResponse:
    return TaskDetailResponse(
        task_id=str(task.task_id),
        status=task.status,
        created_at=_as_iso(task.created_at),
        updated_at=_as_iso(task.updated_at),
        started_at=_as_iso(task.started_at),
        finished_at=_as_iso(task.finished_at),
        transcript=task.transcript,
        summary=_parse_summary(task.summary_json),
        error_stage=task.error_stage,
        error_message=task.error_message,
    )


@router.post("/upload", response_model=TaskUploadResponse, status_code=202)
def upload_task_audio(
    meeting_title: str = Form("Untitled Meeting"),
    audio_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    extension = Path(audio_file.filename or "").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only .mp3, .wav, .m4a files are supported.",
        )

    content = audio_file.file.read()
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Audio file exceeds the 50MB limit.",
        )

    task_id = uuid.uuid4()
    object_key = f"storage/task-{task_id}{extension}"
    storage_path = STORAGE_DIR / f"task-{task_id}{extension}"

    with storage_path.open("wb") as output_file:
        output_file.write(content)

    task = Task(
        task_id=task_id,
        object_key=object_key,
        original_filename=audio_file.filename,
        content_type=audio_file.content_type,
        file_size_bytes=len(content),
        status="pending",
        max_retries=0,
        retry_count=0,
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    return {
        "task_id": str(task.task_id),
        "status": task.status,
        "created_at": _as_iso(task.created_at),
    }


@router.get("/{task_id}", response_model=TaskDetailResponse)
def get_task_detail(task_id: str, db: Session = Depends(get_db)):
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="Invalid task_id format") from error

    task = db.query(Task).filter(Task.task_id == task_uuid).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    return _task_to_response(task)
