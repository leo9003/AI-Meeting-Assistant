from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# =========================
# 1. Health Check
# =========================
def test_health_check():
    response = client.get("/")

    assert response.status_code == 200


# =========================
# 2. Get Meeting List
# =========================
def test_get_meetings():
    response = client.get("/meetings")

    assert response.status_code == 200


# =========================
# 3. Transcribe without file
# =========================
def test_transcribe_without_file():
    response = client.post("/meetings/transcribe")

    assert response.status_code in [400, 422]


# =========================
# 4. Transcribe with empty audio file
# =========================
def test_transcribe_with_empty_audio_file():
    response = client.post(
        "/meetings/transcribe",
        files={
            "audio_file": (
                "empty.mp3",
                b"",
                "audio/mpeg",
            )
        },
    )

    # 空音檔應被正確擋下
    assert response.status_code in [400, 422]


# =========================
# 5. Summary without transcript
# =========================
def test_summary_without_transcript():
    response = client.post(
        "/meetings/summary",
        json={},
    )

    assert response.status_code in [400, 422]


# =========================
# 6. Transcribe-summary without file
# =========================
def test_transcribe_summary_without_file():
    response = client.post(
        "/meetings/transcribe-summary"
    )

    assert response.status_code in [400, 422]


# =========================
# 7. Transcribe with Mock AI
# =========================
@patch("app.routers.meetings.transcribe_audio_with_timeline")
def test_transcribe_with_mock_ai(
    mock_transcribe,
):
    mock_transcribe.return_value = {
        "speaker_count": 2,
        "transcript": "Speaker 1: Hello. Speaker 2: Hi.",
        "timeline_transcript":
            "[00:00] Speaker 1: Hello.\n"
            "[00:01] Speaker 2: Hi.",
        "segments": [
            {
                "speaker": "Speaker 1",
                "start": "00:00",
                "end": "00:01",
                "text": "Hello.",
            }
        ],
    }

    response = client.post(
        "/meetings/transcribe",
        data={
            "meeting_title": "Mock Meeting"
        },
        files={
            "audio_file": (
                "test.mp3",
                b"fake audio content",
                "audio/mpeg",
            )
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert data["meeting_title"] == "Mock Meeting"
    assert data["speaker_count"] == 2
    assert "transcript" in data
    assert "segments" in data


# =========================
# 8. Summary with Mock AI
# =========================
@patch("app.routers.meetings.generate_meeting_summary")
def test_summary_with_mock_ai(
    mock_summary,
):
    mock_summary.return_value = (
        "這是一段 mock 摘要"
    )

    response = client.post(
        "/meetings/summary",
        json={
            "meeting_title":
                "Mock Summary",
            "transcript":
                "今天討論 AI Meeting Assistant 專案。",
        },
    )

    assert response.status_code == 200

    data = response.json()

    assert (
        data["meeting_title"]
        == "Mock Summary"
    )

    assert (
        data["summary"]
        == "這是一段 mock 摘要"
    )


# =========================
# 9. Get invalid meeting detail
# =========================
def test_get_invalid_meeting_detail():
    invalid_meeting_id = 999999

    response = client.get(
        f"/meetings/{invalid_meeting_id}"
    )

    # 應正確處理不存在的 meeting
    assert response.status_code == 404

    data = response.json()

    # 確認有錯誤訊息
    assert "detail" in data