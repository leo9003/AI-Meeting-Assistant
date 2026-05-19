import { useEffect, useRef, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [processingStep, setProcessingStep] = useState("idle");
  const [audioUrl, setAudioUrl] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const secondsRef = useRef(0);

  useEffect(() => {
    loadHistory();
    return () => clearInterval(timerRef.current);
  }, []);

  async function loadHistory() {
    try {
      const res = await fetch(`${API_BASE_URL}/meetings`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setHistory(data);
      } else if (Array.isArray(data.meetings)) {
        setHistory(data.meetings);
      } else if (Array.isArray(data.items)) {
        setHistory(data.items);
      } else {
        setHistory([]);
      }
    } catch {
      // ignore
    }
  }

  async function startRecording() {
    try {
      setError("");
      setResult(null);
      setAudioUrl("");
      chunksRef.current = [];
      secondsRef.current = 0;
      setRecordingSeconds(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        clearInterval(timerRef.current);
        stream.getTracks().forEach((track) => track.stop());

        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/mp4",
        });

        const localUrl = URL.createObjectURL(blob);
        setAudioUrl(localUrl);

        await processAudio(blob, mimeType);
      };

      recorder.start();
      setScreen("recording");

      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setRecordingSeconds(secondsRef.current);
      }, 1000);
    } catch (err) {
      console.error(err);
      setError("麥克風授權失敗，請允許瀏覽器使用麥克風。");
    }
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      setScreen("processing");
      setProcessingStep("uploading");
      recorderRef.current.stop();
    }
  }

  async function processAudio(blob, mimeType) {
    try {
      const safeMimeType = mimeType || blob.type || "audio/mp4";
      const ext = safeMimeType.includes("webm") ? "webm" : "m4a";
      const fileName = `meeting-${Date.now()}.${ext}`;
      const meetingTitle = `Meeting ${new Date().toLocaleString()}`;

      setProcessingStep("transcribing");

      const formData = new FormData();
      formData.append("meeting_title", meetingTitle);
      formData.append("audio_file", blob, fileName);

      const res = await fetch(`${API_BASE_URL}/meetings/transcribe-summary`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Backend error: ${res.status}`);
      }

      setProcessingStep("summarizing");

      const data = await res.json();
      console.log("AI result from backend:", data);

      setResult(data);
      setProcessingStep("done");
      setScreen("summary");
      loadHistory();
    } catch (err) {
      console.error(err);
      const message = err.message || "Unknown error";
      const friendlyMessage =
        message === "Load failed" || message === "Failed to fetch"
          ? "前端連不到後端，通常是 CORS 或 Render 後端冷啟動。請等 Render 醒來後再試一次。"
          : message;
      setError(`AI 處理失敗：${friendlyMessage}`);
      setScreen("summary");
    }
  }

  async function openHistoryItem(item) {
    try {
      const id = item.id || item.meeting_id || item.meetingId;
      const res = await fetch(`${API_BASE_URL}/meetings/${id}`);
      const data = await res.json();
      setResult(data);
      setScreen("summary");
    } catch {
      setResult(item);
      setScreen("summary");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.appFrame}>
        <div style={styles.contentArea}>
          {screen === "home" && <Home onStart={startRecording} error={error} />}
          {screen === "recording" && (
            <Recording seconds={recordingSeconds} onStop={stopRecording} />
          )}
          {screen === "processing" && <Processing step={processingStep} />}
          {screen === "summary" && (
            <Summary
              result={result}
              audioUrl={audioUrl}
              error={error}
              onSave={() => setScreen("saved")}
              onBack={() => setScreen("home")}
            />
          )}
          {screen === "saved" && <Saved onHistory={() => setScreen("history")} />}
          {screen === "history" && (
            <History history={history} onOpen={openHistoryItem} />
          )}
        </div>

        <BottomNav screen={screen} setScreen={setScreen} />
      </div>
    </div>
  );
}

function Home({ onStart, error }) {
  return (
    <main style={styles.center}>
      <Menu />
      <h1 style={styles.title}>AI Meeting Assistant</h1>
      <p style={styles.subtitle}>
        Record, transcribe, and summarize your meetings with AI.
      </p>
      {error && <p style={styles.error}>{error}</p>}
      <button style={styles.blackButton} onClick={onStart}>
        🎙 Start Recording
      </button>
    </main>
  );
}

function Recording({ seconds, onStop }) {
  return (
    <main style={styles.center}>
      <Menu />
      <h2 style={styles.heading}>Recording...</h2>
      <Wave />
      <div style={styles.timer}>{formatTime(seconds)}</div>
      <button style={styles.stopButton} onClick={onStop}>
        ■
      </button>
    </main>
  );
}

function Processing({ step }) {
  return (
    <main style={styles.center}>
      <Menu />
      <h2 style={styles.heading}>Processing your meeting...</h2>
      <div style={styles.loader} />
      <div style={styles.steps}>
        <Step done={step !== "uploading"} active={step === "uploading"}>
          Uploading audio
        </Step>
        <Step done={step === "summarizing" || step === "done"} active={step === "transcribing"}>
          Transcribing
        </Step>
        <Step done={step === "done"} active={step === "summarizing"}>
          Generating summary
        </Step>
      </div>
    </main>
  );
}

function Summary({ result, audioUrl, error, onSave, onBack }) {
  const transcript =
    result?.timeline_transcript ||
    result?.timelineTranscript ||
    result?.transcript ||
    result?.text ||
    "";

  const summaryValue = result?.summary || result?.ai_summary || result?.meeting_summary || "";
  const summary =
    typeof summaryValue === "string"
      ? summaryValue
      : summaryValue?.summary || summaryValue?.overview || "";

  return (
    <main style={styles.scroll}>
      <div style={styles.topBar}>
        <button style={styles.back} onClick={onBack}>‹</button>
        <h2 style={styles.topBarTitle}>Meeting Summary</h2>
        <span style={styles.topBarSpacer} />
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {audioUrl && (
        <Card title="Audio Playback">
          <audio controls src={audioUrl} style={{ width: "100%" }} />
        </Card>
      )}

      <Card title="Summary">
        {summary ? (
          <pre style={styles.text}>{summary}</pre>
        ) : (
          <p style={styles.muted}>尚未產生摘要。</p>
        )}
      </Card>

      <Card title="Transcript">
        {transcript ? (
          <pre style={styles.text}>{transcript}</pre>
        ) : (
          <p style={styles.muted}>尚未產生逐字稿。</p>
        )}
      </Card>

      <button style={styles.blackButtonWide} onClick={onSave}>
        Save Meeting
      </button>
    </main>
  );
}

function Saved({ onHistory }) {
  return (
    <main style={styles.center}>
      <div style={styles.check}>✓</div>
      <h2 style={styles.heading}>Meeting Saved!</h2>
      <p style={styles.subtitle}>You can view it in History.</p>
      <button style={styles.blackButton} onClick={onHistory}>
        Go to History
      </button>
    </main>
  );
}

function History({ history, onOpen }) {
  return (
    <main style={styles.scroll}>
      <Menu />
      <h2 style={styles.heading}>History</h2>

      {history.length === 0 && <p style={styles.muted}>No meetings yet.</p>}

      {history.map((item) => (
        <button
          key={item.id || item.meeting_id || item.meetingId}
          style={styles.historyItem}
          onClick={() => onOpen(item)}
        >
          <div>
            <strong>{item.meeting_title || item.meetingTitle || item.title || "Untitled Meeting"}</strong>
            <p style={styles.small}>
              {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
            </p>
          </div>
          <span>›</span>
        </button>
      ))}
    </main>
  );
}

function Card({ title, children }) {
  return (
    <section style={styles.card}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Step({ children, done, active }) {
  return (
    <p style={styles.step}>
      <span>{done ? "✓" : active ? "◌" : "○"}</span> {children}
    </p>
  );
}

function Menu() {
  return <button style={styles.menu}>☰</button>;
}

function Wave() {
  return (
    <div style={styles.wave}>
      {Array.from({ length: 26 }).map((_, i) => (
        <span
          key={i}
          style={{
            ...styles.bar,
            height: `${18 + (i % 7) * 8}px`,
          }}
        />
      ))}
    </div>
  );
}

function BottomNav({ screen, setScreen }) {
  return (
    <nav style={styles.nav}>
      <button
        style={screen === "home" ? styles.navActiveButton : styles.navButton}
        onClick={() => setScreen("home")}
      >
        Home
      </button>
      <button
        style={screen === "history" ? styles.navActiveButton : styles.navButton}
        onClick={() => setScreen("history")}
      >
        History
      </button>
      <button style={styles.navButton} type="button">
        Settings
      </button>
    </nav>
  );
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f5f6fa",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#111",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  appFrame: {
    position: "relative",
    width: "100%",
    maxWidth: 430,
    height: "min(860px, calc(100vh - 32px))",
    minHeight: 640,
    background: "#f5f6fa",
    borderRadius: 30,
    overflow: "hidden",
    boxShadow: "0 24px 70px rgba(15, 23, 42, 0.16)",
    border: "1px solid rgba(15, 23, 42, 0.08)",
  },
  contentArea: {
    height: "100%",
    overflow: "hidden",
  },
  center: {
    height: "100%",
    padding: "28px 22px 96px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    overflow: "hidden",
  },
  scroll: {
    height: "100%",
    padding: "20px 18px 104px",
    overflowY: "auto",
  },
  menu: {
    border: "none",
    background: "transparent",
    color: "#111",
    borderRadius: 8,
    padding: "4px 0",
    alignSelf: "flex-start",
    fontSize: 25,
    lineHeight: 1,
  },
  title: {
    fontSize: 34,
    marginTop: 118,
    marginBottom: 12,
    textAlign: "center",
    lineHeight: 1.12,
    letterSpacing: "-0.04em",
  },
  subtitle: {
    fontSize: 16,
    color: "#555",
    textAlign: "center",
    lineHeight: 1.5,
    maxWidth: 300,
  },
  heading: {
    fontSize: 28,
    textAlign: "center",
    marginTop: 64,
    marginBottom: 34,
    lineHeight: 1.2,
    letterSpacing: "-0.03em",
  },
  blackButton: {
    marginTop: 36,
    background: "linear-gradient(180deg, #2b2f37, #14161b)",
    color: "white",
    border: "none",
    borderRadius: 14,
    padding: "16px 24px",
    fontSize: 16,
    fontWeight: 700,
    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.18)",
  },
  blackButtonWide: {
    width: "100%",
    marginTop: 8,
    background: "linear-gradient(180deg, #2b2f37, #14161b)",
    color: "white",
    border: "none",
    borderRadius: 14,
    padding: "16px 22px",
    fontSize: 16,
    fontWeight: 700,
  },
  stopButton: {
    width: 88,
    height: 88,
    borderRadius: "50%",
    border: "none",
    background: "radial-gradient(circle at 35% 30%, #ff7373, #dc2626)",
    color: "white",
    fontSize: 28,
    marginTop: 28,
    boxShadow: "0 14px 28px rgba(220, 38, 38, 0.32)",
  },
  timer: {
    fontSize: 34,
    fontWeight: 800,
    marginTop: 20,
  },
  wave: {
    height: 132,
    display: "flex",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
  },
  bar: {
    width: 5,
    borderRadius: 99,
    background: "#b7b7b7",
  },
  loader: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    border: "7px solid #ddd",
    borderTopColor: "#111",
    animation: "spin 1s linear infinite",
  },
  steps: {
    marginTop: 48,
    fontSize: 16,
    lineHeight: 1.85,
    width: "100%",
    maxWidth: 250,
  },
  step: {
    margin: "10px 0",
  },
  card: {
    background: "white",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    boxShadow: "0 8px 18px rgba(0,0,0,.06)",
    border: "1px solid rgba(15, 23, 42, 0.06)",
  },
  text: {
    whiteSpace: "pre-wrap",
    fontFamily: "inherit",
    fontSize: 14,
    lineHeight: 1.7,
    margin: 0,
  },
  muted: {
    color: "#777",
    fontSize: 16,
  },
  error: {
    background: "#fee2e2",
    color: "#991b1b",
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  check: {
    marginTop: 150,
    width: 96,
    height: 96,
    borderRadius: "50%",
    border: "4px solid #16a34a",
    color: "#16a34a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 58,
  },
  historyItem: {
    width: "100%",
    background: "white",
    border: "1px solid #ddd",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    textAlign: "left",
    fontSize: 15,
  },
  small: {
    margin: "6px 0 0",
    color: "#777",
    fontSize: 13,
  },
  back: {
    border: "none",
    background: "transparent",
    fontSize: 34,
    lineHeight: 1,
    padding: 0,
  },
  topBar: {
    display: "grid",
    gridTemplateColumns: "32px 1fr 32px",
    alignItems: "center",
    marginBottom: 18,
  },
  topBarTitle: {
    margin: 0,
    textAlign: "center",
    fontSize: 18,
    fontWeight: 800,
  },
  topBarSpacer: {
    width: 32,
    height: 1,
  },
  nav: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 16,
    background: "white",
    borderRadius: 999,
    padding: 8,
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 6,
    boxShadow: "0 12px 30px rgba(0,0,0,.12)",
    border: "1px solid rgba(15, 23, 42, 0.08)",
  },
  navButton: {
    border: "none",
    background: "transparent",
    color: "#777",
    borderRadius: 999,
    padding: "10px 6px",
    fontSize: 13,
    fontWeight: 700,
  },
  navActiveButton: {
    border: "none",
    background: "#111827",
    color: "white",
    borderRadius: 999,
    padding: "10px 6px",
    fontSize: 13,
    fontWeight: 800,
  },
};

const style = document.createElement("style");
style.innerHTML = `
@keyframes spin {
  to { transform: rotate(360deg); }
}
button {
  cursor: pointer;
}
`;
document.head.appendChild(style);