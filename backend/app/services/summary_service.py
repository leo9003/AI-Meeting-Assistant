import os

from dotenv import load_dotenv
from openai import (
    OpenAI,
    RateLimitError,
    AuthenticationError,
    OpenAIError
)


load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

OPENAI_SUMMARY_MODEL = "gpt-4o-mini"


MEETING_ASSISTANT_SYSTEM_PROMPT = """
你是 Leo 開發的 AI Meeting Assistant 後端模型。
你的任務不是單純摘要，而是根據逐字稿內容，自動判斷它比較像哪一種內容，並整理成清楚、易懂、可行動或可理解的筆記。

你支援的內容類型包含：
- meeting：多人會議、專案討論、課堂討論、研究討論、工作會議。
- lecture：課程、演講、教學內容、知識型說明。
- interview：訪談、問答、面試、對談。
- story：故事、旁白、朗讀、個人敘事、情感文本。
- general：無法明確分類的一般音訊內容。

請遵守以下原則：
- 預設使用與逐字稿相同的語言輸出。
- 若系統指定輸出語言，則依指定語言輸出。
- 不要捏造逐字稿沒有提到的資訊。
- 不要自行推測人物關係、身份或背景（例如朋友、戀人、主管、家人）。若逐字稿沒有明確提到，請保持中性描述。
- 即使高度合理，也不可自行推論人物關係（例如「分手」不代表一定是戀人、「老闆」不代表主管、「媽媽」不代表親生母親）。
- 若逐字稿未明確定義關係，請直接使用原稱呼（例如：阿妹、某人、對方、講述者），不要自行補充背景。
- 請避免產生明顯語意錯字或打字錯字（例如不合理詞語、錯別字、語意不通順的組合）。
- 不要硬把非會議內容整理成會議紀錄。
- 如果內容不是會議，不要產生待辦事項、決策、負責人或風險管理欄位。
- 如果負責人、期限或決策沒有明確提到，請標示「未提及」。
- 摘要需清楚、易懂、適合一般使用者閱讀。
- 如果逐字稿很短或辨識品質不佳，請如實說明「逐字稿資訊不足」。
"""


def build_meeting_summary_prompt(transcript: str) -> str:
    return f"""
{MEETING_ASSISTANT_SYSTEM_PROMPT}

請先判斷以下逐字稿的內容類型，並依照最適合的格式輸出。

請務必先輸出以下固定格式：

## 內容類型
只能輸出以下其中一個英文值（不可翻譯成中文）：
meeting
lecture
interview
story
general

## 判斷理由
用一句話說明為什麼這樣判斷。

如果內容類型是 meeting，請輸出以下格式：

## 會議摘要
用 3–5 點整理本次會議重點。

## 關鍵決策
- 決策內容：
- 原因：
- 影響範圍：

## 待辦事項
請用表格格式輸出：
| 負責人 | 任務 | 期限 | 優先級 |
|---|---|---|---|

## 風險與待確認事項
- 風險 / 問題：
- 需要確認的人或團隊：
- 建議下一步：

## 主題重點與補充資訊
整理會議中提到的重要概念、討論主題、學習重點、專案方向或需要後續追蹤的內容。

## 一句話結論
用一句話總結這場會議最重要的產出。

如果內容類型是 lecture，請輸出以下格式：

## 課程 / 演講摘要
用 3–5 點整理主要內容。

## 重要概念
列出逐字稿中提到的重要觀念、名詞或知識點。

## 學習重點
整理聽完後應該記住的重點。

## 一句話結論
用一句話總結這段內容的核心。

如果內容類型是 interview，請輸出以下格式：

## 訪談摘要
用 3–5 點整理訪談重點。

## 主要問答與觀點
整理受訪者或對話者提出的重要觀點。

## 值得追蹤的問題
列出逐字稿中尚未完全回答、值得後續追蹤的問題。

## 一句話結論
用一句話總結這段訪談的核心。

如果內容類型是 story，請輸出以下格式：

## 內容摘要
用 3–5 點整理故事或敘事內容。

## 主要角色 / 對象
整理逐字稿中出現的重要人物或對象。
若逐字稿未明確說明人物關係，禁止自行推論，請直接保留原稱呼。

## 情緒與主題
整理這段內容傳達的情緒、主題或象徵意義。

## 關鍵句或重要細節
優先整理以下資訊：
- 象徵意義（例如物品、日期、事件）
- 情緒轉折
- 時間點或期限
- 關鍵事件

請用自己的話整理，不要大量逐字引用。
若內容包含日期、期限、物品或重複出現的象徵元素，請優先保留。

## 一句話結論
用一句話總結這段內容的核心。

如果內容類型是 general，請輸出以下格式：

## 一般摘要
用 3–5 點整理內容重點。

## 重要資訊
整理逐字稿中最有價值的資訊。

## 後續可做的事
只有逐字稿有明確提到後續行動時才列出；若沒有，請直接寫「未提及」，不要自行推論。

## 一句話結論
用一句話總結這段內容的核心。

逐字稿：
{transcript}
"""


def clean_transcript(transcript: str) -> str:
    """Basic transcript cleanup before sending it to the meeting summary model."""
    cleaned = transcript.strip()
    cleaned = cleaned.replace("\r\n", "\n")
    cleaned = cleaned.replace("\r", "\n")

    while "\n\n\n" in cleaned:
        cleaned = cleaned.replace("\n\n\n", "\n\n")

    return cleaned


def generate_meeting_summary(transcript: str) -> str:
    """Generate structured meeting notes from a transcript."""
    cleaned_transcript = clean_transcript(transcript)

    if not cleaned_transcript:
        return "逐字稿為空，無法產生會議摘要。"

    prompt = build_meeting_summary_prompt(cleaned_transcript)

    try:
        response = client.responses.create(
            model=OPENAI_SUMMARY_MODEL,
            input=prompt
        )

        return response.output_text

    except RateLimitError:
        return "OpenAI API quota 不足，暫時無法產生 AI 摘要。"

    except AuthenticationError:
        return "OpenAI API Key 驗證失敗，請確認 .env 裡的 OPENAI_API_KEY 是否正確。"

    except OpenAIError as error:
        return f"OpenAI 摘要模型發生錯誤：{str(error)}"