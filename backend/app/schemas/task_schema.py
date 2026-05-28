from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field


class ActionItem(BaseModel):
    owner: str = Field(..., description="負責人或 '未提及'")
    task: str = Field(..., description="任務內容")
    due_date: Optional[str] = Field(None, description="YYYY-MM-DD 或 '未提及'")


class SummaryModel(BaseModel):
    topic: str
    key_points: List[str]
    action_items: List[ActionItem]


class TaskUploadResponse(BaseModel):
    task_id: str
    status: str
    created_at: Optional[str]


class TaskDetailResponse(BaseModel):
    task_id: str
    status: str
    created_at: Optional[str]
    updated_at: Optional[str]
    started_at: Optional[str]
    finished_at: Optional[str]

    # results
    transcript: Optional[str] = None
    summary: Optional[SummaryModel] = None

    # error info
    error_stage: Optional[str] = None
    error_message: Optional[str] = None

    class Config:
        schema_extra = {
            "example": {
                "task_id": "4f5a8d8a-1df5-4b4b-8e2f-6efb8b6e2e41",
                "status": "completed",
                "transcript": "Speaker 1: ...\nSpeaker 2: ...",
                "summary": {
                    "topic": "AI Meeting Assistant 測試流程確認",
                    "key_points": [
                        "先用 mock mode 驗證完整 workflow",
                        "確認 task status、DB 寫入與前端顯示正常"
                    ],
                    "action_items": [
                        {"owner": "Backend", "task": "完成 upload API 與 task 建立", "due_date": "未提及"}
                    ]
                },
                "error_stage": None,
                "error_message": None
            }
        }
