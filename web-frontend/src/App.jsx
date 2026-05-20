import { useEffect, useRef, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [screenDirection, setScreenDirection] = useState("forward");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [processingStep, setProcessingStep] = useState("idle");
  const [audioUrl, setAudioUrl] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [audioLevels, setAudioLevels] = useState(Array(26).fill(0.25));
  const [recordingTitle, setRecordingTitle] = useState("");

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const secondsRef = useRef(0);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    loadHistory();
    return () => {
      stopAudioVisualizer();
      clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function navigate(nextScreen, direction = "forward") {
    setScreenDirection(direction);
    setScreen(nextScreen);
  }

  async function loadHistory() {
    try {
      setIsLoadingHistory(true);
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
      // History is optional. Keep app usable even if backend list endpoint is unavailable.
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function startRecording() {
    try {
      setError("");
      setResult(null);
      setAudioUrl("");
      setAudioLevels(Array(26).fill(0.25));
      chunksRef.current = [];
      secondsRef.current = 0;
      setRecordingSeconds(0);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("此瀏覽器不支援麥克風錄音，請改用 Safari 或 Chrome。" );
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      startAudioVisualizer(stream);

      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        clearInterval(timerRef.current);
        stopAudioVisualizer();
        stream.getTracks().forEach((track) => track.stop());

        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/mp4",
        });

        const localUrl = URL.createObjectURL(blob);
        setAudioUrl(localUrl);

        await processAudio(blob, mimeType);
      };

      recorder.start();
      navigate("recording", "forward");

      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setRecordingSeconds(secondsRef.current);
      }, 1000);
    } catch (err) {
      console.error(err);
      setError("麥克風授權失敗，請允許瀏覽器使用麥克風後再試一次。" );
    }
  }

  function stopRecording() {
    if (!recorderRef.current || recorderRef.current.state === "inactive") {
      return;
    }

    navigate("processing", "forward");
    setProcessingStep("uploading");
    recorderRef.current.stop();
  }

  function cancelRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }

    clearInterval(timerRef.current);
    stopAudioVisualizer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setRecordingSeconds(0);
    setAudioLevels(Array(26).fill(0.25));
    navigate("home", "back");
  }

  async function processAudio(blob, mimeType) {
    try {
      const safeMimeType = mimeType || blob.type || "audio/mp4";
      const ext = safeMimeType.includes("webm") ? "webm" : "m4a";
      const fileName = `meeting-${Date.now()}.${ext}`;
      const meetingTitle =
        recordingTitle.trim() || `Meeting ${new Date().toLocaleString()}`;

      setProcessingStep("uploading");
      await wait(250);
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
      navigate("summary", "forward");
      loadHistory();
    } catch (err) {
      console.error(err);
      const message = err.message || "Unknown error";
      const friendlyMessage =
        message === "Load failed" || message === "Failed to fetch"
          ? "前端連不到後端，通常是 Render 後端冷啟動或網路暫時中斷。請先打開後端 /docs 讓 Render 醒來後再試一次。"
          : message;
      setError(`AI 處理失敗：${friendlyMessage}`);
      navigate("summary", "forward");
    }
  }

  async function openHistoryItem(item) {
    try {
      setError("");
      const id = item.id || item.meeting_id || item.meetingId;
      if (!id) {
        setResult(item);
        navigate("summary", "forward");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/meetings/${id}`);
      if (!res.ok) throw new Error("Meeting detail not found");
      const data = await res.json();
      setResult(data);
      setAudioUrl("");
      navigate("summary", "forward");
    } catch {
      setResult(item);
      setAudioUrl("");
      navigate("summary", "forward");
    }
  }

  function startAudioVisualizer(stream) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const draw = () => {
        analyser.getByteFrequencyData(dataArray);

        const nextLevels = Array.from({ length: 26 }, (_, index) => {
          const bucket = dataArray[index % dataArray.length] || 0;
          const normalized = Math.max(0.16, Math.min(1, bucket / 140));
          return normalized;
        });

        setAudioLevels(nextLevels);
        animationFrameRef.current = requestAnimationFrame(draw);
      };

      draw();
    } catch (err) {
      console.warn("Audio visualizer unavailable", err);
    }
  }

  function stopAudioVisualizer() {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    analyserRef.current = null;
  }

  return (
    <div style={styles.page}>
      <div style={styles.appFrame}>
        <div style={styles.contentArea}>
          <div
            key={screen}
            style={
              screenDirection === "back"
                ? styles.screenTransitionBack
                : styles.screenTransitionForward
            }
          >
            {screen === "home" && (
              <Home
                title={recordingTitle}
                setTitle={setRecordingTitle}
                onStart={startRecording}
                error={error}
              />
            )}
            {screen === "recording" && (
              <Recording
                seconds={recordingSeconds}
                levels={audioLevels}
                onStop={stopRecording}
                onCancel={cancelRecording}
              />
            )}
            {screen === "processing" && <Processing step={processingStep} />}
            {screen === "summary" && (
              <Summary
                result={result}
                audioUrl={audioUrl}
                error={error}
                onSave={() => navigate("saved", "forward")}
                onBack={() => navigate("home", "back")}
                onRecordAgain={startRecording}
              />
            )}
            {screen === "saved" && (
              <Saved
                onHistory={() => navigate("history", "forward")}
                onHome={() => navigate("home", "back")}
              />
            )}
            {screen === "history" && (
              <History
                history={history}
                isLoading={isLoadingHistory}
                onOpen={openHistoryItem}
                onRefresh={loadHistory}
              />
            )}
            {screen === "settings" && <Settings />}
          </div>
        </div>

        <BottomNav screen={screen} navigate={navigate} />
      </div>
    </div>
  );
}

function Home({ title, setTitle, onStart, error }) {
  return (
    <main style={styles.center}>
      <h1 style={styles.title}>AI Meeting Assistant</h1>
      <p style={styles.subtitle}>
        Record, transcribe, and summarize your meetings with AI.
      </p>
      <input
        style={styles.titleInput}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Meeting title (optional)"
      />
      {error && <p style={styles.error}>{error}</p>}
      <button style={styles.blackButton} onClick={onStart}>
        🎙 Start Recording
      </button>
    </main>
  );
}

function Recording({ seconds, levels, onStop, onCancel }) {
  return (
    <main style={styles.center}>
      <button style={styles.cancelButton} onClick={onCancel}>
        Cancel
      </button>
      <h2 style={styles.heading}>Recording...</h2>
      <Wave levels={levels} />
      <div style={styles.timer}>{formatTime(seconds)}</div>
      <button style={styles.stopButton} onClick={onStop} aria-label="Stop recording">
        ■
      </button>
    </main>
  );
}

function Processing({ step }) {
  return (
    <main style={styles.center}>
      <h2 style={styles.heading}>Processing your meeting...</h2>
      <div style={styles.loader} />
      <div style={styles.steps}>
        <Step done={step !== "uploading"} active={step === "uploading"}>
          Uploading audio
        </Step>
        <Step
          done={step === "summarizing" || step === "done"}
          active={step === "transcribing"}
        >
          Transcribing
        </Step>
        <Step done={step === "done"} active={step === "summarizing"}>
          Generating summary
        </Step>
      </div>
    </main>
  );
}

function Summary({ result, audioUrl, error, onSave, onBack, onRecordAgain }) {
  const audioRef = useRef(null);
  const transcript =
    result?.timeline_transcript ||
    result?.timelineTranscript ||
    result?.transcript ||
    result?.text ||
    "";

  const segments = Array.isArray(result?.segments) ? result.segments : [];

  const summaryValue =
    result?.summary || result?.ai_summary || result?.meeting_summary || "";
  const summary =
    typeof summaryValue === "string"
      ? summaryValue
      : summaryValue?.summary || summaryValue?.overview || "";

  const parsedSummary = parseSummary(summary);
  const hasStructuredSummary =
    parsedSummary.quickSummary ||
    parsedSummary.keyPoints.length > 0 ||
    parsedSummary.actionItems.length > 0 ||
    parsedSummary.importantInfo.length > 0;

  function jumpToSegment(startTime) {
    const seconds = timeToSeconds(startTime);
    if (!audioRef.current || Number.isNaN(seconds)) return;
    audioRef.current.currentTime = seconds;
    audioRef.current.play().catch(() => {});
  }

  return (
    <main style={styles.scroll}>
      <div style={styles.topBar}>
        <button style={styles.back} onClick={onBack}>
          ‹
        </button>
        <h2 style={styles.topBarTitle}>Meeting Summary</h2>
        <span style={styles.topBarSpacer} />
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {audioUrl && (
        <Card title="Audio Playback">
          <audio ref={audioRef} controls src={audioUrl} style={{ width: "100%" }} />
        </Card>
      )}

      {hasStructuredSummary ? (
        <>
          <Card title="Quick Summary">
            <p style={styles.highlightText}>
              {parsedSummary.quickSummary || parsedSummary.oneSentence || "No quick summary available."}
            </p>
          </Card>

          {parsedSummary.keyPoints.length > 0 && (
            <Card title="Key Points">
              <ul style={styles.cleanList}>
                {parsedSummary.keyPoints.map((item, index) => (
                  <li key={`key-${index}`}>{item}</li>
                ))}
              </ul>
            </Card>
          )}

          {parsedSummary.actionItems.length > 0 && (
            <Card title="Action Items">
              <div style={styles.actionList}>
                {parsedSummary.actionItems.map((item, index) => (
                  <label key={`action-${index}`} style={styles.actionItem}>
                    <input type="checkbox" />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </Card>
          )}

          {parsedSummary.importantInfo.length > 0 && (
            <Card title="Important Details">
              <ul style={styles.cleanList}>
                {parsedSummary.importantInfo.map((item, index) => (
                  <li key={`info-${index}`}>{item}</li>
                ))}
              </ul>
            </Card>
          )}

          {summary && (
            <details style={styles.detailsBox}>
              <summary style={styles.detailsSummary}>Full AI Analysis</summary>
              <pre style={styles.text}>{summary}</pre>
            </details>
          )}
        </>
      ) : (
        <Card title="Summary">
          {summary ? (
            <pre style={styles.text}>{summary}</pre>
          ) : (
            <p style={styles.muted}>尚未產生摘要。</p>
          )}
        </Card>
      )}

      <Card title="Transcript">
        {segments.length > 0 ? (
          <div style={styles.segmentList}>
            {segments.map((segment, index) => (
              <button
                key={`${segment.start}-${index}`}
                style={styles.segmentItem}
                onClick={() => jumpToSegment(segment.start)}
              >
                <span style={styles.segmentTime}>{segment.start}</span>
                <span style={styles.segmentBody}>
                  <strong>{segment.speaker || `Speaker ${index + 1}`}</strong>
                  <span>{segment.text}</span>
                </span>
              </button>
            ))}
          </div>
        ) : transcript ? (
          <pre style={styles.text}>{transcript}</pre>
        ) : (
          <p style={styles.muted}>尚未產生逐字稿。</p>
        )}
      </Card>

      <div style={styles.summaryActions}>
        <button style={styles.secondaryActionButton} onClick={onRecordAgain}>
          Record Again
        </button>
        <button style={styles.blackButtonWide} onClick={onSave}>
          Save Meeting
        </button>
      </div>
    </main>
  );
}
function parseSummary(summaryText) {
  if (!summaryText || typeof summaryText !== "string") {
    return {
      quickSummary: "",
      keyPoints: [],
      actionItems: [],
      importantInfo: [],
      oneSentence: "",
    };
  }

  const sections = {};
  const lines = summaryText.split("\n");
  let currentSection = "overview";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingMatch = line.match(/^#{1,3}\s*(.+)$/);
    if (headingMatch) {
      currentSection = normalizeSectionTitle(headingMatch[1]);
      sections[currentSection] = sections[currentSection] || [];
      continue;
    }

    sections[currentSection] = sections[currentSection] || [];
    sections[currentSection].push(line.replace(/^[-•]\s*/, ""));
  }

  const summaryLines = [
    ...(sections["內容摘要"] || []),
    ...(sections["一般摘要"] || []),
    ...(sections["overview"] || []),
  ].filter(Boolean);

  const importantInfo = [
    ...(sections["重要資訊"] || []),
    ...(sections["關鍵句或重要細節"] || []),
  ].filter(Boolean);

  const actionItems = [
    ...(sections["後續可做的事"] || []),
    ...(sections["待辦事項"] || []),
    ...(sections["action items"] || []),
  ].filter(Boolean);

  const oneSentence = [
    ...(sections["一句話結論"] || []),
    ...(sections["結論"] || []),
  ].filter(Boolean)[0] || "";

  return {
    quickSummary: summaryLines[0] || oneSentence || "",
    keyPoints: summaryLines.slice(0, 5),
    actionItems,
    importantInfo,
    oneSentence,
  };
}

function normalizeSectionTitle(title) {
  return title
    .replace(/[:：]/g, "")
    .replace(/^\d+\.\s*/, "")
    .trim()
    .toLowerCase();
}

function timeToSeconds(timeString) {
  if (!timeString || typeof timeString !== "string") return Number.NaN;
  const parts = timeString.split(":").map(Number);
  if (parts.some(Number.isNaN)) return Number.NaN;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number.NaN;
}

function Saved({ onHistory, onHome }) {
  return (
    <main style={styles.center}>
      <div style={styles.check}>✓</div>
      <h2 style={styles.heading}>Meeting Saved!</h2>
      <p style={styles.subtitle}>You can view it in History.</p>
      <button style={styles.blackButton} onClick={onHistory}>
        Go to History
      </button>
      <button style={styles.textButton} onClick={onHome}>
        Back Home
      </button>
    </main>
  );
}

function History({ history, isLoading, onOpen, onRefresh }) {
  return (
    <main style={styles.scroll}>
      <div style={styles.historyHeader}>
        <button style={styles.refreshButton} onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <h2 style={styles.historyHeading}>History</h2>

      {isLoading && <p style={styles.muted}>Loading meetings...</p>}
      {!isLoading && history.length === 0 && (
        <p style={styles.muted}>No meetings yet.</p>
      )}

      {history.map((item) => (
        <button
          key={item.id || item.meeting_id || item.meetingId}
          style={styles.historyItem}
          onClick={() => onOpen(item)}
        >
          <div>
            <strong>
              {item.meeting_title || item.meetingTitle || item.title || "Untitled Meeting"}
            </strong>
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

function Settings() {
  return (
    <main style={styles.scroll}>
      <h2 style={styles.historyHeading}>Settings</h2>

      <Card title="AI Meeting Assistant">
        <p style={styles.text}>MVP v1.0</p>
        <p style={styles.muted}>
          Record, transcribe, and summarize meetings in one place.
        </p>
      </Card>

      <Card title="AI Features">
        <p style={styles.text}>
          ✓ Audio transcription{"\n"}
          ✓ Timeline transcript{"\n"}
          ✓ AI meeting summary{"\n"}
          ✓ Speaker segmentation
        </p>
      </Card>

      <Card title="Privacy">
        <p style={styles.text}>
          Audio is uploaded only for transcription and meeting analysis.
        </p>
      </Card>

      <Card title="Built With">
        <p style={styles.text}>OpenAI, FastAPI, React, PostgreSQL</p>
      </Card>
    </main>
  );
}

function Card({ title, children }) {
  return (
    <section style={styles.card}>
      <h3 style={styles.cardTitle}>{title}</h3>
      {children}
    </section>
  );
}

function Step({ children, done, active }) {
  return (
    <p style={styles.step}>
      <span style={done ? styles.stepDone : active ? styles.stepActive : styles.stepIdle}>
        {done ? "✓" : active ? "◌" : "○"}
      </span>{" "}
      {children}
    </p>
  );
}


function Wave({ levels }) {
  return (
    <div style={styles.wave}>
      {levels.map((level, index) => (
        <span
          key={index}
          style={{
            ...styles.bar,
            height: `${18 + level * 88}px`,
            opacity: 0.45 + level * 0.55,
            transform: `scaleY(${0.75 + level * 0.55})`,
          }}
        />
      ))}
    </div>
  );
}

function BottomNav({ screen, navigate }) {
  return (
    <nav style={styles.nav}>
      <button
        style={screen === "home" ? styles.navActiveButton : styles.navButton}
        onClick={() => navigate("home", "back")}
      >
        Home
      </button>
      <button
        style={screen === "history" ? styles.navActiveButton : styles.navButton}
        onClick={() => navigate("history", "forward")}
      >
        History
      </button>
      <button
        style={screen === "settings" ? styles.navActiveButton : styles.navButton}
        onClick={() => navigate("settings", "forward")}
      >
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

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #f6f7fb 0%, #eceff5 100%)",
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
  screenTransitionForward: {
    height: "100%",
    animation: "slideInForward 260ms ease both",
  },
  screenTransitionBack: {
    height: "100%",
    animation: "slideInBack 260ms ease both",
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
  title: {
    fontSize: 34,
    marginTop: 102,
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
  titleInput: {
    width: "100%",
    maxWidth: 320,
    marginTop: 28,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    borderRadius: 14,
    padding: "14px 16px",
    fontSize: 15,
    outline: "none",
    background: "white",
    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.05)",
  },
  heading: {
    fontSize: 28,
    textAlign: "center",
    marginTop: 64,
    marginBottom: 34,
    lineHeight: 1.2,
    letterSpacing: "-0.03em",
  },
  historyHeading: {
    fontSize: 28,
    margin: "24px 0 18px",
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
    flex: 1,
    background: "linear-gradient(180deg, #2b2f37, #14161b)",
    color: "white",
    border: "none",
    borderRadius: 14,
    padding: "16px 18px",
    fontSize: 15,
    fontWeight: 700,
  },
  secondaryActionButton: {
    flex: 1,
    background: "white",
    color: "#111827",
    border: "1px solid rgba(15, 23, 42, 0.12)",
    borderRadius: 14,
    padding: "16px 18px",
    fontSize: 15,
    fontWeight: 700,
  },
  textButton: {
    border: "none",
    background: "transparent",
    marginTop: 16,
    color: "#555",
    fontSize: 15,
    fontWeight: 700,
  },
  cancelButton: {
    border: "none",
    background: "transparent",
    color: "#666",
    alignSelf: "flex-start",
    fontSize: 15,
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
    background: "linear-gradient(180deg, #111827, #9ca3af)",
    transition: "height 90ms ease, transform 90ms ease, opacity 90ms ease",
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
  stepDone: {
    color: "#16a34a",
    fontWeight: 800,
  },
  stepActive: {
    color: "#111827",
    fontWeight: 800,
  },
  stepIdle: {
    color: "#9ca3af",
  },
  card: {
    background: "white",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    boxShadow: "0 8px 18px rgba(0,0,0,.06)",
    border: "1px solid rgba(15, 23, 42, 0.06)",
  },
  cardTitle: {
    margin: "0 0 12px",
    fontSize: 16,
  },
  highlightText: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.7,
    color: "#111827",
    fontWeight: 700,
  },
  cleanList: {
    margin: 0,
    paddingLeft: 20,
    display: "grid",
    gap: 8,
    fontSize: 14,
    lineHeight: 1.55,
  },
  actionList: {
    display: "grid",
    gap: 10,
  },
  actionItem: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    fontSize: 14,
    lineHeight: 1.5,
  },
  detailsBox: {
    background: "white",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    boxShadow: "0 8px 18px rgba(0,0,0,.06)",
    border: "1px solid rgba(15, 23, 42, 0.06)",
  },
  detailsSummary: {
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 16,
    marginBottom: 12,
  },
  segmentList: {
    display: "grid",
    gap: 10,
  },
  segmentItem: {
    width: "100%",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    background: "#f8fafc",
    borderRadius: 14,
    padding: 12,
    display: "grid",
    gridTemplateColumns: "54px 1fr",
    gap: 10,
    textAlign: "left",
  },
  segmentTime: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: 800,
    paddingTop: 2,
  },
  segmentBody: {
    display: "grid",
    gap: 4,
    fontSize: 14,
    lineHeight: 1.55,
    color: "#111827",
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
    lineHeight: 1.5,
  },
  error: {
    background: "#fee2e2",
    color: "#991b1b",
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    lineHeight: 1.5,
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
    animation: "popIn 320ms ease both",
  },
  historyHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refreshButton: {
    border: "none",
    background: "white",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700,
    boxShadow: "0 6px 16px rgba(15, 23, 42, 0.08)",
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
  summaryActions: {
    display: "flex",
    gap: 10,
    marginTop: 6,
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
@keyframes slideInForward {
  from { opacity: 0; transform: translateX(24px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes slideInBack {
  from { opacity: 0; transform: translateX(-24px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes popIn {
  from { opacity: 0; transform: scale(0.82); }
  to { opacity: 1; transform: scale(1); }
}
button {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
button:active {
  transform: scale(0.98);
}
summary::marker {
  color: #111827;
}
input[type="checkbox"] {
  accent-color: #111827;
}
`;
document.head.appendChild(style);