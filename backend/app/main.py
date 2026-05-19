from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app.database import create_database_tables
from app.models.meeting_model import Meeting  # noqa: F401
from app.routers.meetings import router as meetings_router


app = FastAPI(
    title="AI Meeting Assistant API",
    description="""
AI Meeting Assistant Backend Service

Features:
- Audio transcription
- Speaker diarization
- GPT transcript cleanup
- Adaptive AI summary
- PostgreSQL meeting history
""",
    version="1.0.0",
    contact={
        "name": "Leo Chen",
    },
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)



@app.on_event("startup")
def startup():
    create_database_tables()


app.include_router(meetings_router)


@app.get("/", response_class=HTMLResponse)
def home():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>AI Meeting Assistant</title>
        <style>
            body {
                background: #0f172a;
                color: white;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
            }

            .container {
                text-align: center;
                max-width: 700px;
                padding: 40px;
            }

            h1 {
                font-size: 56px;
                margin-bottom: 10px;
            }

            p {
                color: #94a3b8;
                font-size: 18px;
                margin-bottom: 40px;
            }

            .status {
                display: inline-block;
                background: rgba(34,197,94,0.15);
                color: #4ade80;
                padding: 10px 18px;
                border-radius: 999px;
                margin-bottom: 40px;
                font-weight: 600;
            }

            .card-container {
                display: flex;
                gap: 20px;
                justify-content: center;
                flex-wrap: wrap;
            }

            .card {
                background: #1e293b;
                border-radius: 24px;
                padding: 24px;
                width: 260px;
                text-align: left;
                transition: 0.2s;
                text-decoration: none;
                color: white;
            }

            .card:hover {
                transform: translateY(-4px);
                background: #334155;
            }

            .card h3 {
                margin-top: 0;
            }

            .footer {
                margin-top: 40px;
                color: #64748b;
                font-size: 14px;
            }
        </style>
    </head>

    <body>
        <div class="container">

            <h1>🎙️ AI Meeting Assistant</h1>

            <div class="status">
                ● Backend Running
            </div>

            <p>
                AI-powered meeting transcription, speaker diarization,
                transcript cleanup and adaptive summarization.
            </p>

            <div class="card-container">

                <a class="card" href="/docs">
                    <h3>📘 API Docs</h3>
                    <p>
                        Swagger API documentation
                        for testing backend endpoints.
                    </p>
                </a>

                <a class="card" href="/meetings/view">
                    <h3>🗂 Meeting History</h3>
                    <p>
                        View saved meeting metadata
                        stored in PostgreSQL.
                    </p>
                </a>

            </div>

            <div class="footer">
                AI Meeting Assistant Backend v1.0
            </div>

        </div>
    </body>
    </html>
    """