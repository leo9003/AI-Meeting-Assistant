import os

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

OPENAI_TRANSCRIPT_CLEANUP_MODEL = "gpt-4o-mini"
TRANSCRIPT_CLEANUP_CHUNK_SIZE = 40


def remove_speaker_label_from_text(text: str) -> str:
    """Remove duplicated speaker labels that may be returned by GPT cleanup."""
    import re

    cleaned_text = re.sub(
        r'^\s*\[?Speaker\s*\d+\]?\s*[:：-]?\s*',
        '',
        text.strip(),
        flags=re.IGNORECASE
    )

    return cleaned_text.strip()


def normalize_text_for_similarity(text: str) -> str:
    """Normalize transcript text before similarity comparison."""
    import re

    normalized = remove_speaker_label_from_text(text)
    normalized = re.sub(r'\s+', '', normalized)
    normalized = re.sub(r'[，。！？、,.!?\s]', '', normalized)
    return normalized.lower()


def text_similarity(text_a: str, text_b: str) -> float:
    """Calculate rough text similarity for duplicate detection."""
    from difflib import SequenceMatcher

    normalized_a = normalize_text_for_similarity(text_a)
    normalized_b = normalize_text_for_similarity(text_b)

    if not normalized_a or not normalized_b:
        return 0.0

    return SequenceMatcher(None, normalized_a, normalized_b).ratio()


def remove_duplicate_segments(
    segments: list[dict],
    similarity_threshold: float = 0.88
) -> list[dict]:
    """Remove adjacent duplicate or near-duplicate transcript segments."""
    if not segments:
        return []

    deduped_segments = []
    recent_window_size = 5

    for segment in segments:
        current_text = normalize_text_for_similarity(segment["text"])

        if not current_text:
            continue

        if not deduped_segments:
            deduped_segments.append(segment)
            continue

        recent_segments = deduped_segments[-recent_window_size:]
        is_duplicate = False

        for previous_segment in recent_segments:
            previous_text = normalize_text_for_similarity(
                previous_segment["text"]
            )

            similarity = text_similarity(
                previous_segment["text"],
                segment["text"]
            )

            is_contained_duplicate = (
                previous_text
                and current_text
                and (
                    current_text in previous_text
                    or previous_text in current_text
                )
                and min(len(previous_text), len(current_text)) >= 20
            )

            if similarity >= similarity_threshold or is_contained_duplicate:
                is_duplicate = True
                break

        if not is_duplicate:
            deduped_segments.append(segment)

    return deduped_segments


def chunk_segments(segments: list[dict], chunk_size: int = 40) -> list[list[dict]]:
    """Split transcript segments into smaller chunks for GPT cleanup."""
    return [
        segments[index:index + chunk_size]
        for index in range(0, len(segments), chunk_size)
    ]


