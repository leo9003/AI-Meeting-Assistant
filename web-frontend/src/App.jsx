
import { useEffect, useMemo, useRef, useState } from "react"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"

function App() {
  const [screen, setScreen] = useState("home")
  const [meetings, setMeetings] = useState([])
  const [meetingTitle, setMeetingTitle] = useState("")
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingStatus, setRecordingStatus] = useState("idle")
  const [processingStep, setProcessingStep] = useState("idle")
  const [audioUrl, setAudioUrl] = useState("")
  const [transcript, setTranscript] = useState("")
  const [timelineTranscript, setTimelineTranscript] = useState("")
  const [summary, setSummary] = useState("")
  const [actionItems, setActionItems] = useState([])
  const [decisions, setDecisions] = useState([])
  const [apiError, setApiError] = useState("")
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [currentMeeting, setCurrentMeeting] = useState(null)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)
  const recordingSecondsRef = useRef(0)

  const tab = useMemo(() => {
    if (screen === "history") return "history"
    if (screen === "settings") return "settings"
    return "home"
  }, [screen])

  function openNewRecording() {
    setShowPermissionModal(true)
  }

  async function startRecording() {
    try {
      setShowPermissionModal(false)
      setApiError("")
      setTranscript("")
      setTimelineTranscript("")
      setSummary("")
      setActionItems([])
      setDecisions([])
      setAudioUrl("")
      setRecordingSeconds(0)
      recordingSecondsRef.current = 0
      audioChunksRef.current = []

      if (!navigator.mediaDevices?.getUserMedia) {
        setApiError("This browser does not support microphone recording.")
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : ""

      const mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      )

      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const recordedBlob = new Blob(audioChunksRef.current, {
          type: mimeType || "audio/mp4",
        })
        const url = URL.createObjectURL(recordedBlob)
        const meeting = {
          id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
          title: meetingTitle.trim() || "Untitled Meeting",
          date: new Date().toLocaleDateString("zh-TW"),
          time: new Date().toLocaleTimeString("zh-TW", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          durationSeconds: recordingSecondsRef.current,
          audioUrl: url,
          status: "Processing",
        }

        setCurrentMeeting(meeting)
        setAudioUrl(url)
        stream.getTracks().forEach((track) => track.stop())
        await uploadRecording(recordedBlob, meeting, mimeType)
      }

      mediaRecorder.start()
      setRecordingStatus("recording")
      setScreen("recording")

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => {
          const nextSeconds = seconds + 1
          recordingSecondsRef.current = nextSeconds
          return nextSeconds
        })
      }, 1000)
    } catch (error) {
      console.error(error)
      setApiError("Microphone permission failed. Please allow microphone access and try again.")
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }

    setRecordingStatus("processing")
    setProcessingStep("uploading")
    setScreen("processing")
  }

  async function uploadRecording(recordedBlob, meeting, mimeType) {
    try {
      const formData = new FormData()
      const extension = getAudioFileExtension(mimeType)
      formData.append("file", recordedBlob, `meeting-${Date.now()}.${extension}`)
      formData.append("title", meeting.title)

      setProcessingStep("uploading")
      await wait(250)
      setProcessingStep("transcribing")

      const response = await fetch(`${API_BASE_URL}/meetings/transcribe-summary`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || "Failed to process recording.")
      }

      setProcessingStep("summarizing")
      const result = await response.json()
      console.log("AI result from backend:", result)
      const parsed = normalizeMeetingResult(result)

      const completedMeeting = {
        ...meeting,
        id: result.meeting_id || meeting.id,
        title: result.meeting_title || meeting.title,
        transcript: parsed.transcript,
        timelineTranscript: parsed.timelineTranscript,
        summary: parsed.summary,
        actionItems: parsed.actionItems,
        decisions: parsed.decisions,
        status: "Completed",
      }

      setTranscript(parsed.transcript)
      setTimelineTranscript(parsed.timelineTranscript)
      setSummary(parsed.summary)
      setActionItems(parsed.actionItems)
      setDecisions(parsed.decisions)
      setCurrentMeeting(completedMeeting)
      setMeetings((current) => [completedMeeting, ...current])
      setProcessingStep("completed")
      setScreen("summary")
    } catch (error) {
      console.error(error)
      const failedMeeting = {
        ...meeting,
        status: "Recorded",
      }
      setCurrentMeeting(failedMeeting)
      setMeetings((current) => [failedMeeting, ...current])
      setApiError("AI processing failed. The recording was saved, but transcript and summary were not generated.")
      setProcessingStep("failed")
      setScreen("summary")
    }
  }

  function openMeeting(meeting) {
    setCurrentMeeting(meeting)
    setMeetingTitle(meeting.title || "")
    setAudioUrl(meeting.audioUrl || "")
    setRecordingSeconds(meeting.durationSeconds || 0)
    setTranscript(meeting.transcript || "")
    setTimelineTranscript(meeting.timelineTranscript || "")
    setSummary(meeting.summary || "")
    setActionItems(meeting.actionItems || [])
    setDecisions(meeting.decisions || [])
    setApiError("")
    setScreen("summary")
  }

  function saveAndGoHistory() {
    setScreen("saved")
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }
    }
  }, [])

  return (
    <div style={styles.appShell}>
      <PhoneFrame>
        {screen === "home" && (
          <HomeScreen onStart={openNewRecording} apiError={apiError} />
        )}

        {screen === "recording" && (
          <RecordingScreen
            recordingSeconds={recordingSeconds}
            recordingStatus={recordingStatus}
            onStop={stopRecording}
          />
        )}

        {screen === "processing" && (
          <ProcessingScreen processingStep={processingStep} />
        )}

        {screen === "summary" && (
          <SummaryScreen
            meeting={currentMeeting}
            audioUrl={audioUrl}
            transcript={transcript}
            timelineTranscript={timelineTranscript}
            summary={summary}
            actionItems={actionItems}
            decisions={decisions}
            apiError={apiError}
            onBack={() => setScreen("home")}
            onSave={saveAndGoHistory}
          />
        )}

        {screen === "saved" && (
          <SavedScreen onGoHistory={() => setScreen("history")} onBack={() => setScreen("summary")} />
        )}

        {screen === "history" && (
          <HistoryScreen meetings={meetings} onOpenMeeting={openMeeting} />
        )}

        {screen === "settings" && <SettingsScreen />}

        <BottomNav active={tab} onNavigate={setScreen} />
      </PhoneFrame>

      {showPermissionModal && (
        <PermissionModal
          onCancel={() => setShowPermissionModal(false)}
          onConfirm={startRecording}
        />
      )}
    </div>
  )
}

