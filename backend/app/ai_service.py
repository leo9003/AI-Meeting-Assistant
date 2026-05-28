from dotenv import load_dotenv

from app.services.summary_service import generate_meeting_summary
from app.services.transcription_service import transcribe_audio_with_timeline


load_dotenv()


def process_meeting_audio(audio_file_path: str) -> dict:
    """
    Full meeting AI pipeline orchestrator.
    Step 1: Transcription service transcribes audio and identifies speakers.
    Step 2: Transcript cleanup service cleans transcript quality inside transcription flow.
    Step 3: Summary service generates structured meeting notes.
    """
    transcription_result = transcribe_audio_with_timeline(audio_file_path)
    timeline_transcript = transcription_result["timeline_transcript"]

    if transcription_result["speaker_count"] == 0 or not timeline_transcript.strip():
        summary = "無法產生摘要，因為語音轉文字沒有取得有效逐字稿。"
    else:
        summary = generate_meeting_summary(
            transcription_result["transcript"]
        )

    return {
        "speaker_count": transcription_result["speaker_count"],
        "transcript": transcription_result["transcript"],
        "timeline_transcript": timeline_transcript,
        "segments": transcription_result["segments"],
        "total_segments": transcription_result.get(
            "total_segments",
            len(transcription_result["segments"])
        ),
        "summary": summary
    }