def polish_transcript_segments_with_gpt(segments: list[dict]) -> list[dict]:
    """
    Use GPT to batch-clean transcript quality for all segments.
    Each segment is a dict with keys: start, end, speaker, text.
    Returns a new list of segments with cleaned text.
    """
    if not segments:
        return []

    try:
        prompt_lines = []

        for i, seg in enumerate(segments):
            prompt_lines.append(
                f"[{i}] {seg['text']}"
            )

        prompt = (
            "你是一個逐字稿修正助手。\n\n"
            "請修正以下逐字稿，但必須遵守：\n"
            "1. 修正明顯錯字、空格、標點與 STT 語音辨識錯誤。\n"
            "2. 可依據上下文修正常見同音錯字、常見專有名詞、中英文混用詞與明顯不合理詞彙。\n"
            "3. 若不確定，保留原文，不要過度猜測。\n"
            "4. 保留原本意思，不可新增不存在的資訊。\n"
            "5. 不要改寫成正式文章。\n"
            "6. 保留原本說話風格與語氣。\n"
            "7. 中文請使用繁體中文。\n"
            "8. 刪除明顯重複的 filler words，例如：就是、嗯、對對對、然後（若連續重複太多）。\n"
            "9. 不要加入 Speaker 標籤，也不要輸出 [Speaker 1]、[Speaker 2] 這類文字。\n"
            "10. 必須保留每行前面的 [index]，但 [index] 後面只能接修正後內容。\n"
            "11. 不要輸出任何說明。\n"
            "12. 直接輸出修正後逐字稿。\n\n"
            "格式範例：\n"
            "[0] 修正後內容\n"
            "[1] 修正後內容\n\n"
            "逐字稿：\n" +
            "\n".join(prompt_lines)
        )

        response = client.chat.completions.create(
            model=OPENAI_TRANSCRIPT_CLEANUP_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "你是逐字稿清理助手，請根據指示修正逐字稿。"
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            max_tokens=12000,
            temperature=0.2,
        )

        cleaned_text = response.choices[0].message.content.strip()
        cleaned_map = {}

        for line in cleaned_text.splitlines():
            line = line.strip()

            if not line.startswith("["):
                continue

            try:
                index_part, text_part = line.split("]", 1)
                idx = int(index_part.replace("[", "").strip())
                cleaned_map[idx] = remove_speaker_label_from_text(
                    text_part.strip()
                )
            except Exception:
                continue

        cleaned_segments = []

        for idx, segment in enumerate(segments):
            cleaned_segment = dict(segment)

            if idx in cleaned_map and cleaned_map[idx]:
                cleaned_segment["text"] = cleaned_map[idx]

            cleaned_segments.append(cleaned_segment)

        return cleaned_segments

    except Exception as error:
        print(f"GPT transcript cleanup failed: {error}")
        return segments


def polish_transcript_segments_in_chunks(
    segments: list[dict],
    chunk_size: int = 40
) -> list[dict]:
    """Clean transcript segments in chunks to improve quality on long meetings."""
    cleaned_segments = []

    for chunk in chunk_segments(segments, chunk_size=chunk_size):
        cleaned_segments.extend(
            polish_transcript_segments_with_gpt(chunk)
        )

    return cleaned_segments


def timestamp_to_seconds(timestamp: str) -> int:
    """Convert MM:SS timestamp to seconds."""
    minutes, seconds = timestamp.split(":")
    return int(minutes) * 60 + int(seconds)


def merge_short_same_speaker_segments(
    segments: list[dict],
    max_gap_seconds: int = 2,
    max_text_length: int = 40
) -> list[dict]:
    """Merge short adjacent segments from the same speaker for readability."""
    if not segments:
        return []

    merged_segments = []

    for segment in segments:
        current_text = remove_speaker_label_from_text(segment["text"]).strip()

        if not current_text:
            continue

        current_segment = dict(segment)
        current_segment["text"] = current_text

        if not merged_segments:
            merged_segments.append(current_segment)
            continue

        previous_segment = merged_segments[-1]

        previous_end = timestamp_to_seconds(previous_segment["end"])
        current_start = timestamp_to_seconds(current_segment["start"])
        gap = current_start - previous_end

        should_merge = (
            previous_segment["speaker"] == current_segment["speaker"]
            and gap <= max_gap_seconds
            and (
                len(previous_segment["text"]) <= max_text_length
                or len(current_segment["text"]) <= max_text_length
            )
        )

        if should_merge:
            previous_segment["end"] = current_segment["end"]
            previous_segment["text"] = (
                previous_segment["text"].rstrip()
                + " "
                + current_segment["text"].lstrip()
            ).strip()
        else:
            merged_segments.append(current_segment)

    return merged_segments


def postprocess_transcript_segments(segments: list[dict]) -> list[dict]:
    """
    Run transcript post-processing pipeline.
    Step 1: remove duplicate segments.
    Step 2: clean transcript text in GPT chunks.
    Step 3: merge short adjacent same-speaker segments.
    """
    deduped_segments = remove_duplicate_segments(segments)

    cleaned_segments = polish_transcript_segments_in_chunks(
        deduped_segments,
        chunk_size=TRANSCRIPT_CLEANUP_CHUNK_SIZE
    )

    return merge_short_same_speaker_segments(cleaned_segments)