function PhoneFrame({ children }) {
  return (
    <main style={styles.phone}>
      <div style={styles.phoneContent}>{children}</div>
    </main>
  )
}

function HomeScreen({ onStart, apiError }) {
  return (
    <section style={styles.screen}>
      <Header />
      <div style={styles.homeBody}>
        <h1 style={styles.homeTitle}>AI Meeting Assistant</h1>
        <p style={styles.homeText}>Record, transcribe, and summarize your meetings with AI.</p>
        {apiError && <p style={styles.errorText}>{apiError}</p>}
        <button style={styles.darkButton} onClick={onStart}>
          <span style={styles.buttonIcon}>🎙️</span>
          Start Recording
        </button>
      </div>
    </section>
  )
}

function RecordingScreen({ recordingSeconds, recordingStatus, onStop }) {
  return (
    <section style={styles.screenCenter}>
      <Header />
      <h2 style={styles.simpleTitle}>{recordingStatus === "recording" ? "Recording..." : "Preparing..."}</h2>
      <Waveform />
      <p style={styles.timer}>{formatDuration(recordingSeconds)}</p>
      <button style={styles.recordStopButton} onClick={onStop} aria-label="Stop recording">
        <span style={styles.stopSquare} />
      </button>
    </section>
  )
}

function ProcessingScreen({ processingStep }) {
  return (
    <section style={styles.screenCenter}>
      <Header />
      <h2 style={styles.processingTitle}>Processing your meeting...</h2>
      <div style={styles.spinner} />
      <div style={styles.processList}>
        <ProcessItem label="Uploading audio" active={processingStep === "uploading"} done={["transcribing", "summarizing", "completed"].includes(processingStep)} />
        <ProcessItem label="Transcribing" active={processingStep === "transcribing"} done={["summarizing", "completed"].includes(processingStep)} />
        <ProcessItem label="Generating summary" active={processingStep === "summarizing"} done={processingStep === "completed"} />
      </div>
    </section>
  )
}

