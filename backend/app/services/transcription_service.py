import os
import time

import requests
from dotenv import load_dotenv

from app.services.transcript_cleanup_service import (
    postprocess_transcript_segments,
    remove_speaker_label_from_text,
)


load_dotenv()

ASSEMBLYAI_API_KEY = os.getenv("ASSEMBLYAI_API_KEY")

ASSEMBLYAI_SPEECH_MODEL = "universal-2"


def build_assemblyai_transcript_request(upload_url: str) -> dict:
    """Build AssemblyAI transcription request payload."""
    return {
        "audio_url": upload_url,
        "speech_models": [ASSEMBLYAI_SPEECH_MODEL],
        "speaker_labels": True,
        "language_detection": True
    }


def format_seconds_to_timestamp(seconds: float) -> str:
    """Convert seconds to MM:SS format."""
    seconds = int(seconds)
    minutes = seconds // 60
    remaining_seconds = seconds % 60
    return f"{minutes:02d}:{remaining_seconds:02d}"


def format_milliseconds_to_timestamp(milliseconds: int) -> str:
    """Convert milliseconds to MM:SS format."""
    seconds = milliseconds / 1000
    return format_seconds_to_timestamp(seconds)


def clean_chinese_spacing(text: str) -> str:
    """Clean unnecessary spacing between Chinese characters while preserving English spacing."""
    import re

    cleaned_text = re.sub(r'(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])', '', text)
    cleaned_text = re.sub(r'\s+', ' ', cleaned_text)
    return cleaned_text.strip()


def upload_audio_to_assemblyai(audio_file_path: str) -> str:
    """Upload local audio file to AssemblyAI and return upload URL."""
    if not ASSEMBLYAI_API_KEY:
        raise RuntimeError("ASSEMBLYAI_API_KEY is not set in .env")

    headers = {
        "authorization": ASSEMBLYAI_API_KEY
    }

    with open(audio_file_path, "rb") as audio_file:
        response = requests.post(
            "https://api.assemblyai.com/v2/upload",
            headers=headers,
            data=audio_file,
            timeout=300
        )

    response.raise_for_status()
    return response.json()["upload_url"]


def create_assemblyai_transcript(upload_url: str) -> str:
    """Create an AssemblyAI transcript job and return transcript id."""
    headers = {
        "authorization": ASSEMBLYAI_API_KEY,
        "content-type": "application/json"
    }

    transcript_request = build_assemblyai_transcript_request(upload_url)

    response = requests.post(
        "https://api.assemblyai.com/v2/transcript",
        json=transcript_request,
        headers=headers,
        timeout=60
    )

    response.raise_for_status()
    return response.json()["id"]


def poll_assemblyai_transcript(transcript_id: str) -> dict:
    """Poll AssemblyAI transcript job until completed or failed."""
    headers = {
        "authorization": ASSEMBLYAI_API_KEY
    }

    polling_endpoint = f"https://api.assemblyai.com/v2/transcript/{transcript_id}"

    while True:
        response = requests.get(
            polling_endpoint,
            headers=headers,
            timeout=60
        )
        response.raise_for_status()

        transcript = response.json()
        status = transcript.get("status")

        if status == "completed":
            return transcript

        if status == "error":
            raise RuntimeError(
                transcript.get("error", "AssemblyAI transcription failed")
            )

        time.sleep(3)


def build_segments_from_assemblyai(transcript: dict) -> list[dict]:
    """Build internal transcript segments from AssemblyAI utterances."""
    segments = []
    speaker_label_map = {}

    for utterance in transcript.get("utterances") or []:
        raw_speaker = str(utterance.get("speaker", "1"))

        if raw_speaker not in speaker_label_map:
            speaker_label_map[raw_speaker] = f"Speaker {len(speaker_label_map) + 1}"

        speaker = speaker_label_map[raw_speaker]

        start_ms = utterance.get("start") or 0
        end_ms = utterance.get("end") or 0

        raw_text = clean_chinese_spacing(
            (utterance.get("text") or "").strip()
        )

        segments.append({
            "start": format_milliseconds_to_timestamp(start_ms),
            "end": format_milliseconds_to_timestamp(end_ms),
            "speaker": speaker,
            "text": raw_text
        })

    if not segments and transcript.get("text"):
        cleaned_text = clean_chinese_spacing(
            (transcript.get("text") or "").strip()
        )

        audio_duration_seconds = transcript.get("audio_duration") or 0

        segments.append({
            "start": "00:00",
            "end": format_seconds_to_timestamp(audio_duration_seconds),
            "speaker": "Speaker 1",
            "text": cleaned_text
        })

    return segments


def build_transcript_output(cleaned_segments: list[dict]) -> dict:
    """Build plain transcript, timeline transcript, and speaker count."""
    speaker_count = (
        len(set(item["speaker"] for item in cleaned_segments))
        if cleaned_segments
        else 0
    )

    plain_transcript = "\n".join(
        remove_speaker_label_from_text(item["text"])
        for item in cleaned_segments
    )

    timeline_transcript = "\n".join(
        f"[{item['start']} - {item['end']}] {item['speaker']}: {remove_speaker_label_from_text(item['text'])}"
        for item in cleaned_segments
    )

    return {
        "speaker_count": speaker_count,
        "transcript": plain_transcript,
        "timeline_transcript": timeline_transcript,
        "segments": cleaned_segments,
        "total_segments": len(cleaned_segments)
    }


def transcribe_audio_with_assemblyai(audio_file_path: str) -> dict:
    """
    Fast transcription pipeline.
    AssemblyAI handles transcription, speaker diarization, and timestamps.
    GPT batch-cleans transcript quality after transcription.
    """
    try:
        upload_url = upload_audio_to_assemblyai(audio_file_path)
        transcript_id = create_assemblyai_transcript(upload_url)
        transcript = poll_assemblyai_transcript(transcript_id)

        raw_segments = build_segments_from_assemblyai(transcript)
        cleaned_segments = postprocess_transcript_segments(raw_segments)

        return build_transcript_output(cleaned_segments)

    except Exception as error:
        error_message = f"AssemblyAI 語音轉文字發生錯誤：{str(error)}"

        return {
            "speaker_count": 0,
            "transcript": error_message,
            "timeline_transcript": error_message,
            "segments": [],
            "total_segments": 0
        }


def transcribe_audio_with_timeline(audio_file_path: str) -> dict:
    """
    Current version uses AssemblyAI cloud transcription with speaker diarization
    and GPT transcript cleanup.
    """
    return transcribe_audio_with_assemblyai(audio_file_path)