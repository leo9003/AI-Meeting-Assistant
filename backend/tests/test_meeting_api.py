from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_api_basic():
    response = client.get("/meetings")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_non_existing_meeting():
    response = client.get("/meetings/999999")

    assert response.status_code == 404
    assert response.json()["detail"] == "Meeting not found"


def test_get_meeting_detail():
    response = client.get("/meetings")

    assert response.status_code == 200

    meetings = response.json()

    if not meetings:
        return

    meeting_id = meetings[0]["meeting_id"]

    detail_response = client.get(
        f"/meetings/{meeting_id}"
    )

    assert detail_response.status_code == 200

    data = detail_response.json()

    assert "meeting_title" in data
    assert "transcript" in data
    assert "summary" in data

@pytest.mark.integration
def test_save_meeting_real_audio():
    audio_path = (
        Path(__file__).parent
        / "sample_audio"
        / "test_audio.m4a"
    )

    with open(audio_path, "rb") as audio_file:
        response = client.post(
            "/meetings/transcribe-summary",
            data={
                "meeting_title": "pytest integration test"
            },
            files={
                "audio_file": (
                    "test_audio.m4a",
                    audio_file,
                    "audio/m4a",
                )
            },
        )

    assert response.status_code == 200

    data = response.json()

    assert data["meeting_title"] == (
        "pytest integration test"
    )

    assert data["transcript"] != ""
    assert data["summary"] != ""
    assert data["speaker_count"] >= 1


def test_database_write():
    response = client.get("/meetings")

    meetings = response.json()

    assert isinstance(meetings, list)

@pytest.mark.integration
def test_ai_output_format():
    audio_path = (
        Path(__file__).parent
        / "sample_audio"
        / "test_audio.m4a"
    )

    with open(audio_path, "rb") as audio_file:
        response = client.post(
            "/meetings/transcribe-summary",
            data={
                "meeting_title": "format test"
            },
            files={
                "audio_file": (
                    "test_audio.m4a",
                    audio_file,
                    "audio/m4a",
                )
            },
        )

    data = response.json()

    assert "summary" in data
    assert "##" in data["summary"]

@pytest.mark.integration
def test_transcript_correction():
    audio_path = (
        Path(__file__).parent
        / "sample_audio"
        / "test_audio.m4a"
    )

    with open(audio_path, "rb") as audio_file:
        response = client.post(
            "/meetings/transcribe-summary",
            data={
                "meeting_title": "transcript test"
            },
            files={
                "audio_file": (
                    "test_audio.m4a",
                    audio_file,
                    "audio/m4a",
                )
            },
        )

    data = response.json()

    assert data["transcript"] != ""
    assert data["timeline_transcript"] != ""
    assert len(data["segments"]) > 0