function SummaryScreen({ meeting, audioUrl, transcript, timelineTranscript, summary, actionItems, decisions, apiError, onBack, onSave }) {
  return (
    <section style={styles.screenScrollable}>
      <TopBack onBack={onBack} title="Meeting Summary" />
      <div style={styles.cardStack}>
        {apiError && <p style={styles.errorText}>{apiError}</p>}

        <ResultCard title="Summary">
          {summary ? <p style={styles.resultText}>{summary}</p> : <SkeletonLines count={4} />}
        </ResultCard>

        <ResultCard title="Key Points">
          {summary ? <SummaryBullets summary={summary} /> : <SkeletonBullets count={3} />}
        </ResultCard>

        <ResultCard title="Action Items">
          {actionItems.length > 0 ? (
            <ul style={styles.checkList}>
              {actionItems.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : (
            <p style={styles.mutedText}>No action items detected.</p>
          )}
        </ResultCard>

        <ResultCard title="Transcript">
          {timelineTranscript || transcript ? (
            <p style={styles.resultText}>{timelineTranscript || transcript}</p>
          ) : (
            <SkeletonLines count={4} />
          )}
        </ResultCard>

        <ResultCard title="Audio Playback">
          {audioUrl ? <audio style={styles.audioPlayer} controls src={audioUrl} /> : <p style={styles.mutedText}>No audio available.</p>}
        </ResultCard>

        {decisions.length > 0 && (
          <ResultCard title="Decisions">
            <ul style={styles.checkList}>
              {decisions.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </ResultCard>
        )}
      </div>
      <button style={styles.saveButton} onClick={onSave}>Save Meeting</button>
      {meeting && <p style={styles.metaText}>{meeting.date} · {formatDuration(meeting.durationSeconds || 0)}</p>}
    </section>
  )
}

function SavedScreen({ onGoHistory, onBack }) {
  return (
    <section style={styles.screenCenter}>
      <TopBack onBack={onBack} />
      <div style={styles.successCircle}>✓</div>
      <h2 style={styles.savedTitle}>Meeting Saved!</h2>
      <p style={styles.mutedText}>You can view it in History.</p>
      <button style={styles.darkButtonWide} onClick={onGoHistory}>Go to History</button>
    </section>
  )
}

function HistoryScreen({ meetings, onOpenMeeting }) {
  return (
    <section style={styles.screenScrollable}>
      <Header />
      <h2 style={styles.historyTitle}>History</h2>
      <div style={styles.historyList}>
        {meetings.length === 0 ? (
          <div style={styles.emptyBox}>No saved meetings yet.</div>
        ) : (
          meetings.map((meeting) => (
            <button key={meeting.id} style={styles.historyItem} onClick={() => onOpenMeeting(meeting)}>
              <div>
                <strong>{meeting.title}</strong>
                <p>{meeting.date} · {meeting.time || ""}</p>
              </div>
              <span>›</span>
            </button>
          ))
        )}
      </div>
    </section>
  )
}

function SettingsScreen() {
  return (
    <section style={styles.screenScrollable}>
      <Header />
      <h2 style={styles.historyTitle}>Settings</h2>
      <div style={styles.emptyBox}>Settings will be added in the next version.</div>
    </section>
  )
}

function Header() {
  return <button style={styles.menuButton}>☰</button>
}

function TopBack({ onBack, title }) {
  return (
    <div style={styles.topBack}>
      <button style={styles.backButton} onClick={onBack}>‹</button>
      {title && <h2 style={styles.topTitle}>{title}</h2>}
    </div>
  )
}

function BottomNav({ active, onNavigate }) {
  return (
    <nav style={styles.bottomNav}>
      <button style={active === "home" ? styles.navActive : styles.navButton} onClick={() => onNavigate("home")}>
        <span>⌂</span>
        Home
      </button>
      <button style={active === "history" ? styles.navActive : styles.navButton} onClick={() => onNavigate("history")}>
        <span>◷</span>
        History
      </button>
      <button style={active === "settings" ? styles.navActive : styles.navButton} onClick={() => onNavigate("settings")}>
        <span>⚙</span>
        Settings
      </button>
    </nav>
  )
}

function PermissionModal({ onCancel, onConfirm }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <div style={styles.modalIcon}>🎙️</div>
        <h2 style={styles.modalTitle}>Allow microphone</h2>
        <p style={styles.modalText}>The browser will ask for microphone permission before recording starts.</p>
        <div style={styles.modalActions}>
          <button style={styles.lightButton} onClick={onCancel}>Cancel</button>
          <button style={styles.darkButtonWide} onClick={onConfirm}>Allow</button>
        </div>
      </div>
    </div>
  )
}

function ResultCard({ title, children }) {
  return (
    <div style={styles.resultCard}>
      <h3 style={styles.resultTitle}>{title}</h3>
      {children}
    </div>
  )
}

function ProcessItem({ label, active, done }) {
  return (
    <div style={styles.processItem}>
      <span style={done ? styles.processDone : active ? styles.processActive : styles.processIdle}>{done ? "✓" : active ? "⌁" : "○"}</span>
      <span>{label}</span>
    </div>
  )
}

function Waveform() {
  return (
    <div style={styles.waveform}>
      {Array.from({ length: 30 }).map((_, index) => (
        <span key={index} style={{ ...styles.waveBar, height: `${18 + (index % 6) * 8}px` }} />
      ))}
    </div>
  )
}

function SkeletonLines({ count }) {
  return (
    <div style={styles.skeletonGroup}>
      {Array.from({ length: count }).map((_, index) => (
        <span key={index} style={{ ...styles.skeletonLine, width: `${90 - index * 10}%` }} />
      ))}
    </div>
  )
}

function SkeletonBullets({ count }) {
  return (
    <div style={styles.skeletonGroup}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} style={styles.skeletonBulletRow}>
          <span style={styles.bulletDot} />
          <span style={{ ...styles.skeletonLine, width: `${78 - index * 8}%` }} />
        </div>
      ))}
    </div>
  )
}

