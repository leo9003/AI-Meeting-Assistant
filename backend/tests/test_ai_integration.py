import os
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


@pytest.mark.integration
def test_real_ai_transcribe():
    audio_path = "tests/assets/sample_audio.m4a"

    assert os.path.exists(audio_path), "sample_audio.m4a does not exist"

    with open(audio_path, "rb") as audio_file:
        response = client.post(
            "/meetings/transcribe",
            data={"meeting_title": "Real AI Test"},
            files={
                "audio_file": (
                    "sample_audio.m4a",
                    audio_file,
                    "audio/mp4",
                )
            },
        )

    assert response.status_code == 200

    data = response.json()

    assert data["meeting_title"] == "Real AI Test"
    assert data["speaker_count"] >= 1
    assert len(data["transcript"]) > 0
    assert "segments" in data

# =========================
# Real AI Full Pipeline Test
# =========================
@pytest.mark.integration
def test_real_ai_transcribe_summary():
    audio_path = "tests/assets/sample_audio.m4a"

    assert os.path.exists(audio_path), "sample_audio.m4a does not exist"

    with open(audio_path, "rb") as audio_file:
        response = client.post(
            "/meetings/transcribe-summary",
            data={"meeting_title": "Real Full Pipeline Test"},
            files={
                "audio_file": (
                    "sample_audio.m4a",
                    audio_file,
                    "audio/mp4",
                )
            },
        )

    assert response.status_code == 200

    data = response.json()

    # =========================
    # 1. 基本欄位檢查
    # =========================
    assert data["meeting_title"] == "Real Full Pipeline Test"

    # =========================
    # 2. Transcript Quality
    # =========================
    transcript = data["transcript"]

    assert len(transcript) > 50

    # transcript keyword validation
    assert any(
    keyword in transcript
        for keyword in [
            "懷孕",
            "孩子",
            "讀書",
            "善良",
        ]
    )
    # =========================
    # 3. Speaker Diarization
    # =========================
    assert data["speaker_count"] >= 1
    assert len(data["segments"]) > 0

    first_segment = data["segments"][0]

    assert "speaker" in first_segment
    assert "text" in first_segment
    assert len(first_segment["text"]) > 0

    speakers = {
        seg["speaker"]
        for seg in data["segments"]
    }

    assert len(speakers) >= 1

    # 如果 sample audio 是雙人對話
    # assert len(speakers) == 2

    # =========================
    # 4. Summary Quality
    # =========================
    summary = data["summary"]

    assert len(summary) > 30

    assert any(
        keyword.lower() in summary.lower()
        for keyword in [
            "孩子",
            "懷孕",
            "期望",
            "善良",
        ]
    )

    # 避免模型亂回答
    assert "資訊不足" not in summary
    assert "無法判斷" not in summary