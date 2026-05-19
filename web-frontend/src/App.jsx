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

      const sendAudioRequest = async (fileFieldName, titleFieldName) => {
        const formData = new FormData();
        formData.append(fileFieldName, blob, fileName);
        formData.append(titleFieldName, meetingTitle);

        return fetch(`${API_BASE_URL}/meetings/transcribe-summary`, {
          method: "POST",
          body: formData,
        });
      };

      const requestAttempts = [
        ["file", "title"],
        ["file", "meeting_title"],
        ["audio_file", "title"],
        ["audio_file", "meeting_title"],
        ["audio", "title"],
        ["audio", "meeting_title"],
      ];

      let res = null;
      let lastErrorText = "";

      for (const [fileFieldName, titleFieldName] of requestAttempts) {
        res = await sendAudioRequest(fileFieldName, titleFieldName);

        if (res.ok) {
          break;
        }

        lastErrorText = await res.clone().text();

        if (res.status !== 422) {
          break;
        }
      }

      if (!res || !res.ok) {
        throw new Error(
          lastErrorText || `Backend error: ${res ? res.status : "no response"}`
        );
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
      setError(`AI 處理失敗：${err.message || "Unknown error"}`);
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

      <BottomNav screen={screen} setScreen={setScreen} />
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
      <button style={styles.back} onClick={onBack}>
        ‹
      </button>

      <h2 style={styles.heading}>Meeting Summary</h2>

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
      <button onClick={() => setScreen("home")}>Home</button>
      <button onClick={() => setScreen("history")}>History</button>
      <button>Settings</button>
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
  },
  center: {
    minHeight: "100vh",
    padding: "32px 22px 110px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  scroll: {
    minHeight: "100vh",
    padding: "32px 22px 110px",
    maxWidth: 760,
    margin: "0 auto",
  },
  menu: {
    border: "none",
    background: "#222",
    color: "white",
    borderRadius: 8,
    padding: "6px 10px",
    alignSelf: "flex-start",
  },
  title: {
    fontSize: 42,
    marginTop: 120,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 18,
    color: "#555",
    textAlign: "center",
    lineHeight: 1.5,
  },
  heading: {
    fontSize: 34,
    textAlign: "center",
    marginTop: 70,
    marginBottom: 36,
  },
  blackButton: {
    marginTop: 28,
    background: "#1f2937",
    color: "white",
    border: "none",
    borderRadius: 14,
    padding: "16px 26px",
    fontSize: 18,
    fontWeight: 700,
  },
  blackButtonWide: {
    width: "100%",
    marginTop: 24,
    background: "#1f2937",
    color: "white",
    border: "none",
    borderRadius: 14,
    padding: "18px 26px",
    fontSize: 18,
    fontWeight: 700,
  },
  stopButton: {
    width: 110,
    height: 110,
    borderRadius: "50%",
    border: "none",
    background: "#ef4444",
    color: "white",
    fontSize: 32,
    marginTop: 34,
    boxShadow: "0 12px 30px rgba(239,68,68,.35)",
  },
  timer: {
    fontSize: 40,
    fontWeight: 800,
    marginTop: 28,
  },
  wave: {
    height: 150,
    display: "flex",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  bar: {
    width: 5,
    borderRadius: 99,
    background: "#b7b7b7",
  },
  loader: {
    width: 76,
    height: 76,
    borderRadius: "50%",
    border: "8px solid #ddd",
    borderTopColor: "#2563eb",
    animation: "spin 1s linear infinite",
  },
  steps: {
    marginTop: 48,
    fontSize: 20,
    lineHeight: 1.8,
  },
  step: {
    margin: "10px 0",
  },
  card: {
    background: "white",
    borderRadius: 24,
    padding: 28,
    marginBottom: 24,
    boxShadow: "0 14px 32px rgba(0,0,0,.08)",
  },
  text: {
    whiteSpace: "pre-wrap",
    fontFamily: "inherit",
    fontSize: 16,
    lineHeight: 1.7,
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
    marginTop: 160,
    width: 100,
    height: 100,
    borderRadius: "50%",
    border: "4px solid #16a34a",
    color: "#16a34a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 60,
  },
  historyItem: {
    width: "100%",
    background: "white",
    border: "1px solid #ddd",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    textAlign: "left",
    fontSize: 16,
  },
  small: {
    margin: "6px 0 0",
    color: "#777",
    fontSize: 13,
  },
  back: {
    border: "none",
    background: "transparent",
    fontSize: 42,
  },
  nav: {
    position: "fixed",
    bottom: 22,
    left: "50%",
    transform: "translateX(-50%)",
    background: "white",
    borderRadius: 999,
    padding: 12,
    display: "flex",
    gap: 12,
    boxShadow: "0 12px 30px rgba(0,0,0,.12)",
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