function SummaryBullets({ summary }) {
  const items = summary
    .split("\n")
    .map((line) => line.replace(/^[-#*\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 4)

  if (items.length === 0) {
    return <p style={styles.resultText}>{summary}</p>
  }

  return (
    <ul style={styles.summaryList}>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0")
  const seconds = (totalSeconds % 60).toString().padStart(2, "0")
  return `${minutes}:${seconds}`
}

function getAudioFileExtension(mimeType) {
  if (mimeType?.includes("mp4")) return "m4a"
  if (mimeType?.includes("webm")) return "webm"
  return "m4a"
}

function normalizeMeetingResult(result) {
  const summaryValue = result.summary || result.ai_summary || result.meeting_summary || ""
  const summaryObject = typeof summaryValue === "object" && summaryValue !== null ? summaryValue : {}

  return {
    transcript: result.transcript || result.text || "",
    timelineTranscript: result.timeline_transcript || result.timelineTranscript || "",
    summary: typeof summaryValue === "string" ? summaryValue : summaryObject.summary || summaryObject.overview || "",
    actionItems: result.action_items || result.actionItems || summaryObject.action_items || summaryObject.actionItems || [],
    decisions: result.decisions || summaryObject.decisions || [],
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

const styles = {
  appShell: {
    display: "flex",
    minHeight: "100vh",
    backgroundColor: "#F5F7FB",
    color: "#111827",
    fontFamily: "Inter, Arial, sans-serif",
  },
  sidebar: {
    width: "200px",
    background: "#FFFFFF",
    borderRight: "1px solid #E5E7EB",
    padding: "20px 16px",
    display: "flex",
    flexDirection: "column",
  },
  sidebarMobileHidden: {
    display: "none",
  },
  logoBlock: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  logoIcon: {
    width: "36px",
    height: "36px",
    borderRadius: "12px",
    background: "#2563EB",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: "13px",
  },
  logoTitle: {
    margin: 0,
    fontSize: "16px",
  },
  logoSubtitle: {
    margin: 0,
    color: "#6B7280",
    fontSize: "13px",
  },
  navList: {
    marginTop: "28px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  navItem: {
    width: "100%",
    border: "none",
    background: "transparent",
    padding: "10px 12px",
    borderRadius: "12px",
    display: "flex",
    gap: "8px",
    cursor: "pointer",
    fontSize: "14px",
    color: "#374151",
    textAlign: "left",
  },
  navItemActive: {
    background: "#EFF6FF",
    color: "#1D4ED8",
    fontWeight: 700,
  },
  sidebarCard: {
    marginTop: "auto",
    background: "#F8FAFC",
    borderRadius: "18px",
    padding: "16px",
  },
  sidebarCardTitle: {
    margin: 0,
    fontWeight: 700,
  },
  sidebarCardText: {
    margin: "8px 0 0",
    color: "#6B7280",
    fontSize: "13px",
  },
  progressTrack: {
    height: "8px",
    borderRadius: "999px",
    background: "#E5E7EB",
    marginTop: "12px",
  },
  progressBar: {
    width: "70%",
    height: "8px",
    borderRadius: "999px",
    background: "#2563EB",
  },
  main: {
    flex: 1,
    padding: "32px 36px",
    overflow: "auto",
  },
  mainMobile: {
    width: "100%",
    minHeight: "100vh",
    padding: "20px 16px 32px",
    overflow: "auto",
    boxSizing: "border-box",
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "28px",
  },
  topbarMobile: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    gap: "12px",
  },
  eyebrow: {
    margin: "0 0 6px",
    color: "#2563EB",
    fontSize: "13px",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  pageTitle: {
    margin: 0,
    fontSize: "32px",
  },
  pageTitleMobile: {
    margin: 0,
    fontSize: "24px",
  },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr",
    gap: "18px",
  },
  heroGridMobile: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "14px",
  },
  heroCard: {
    background: "linear-gradient(135deg, #1E3A8A, #2563EB)",
    color: "white",
    borderRadius: "28px",
    padding: "32px",
  },
  heroTitle: {
    margin: "0 0 12px",
    fontSize: "30px",
    lineHeight: 1.15,
  },
  heroTitleMobile: {
    margin: "0 0 12px",
    fontSize: "24px",
    lineHeight: 1.2,
  },
  heroText: {
    color: "#DBEAFE",
    lineHeight: 1.7,
    maxWidth: "680px",
  },
  statCard: {
    background: "white",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },
  statValue: {
    margin: "16px 0 0",
    fontSize: "32px",
  },
  sectionHeader: {
    marginTop: "34px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "26px",
  },
  meetingList: {
    marginTop: "18px",
    display: "grid",
    gap: "16px",
  },
  emptyState: {
    marginTop: "18px",
    background: "white",
    borderRadius: "24px",
    padding: "32px",
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },
  emptyIcon: {
    width: "56px",
    height: "56px",
    borderRadius: "18px",
    background: "#EFF6FF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
    fontSize: "28px",
  },
  emptyTitle: {
    margin: "0 0 8px",
    fontSize: "20px",
  },
  meetingCard: {
    border: "none",
    background: "white",
    borderRadius: "22px",
    padding: "22px",
    display: "flex",
    justifyContent: "space-between",
    textAlign: "left",
    cursor: "pointer",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },
  meetingTitle: {
    margin: "0 0 6px",
    fontSize: "19px",
  },
  meetingSummary: {
    margin: "12px 0 0",
    color: "#4B5563",
  },
  statusPill: {
    height: "fit-content",
    background: "#DBEAFE",
    color: "#1D4ED8",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 800,
  },
  mutedText: {
    color: "#6B7280",
    margin: 0,
    lineHeight: 1.6,
  },
  centerPanel: {
    minHeight: "calc(100vh - 150px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  formCard: {
    width: "560px",
    background: "white",
    borderRadius: "28px",
    padding: "32px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  },
  label: {
    display: "block",
    marginTop: "20px",
    marginBottom: "8px",
    fontWeight: 700,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #D1D5DB",
    borderRadius: "14px",
    padding: "14px 16px",
    fontSize: "15px",
    outline: "none",
  },
  buttonRow: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: "24px",
  },
  primaryButton: {
    background: "#2563EB",
    color: "white",
    border: "none",
    padding: "13px 18px",
    borderRadius: "14px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: 700,
  },
  primaryButtonLarge: {
    background: "white",
    color: "#1D4ED8",
    border: "none",
    padding: "14px 20px",
    borderRadius: "14px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: 800,
    marginTop: "14px",
  },
  secondaryButton: {
    background: "#F3F4F6",
    color: "#111827",
    border: "none",
    padding: "13px 18px",
    borderRadius: "14px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: 700,
  },
  ghostButton: {
    background: "transparent",
    color: "#2563EB",
    border: "none",
    cursor: "pointer",
    fontWeight: 800,
  },
  dangerButton: {
    width: "100%",
    background: "#DC2626",
    color: "white",
    border: "none",
    padding: "16px 20px",
    borderRadius: "16px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: 800,
    marginTop: "28px",
  },
  recordingLayout: {
    display: "grid",
    gridTemplateColumns: "1.1fr 0.9fr",
    gap: "24px",
  },
  recordingLayoutMobile: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "16px",
  },
  recordingCard: {
    background: "white",
    borderRadius: "30px",
    padding: "36px",
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  },
  timer: {
    margin: "24px 0",
    fontSize: "48px",
    fontWeight: 900,
  },
  micOuter: {
    width: "190px",
    height: "190px",
    borderRadius: "999px",
    background: "#DBEAFE",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto",
  },
  micInner: {
    width: "112px",
    height: "112px",
    borderRadius: "999px",
    background: "#2563EB",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
  },
  waveform: {
    height: "74px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
    marginTop: "28px",
  },
  waveBar: {
    width: "6px",
    borderRadius: "999px",
    background: "#60A5FA",
  },
  transcriptPanel: {
    background: "white",
    borderRadius: "30px",
    padding: "28px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  },
  transcriptLine: {
    background: "#F8FAFC",
    borderRadius: "14px",
    padding: "14px",
    color: "#374151",
    lineHeight: 1.7,
  },
  resultText: {
    color: "#374151",
    lineHeight: 1.8,
    whiteSpace: "pre-wrap",
    margin: 0,
  },
  resultSection: {
    marginTop: "18px",
  },
  resultSectionTitle: {
    margin: "0 0 8px",
    fontSize: "15px",
  },
  processingCard: {
    width: "520px",
    background: "white",
    borderRadius: "28px",
    padding: "40px",
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  },
  spinner: {
    width: "58px",
    height: "58px",
    borderRadius: "999px",
    border: "7px solid #DBEAFE",
    borderTopColor: "#2563EB",
    margin: "0 auto 24px",
  },
  summaryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "20px",
    marginBottom: "22px",
  },
  summaryHeaderMobile: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    marginBottom: "18px",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "18px",
  },
  summaryGridMobile: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "14px",
  },
  audioPlayer: {
    width: "100%",
    marginTop: "8px",
  },
  errorText: {
    marginTop: "14px",
    background: "#FEF2F2",
    color: "#B91C1C",
    borderRadius: "14px",
    padding: "12px 14px",
    lineHeight: 1.6,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    zIndex: 1000,
  },
  modalCard: {
    width: "100%",
    maxWidth: "460px",
    background: "white",
    borderRadius: "28px",
    padding: "28px",
    boxShadow: "0 24px 80px rgba(15, 23, 42, 0.25)",
  },
  modalIcon: {
    width: "56px",
    height: "56px",
    borderRadius: "18px",
    background: "#EFF6FF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "28px",
    marginBottom: "16px",
  },
  modalTitle: {
    margin: "0 0 10px",
    fontSize: "26px",
  },
  modalText: {
    color: "#4B5563",
    lineHeight: 1.7,
    margin: 0,
  },
  modalHint: {
    marginTop: "16px",
    background: "#F8FAFC",
    color: "#475569",
    borderRadius: "16px",
    padding: "14px",
    lineHeight: 1.6,
    fontSize: "14px",
  },
  card: {
    background: "white",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
  },
  cardTitle: {
    margin: "0 0 16px",
    fontSize: "20px",
  },
  summaryList: {
    margin: 0,
    paddingLeft: "20px",
    color: "#374151",
    lineHeight: 1.9,
  },
}

export default App