# UI Flow

## Full UI Design

![UI Flow](image/finalUI.jpg)

## Overview

AI Meeting Assistant is a mobile-first AI meeting application that helps users record meetings, generate transcripts, summarize discussions, and save meeting history automatically.

This document defines the MVP user flow.

---

# MVP User Flow

```text
Launch App
    ↓
Home Dashboard
    ↓
New Meeting
 ┌───────────────┐
 ↓               ↓
Record Audio   Upload Audio
 ↓               ↓
Recording      Audio Preview
 └───────↓───────┘
        Processing
              ↓
        Meeting Result
    ┌─────┬─────┬─────┐
    ↓     ↓     ↓     ↓
Overview Transcript Summary Action Items
              ↓
        Save Meeting
              ↓
        Meeting History
              ↓
        Meeting Detail
```

---

# Screens

## 1. Home Dashboard

Purpose:
- Entry point of the application
- Access recent meetings
- Start a new meeting

Features:
- Recent meetings list
- Search meeting history
- New Meeting button

---

## 2. New Meeting

Purpose:
- Create a new meeting session

User Inputs:
- Meeting title (optional)
- Language selection

Options:
- Record Audio
- Upload Audio File

Supported Formats:
- MP3
- WAV
- M4A

---

## 3. Recording Screen

Purpose:
- Record meeting audio

Functions:
- Live recording timer
- Pause recording
- Resume recording
- Stop recording
- Audio waveform (future version)

---

## 4. Upload Audio

Purpose:
- Upload existing meeting audio

Flow:

Select Audio
    ↓
Audio Preview
    ↓
Confirm Upload

---

## 5. Processing Screen

Purpose:
- Process audio automatically

Pipeline:

1. Upload Audio
2. Speech-to-Text Transcription
3. Transcript Cleanup
4. AI Summary Generation
5. Action Item Extraction

Agent Architecture:

### Transcription Agent
Responsible for:
- Speech-to-text
- Speaker diarization
- Timestamp generation

### Meeting Analysis Agent
Responsible for:
- Meeting summary
- Key points
- Decisions
- Action items
- Open questions

Status:
- Uploading
- Transcribing
- Summarizing
- Finalizing

---

## 6. Meeting Result

### Overview
Shows:
- Meeting title
- Recording duration
- Key discussion
- Key decisions
- Next steps

### Transcript
Shows:
- Full transcript
- Timestamped conversation
- Speaker separation (future version)

### Summary
Shows:
- AI-generated meeting summary
- Main discussion points

### Action Items
Shows:
- Automatically extracted tasks
- Follow-up items

Actions:
- Save Meeting
- Export (future version)

---

## 7. Meeting History

Purpose:
- View previous meetings

Functions:
- Search meetings
- Open meeting result
- Delete meeting

---

## 8. Meeting Detail

Purpose:
- Re-open saved meeting

Tabs:
- Overview
- Transcript
- Summary
- Action Items

---

# Future Scope (Post-MVP)

Planned Features:
- Login / Authentication
- Google / Apple Sign-In
- AI Model Selection
- PDF / Markdown Export
- Speaker Diarization
- Multi-language Support
- Team Collaboration
- Cloud Sync
