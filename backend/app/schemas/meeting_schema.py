from pydantic import BaseModel


class TranscriptRequest(BaseModel):
    meeting_title: str
    transcript: str


class SummaryResponse(BaseModel):
    meeting_title: str
    summary: str


class TimelineSegment(BaseModel):
    start: str
    end: str
    speaker: str
    text: str


class TranscribeResponse(BaseModel):
    meeting_id: str
    meeting_title: str
    status: str
    created_at: str
    speaker_count: int
    transcript: str
    timeline_transcript: str
    segments: list[TimelineSegment]


class TranscribeSummaryResponse(BaseModel):
    meeting_id: str
    meeting_title: str
    status: str
    created_at: str
    speaker_count: int
    transcript: str
    timeline_transcript: str
    segments: list[TimelineSegment]
    summary: str