
import { useEffect, useMemo, useRef, useState } from "react"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"


function App() {
  const [screen, setScreen] = useState("home")
  const [meetingTitle, setMeetingTitle] = useState("")
  const [meetings, setMeetings] = useState([])
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingStatus, setRecordingStatus] = useState("idle")
  const [audioUrl, setAudioUrl] = useState("")
  const [audioBlob, setAudioBlob] = useState(null)
  const [recordingError, setRecordingError] = useState("")
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const [lastRecordedMeeting, setLastRecordedMeeting] = useState(null)
  const [transcript, setTranscript] = useState("")
  const [summary, setSummary] = useState("")
  const [actionItems, setActionItems] = useState([])
  const [decisions, setDecisions] = useState([])
  const [processingStatus, setProcessingStatus] = useState("idle")
  const [apiError, setApiError] = useState("")
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)
  const recordingSecondsRef = useRef(0)
  const isMobile = window.innerWidth < 768

  const pageTitle = useMemo(() => {
    if (screen === "home") return "Dashboard"
    if (screen === "setup") return "New Meeting"
    if (screen === "recording") return "Recording"
    if (screen === "processing") return "AI Processing"
    if (screen === "summary") return "Meeting Summary"
    return "Dashboard"
  }, [screen])

  function startMeeting() {
    setShowPermissionModal(true)
  }

  async function requestMicrophoneAndStartRecording() {
    try {
      setShowPermissionModal(false)
      setRecordingError("")
      setApiError("")
      setTranscript("")
      setSummary("")
      setActionItems([])
      setDecisions([])
      setAudioUrl("")
      setAudioBlob(null)
      setRecordingSeconds(0)
      recordingSecondsRef.current = 0
      audioChunksRef.current = []

      if (!navigator.mediaDevices?.getUserMedia) {
        setRecordingError("目前瀏覽器或連線環境不支援麥克風錄音。若使用手機測試，請改用 HTTPS 或 localhost 環境。")
        setScreen("setup")
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType =
        MediaRecorder.isTypeSupported("audio/mp4")
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
        const recordedBlob = new Blob(audioChunksRef.current, { type: mimeType || "audio/mp4" })
        const url = URL.createObjectURL(recordedBlob)
        const meeting = {
          title: meetingTitle.trim() || "Untitled Meeting",
          date: new Date().toLocaleDateString("zh-TW"),
          durationSeconds: recordingSecondsRef.current,
        }

        setAudioBlob(recordedBlob)
        setAudioUrl(url)
        setLastRecordedMeeting(meeting)
        stream.getTracks().forEach((track) => track.stop())

        await uploadRecordingForAi(recordedBlob, meeting, mimeType)
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
      setRecordingError("麥克風授權失敗，請確認瀏覽器已允許此網站使用麥克風。")
      setScreen("setup")
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
    setProcessingStatus("uploading")
    setScreen("processing")
  }

  async function uploadRecordingForAi(recordedBlob, meeting, mimeType) {
    try {
      setProcessingStatus("uploading")

      const fileExtension = getAudioFileExtension(mimeType)
      const formData = new FormData()
      formData.append("file", recordedBlob, `meeting-${Date.now()}.${fileExtension}`)
      formData.append("title", meeting.title)

      setProcessingStatus("transcribing")

      const response = await fetch(`${API_BASE_URL}/meetings/transcribe-summary`, {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || "Failed to generate transcript and summary.")
      }

      setProcessingStatus("summarizing")

      const result = await response.json()
      const parsedResult = normalizeMeetingResult(result)

      setTranscript(parsedResult.transcript)
      setSummary(parsedResult.summary)
      setActionItems(parsedResult.actionItems)
      setDecisions(parsedResult.decisions)
      setLastRecordedMeeting({
        ...meeting,
        id: result.meeting_id || Date.now(),
        transcript: parsedResult.transcript,
        summary: parsedResult.summary,
        actionItems: parsedResult.actionItems,
        decisions: parsedResult.decisions,
        status: "AI Generated",
      })
      setProcessingStatus("completed")
      setScreen("summary")
    } catch (error) {
      console.error(error)
      setApiError("AI processing failed. The recording was saved locally, but transcript and summary were not generated.")
      setProcessingStatus("failed")
      setScreen("summary")
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
      }

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl])

  return (
    <div style={styles.appShell}>
      <aside style={isMobile ? styles.sidebarMobileHidden : styles.sidebar}>
        <div style={styles.logoBlock}>
          <div style={styles.logoIcon}>AI</div>
          <div>
            <h2 style={styles.logoTitle}>AI Meeting</h2>
            <p style={styles.logoSubtitle}>Assistant</p>
          </div>
        </div>

        <nav style={styles.navList}>
          <NavItem active={screen === "home"} icon="🏠" label="Dashboard" onClick={() => setScreen("home")} />
          <NavItem active={screen === "setup"} icon="🎙️" label="New Meeting" onClick={() => setScreen("setup")} />
          <NavItem active={false} icon="📄" label="Transcripts" />
          <NavItem active={false} icon="⚙️" label="Settings" />
        </nav>

        <div style={styles.sidebarCard}>
          <p style={styles.sidebarCardTitle}>MVP Progress</p>
          <div style={styles.progressTrack}>
            <div style={styles.progressBar} />
          </div>
          <p style={styles.sidebarCardText}>UI Flow · Recording · Summary</p>
        </div>
      </aside>

      <main style={isMobile ? styles.mainMobile : styles.main}>
        <header style={isMobile ? styles.topbarMobile : styles.topbar}>
          <div>
            <p style={styles.eyebrow}>Web Version</p>
            <h1 style={isMobile ? styles.pageTitleMobile : styles.pageTitle}>{pageTitle}</h1>
          </div>

          <button style={styles.primaryButton} onClick={() => setScreen("setup")}>
            + New Meeting
          </button>
        </header>

        {screen === "home" && (
          <HomeScreen
            meetings={meetings}
            onNewMeeting={() => setScreen("setup")}
            onOpenMeeting={(meeting) => {
              setMeetingTitle(meeting.title)
              setLastRecordedMeeting(meeting)
              setAudioUrl(meeting.audioUrl || "")
              setTranscript(meeting.transcript || "")
              setSummary(meeting.summary || "")
              setActionItems(meeting.actionItems || [])
              setDecisions(meeting.decisions || [])
              setApiError("")
              setRecordingSeconds(meeting.durationSeconds || 0)
              setScreen("summary")
            }}
          />
        )}

        {screen === "setup" && (
          <SetupScreen
            meetingTitle={meetingTitle}
            setMeetingTitle={setMeetingTitle}
            recordingError={recordingError}
            onCancel={() => setScreen("home")}
            onStart={startMeeting}
          />
        )}

        {screen === "recording" && (
          <RecordingScreen
            meetingTitle={meetingTitle}
            recordingSeconds={recordingSeconds}
            recordingStatus={recordingStatus}
            onStop={stopRecording}
          />
        )}

        {screen === "processing" && <ProcessingScreen processingStatus={processingStatus} />}

        {screen === "summary" && (
          <SummaryScreen
            meeting={lastRecordedMeeting}
            recordingSeconds={recordingSeconds}
            audioUrl={audioUrl}
            transcript={transcript}
            summary={summary}
            actionItems={actionItems}
            decisions={decisions}
            apiError={apiError}
            onBackHome={() => {
              if (lastRecordedMeeting) {
                setMeetings((currentMeetings) => {
                  const alreadySaved = currentMeetings.some((meeting) => meeting.id === lastRecordedMeeting.id)
                  if (alreadySaved) return currentMeetings

                  return [
                    {
                      ...lastRecordedMeeting,
                      id: lastRecordedMeeting.id || Date.now(),
                      audioUrl,
                      transcript,
                      summary,
                      actionItems,
                      decisions,
                      status: summary || transcript ? "AI Generated" : "Recorded",
                    },
                    ...currentMeetings,
                  ]
                })
              }
              setScreen("home")
            }}
            onRecordAgain={startMeeting}
          />
        )}
      </main>

      {showPermissionModal && (
        <PermissionModal
          onCancel={() => setShowPermissionModal(false)}
          onConfirm={requestMicrophoneAndStartRecording}
        />
      )}
    </div>
  )
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      style={{
        ...styles.navItem,
        ...(active ? styles.navItemActive : {}),
      }}
      onClick={onClick}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function PermissionModal({ onCancel, onConfirm }) {
  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalCard}>
        <div style={styles.modalIcon}>🎙️</div>
        <p style={styles.eyebrow}>Microphone Permission</p>
        <h2 style={styles.modalTitle}>允許使用麥克風</h2>
        <p style={styles.modalText}>
          開始錄音前，瀏覽器會跳出麥克風授權通知。請選擇「允許」，這樣才能錄製會議音訊並產生逐字稿。
        </p>
        <div style={styles.modalHint}>
          手機測試若沒有跳出授權視窗，通常是因為目前網址不是 HTTPS。建議先用電腦 localhost 測試，或之後部署到 HTTPS 網址。
        </div>
        <div style={styles.buttonRow}>
          <button style={styles.secondaryButton} onClick={onCancel}>Cancel</button>
          <button style={styles.primaryButton} onClick={onConfirm}>Allow Microphone</button>
        </div>
      </div>
    </div>
  )
}

function HomeScreen({ meetings, onNewMeeting, onOpenMeeting }) {
  return (
    <section>
      <div style={window.innerWidth < 768 ? styles.heroGridMobile : styles.heroGrid}>
        <div style={styles.heroCard}>
          <p style={styles.eyebrow}>AI Copilot</p>
          <h2 style={window.innerWidth < 768 ? styles.heroTitleMobile : styles.heroTitle}>Record, transcribe, and summarize meetings in one place.</h2>
          <p style={styles.heroText}>
            Record meeting audio first. Transcript and AI summary will be generated after the backend is connected.
          </p>
          <button style={styles.primaryButtonLarge} onClick={onNewMeeting}>
            Start New Meeting
          </button>
        </div>

        <StatCard label="Saved Meetings" value={meetings.length.toString()} />
        <StatCard label="AI Summaries" value="Pending" />
        <StatCard label="Backend" value="Next" />
      </div>

      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>Recent Meetings</h2>
        <button style={styles.ghostButton}>View All</button>
      </div>

      {meetings.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>🎙️</div>
          <h3 style={styles.emptyTitle}>No meetings yet</h3>
          <p style={styles.mutedText}>Start your first recording to create a meeting record.</p>
          <button style={styles.primaryButton} onClick={onNewMeeting}>Create First Meeting</button>
        </div>
      ) : (
        <div style={styles.meetingList}>
          {meetings.map((meeting) => (
            <button key={meeting.id} style={styles.meetingCard} onClick={() => onOpenMeeting(meeting)}>
              <div>
                <h3 style={styles.meetingTitle}>{meeting.title}</h3>
                <p style={styles.mutedText}>{meeting.date} · {formatDuration(meeting.durationSeconds || 0)}</p>
                <p style={styles.meetingSummary}>{meeting.summary || "Audio recording saved."}</p>
              </div>
              <span style={styles.statusPill}>{meeting.status}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function SetupScreen({ meetingTitle, setMeetingTitle, recordingError, onCancel, onStart }) {
  return (
    <section style={styles.centerPanel}>
      <div style={styles.formCard}>
        <p style={styles.eyebrow}>Step 1</p>
        <h2 style={styles.sectionTitle}>Setup Meeting</h2>
        <p style={styles.mutedText}>Fill in basic meeting information before recording.</p>
        {recordingError && <p style={styles.errorText}>{recordingError}</p>}

        <label style={styles.label}>Meeting Title</label>
        <input
          style={styles.input}
          value={meetingTitle}
          onChange={(event) => setMeetingTitle(event.target.value)}
          placeholder="Enter meeting title"
        />

        <label style={styles.label}>Participants</label>
        <input style={styles.input} placeholder="Optional" />

        <label style={styles.label}>Language</label>
        <select style={styles.input} defaultValue="zh-TW">
          <option value="zh-TW">繁體中文</option>
          <option value="en">English</option>
          <option value="mixed">Chinese + English</option>
        </select>

        <div style={styles.buttonRow}>
          <button style={styles.secondaryButton} onClick={onCancel}>Cancel</button>
          <button style={styles.primaryButton} onClick={onStart}>Start Recording</button>
        </div>
      </div>
    </section>
  )
}

function RecordingScreen({ meetingTitle, recordingSeconds, recordingStatus, onStop }) {
  const formattedTime = formatDuration(recordingSeconds)

  return (
    <section style={window.innerWidth < 768 ? styles.recordingLayoutMobile : styles.recordingLayout}>
      <div style={styles.recordingCard}>
        <p style={styles.eyebrow}>Live Recording</p>
        <h2 style={styles.sectionTitle}>{meetingTitle}</h2>
        <p style={styles.timer}>{formattedTime}</p>
        <p style={styles.mutedText}>{recordingStatus === "recording" ? "Microphone is recording now." : "Preparing audio..."}</p>

        <div style={styles.micOuter}>
          <div style={styles.micInner}>REC</div>
        </div>

        <div style={styles.waveform}>
          {Array.from({ length: 28 }).map((_, index) => (
            <span
              key={index}
              style={{
                ...styles.waveBar,
                height: `${18 + (index % 7) * 8}px`,
              }}
            />
          ))}
        </div>

        <button style={styles.dangerButton} onClick={onStop}>Stop Recording</button>
      </div>

      <div style={styles.transcriptPanel}>
        <h3 style={styles.cardTitle}>Live Transcript Preview</h3>
        <p style={styles.mutedText}>Live transcript will appear here after the speech-to-text backend is connected.</p>
      </div>
    </section>
  )
}

function ProcessingScreen({ processingStatus }) {
  const statusText = {
    uploading: "Uploading audio...",
    transcribing: "Transcribing meeting audio...",
    summarizing: "Generating AI summary...",
    completed: "Finalizing result...",
    failed: "Processing failed.",
  }

  return (
    <section style={styles.centerPanel}>
      <div style={styles.processingCard}>
        <div style={styles.spinner} />
        <h2 style={styles.sectionTitle}>Processing your meeting</h2>
        <p style={styles.mutedText}>{statusText[processingStatus] || "Preparing audio..."}</p>
      </div>
    </section>
  )
}

function SummaryScreen({ meeting, recordingSeconds, audioUrl, transcript, summary, actionItems, decisions, apiError, onBackHome, onRecordAgain }) {
  const title = meeting?.title || "Untitled Meeting"
  const date = meeting?.date || new Date().toLocaleDateString("zh-TW")
  return (
    <section>
      <div style={window.innerWidth < 768 ? styles.summaryHeaderMobile : styles.summaryHeader}>
        <div>
          <p style={styles.eyebrow}>Generated Summary</p>
          <h2 style={styles.sectionTitle}>{title}</h2>
          <p style={styles.mutedText}>{date} · {formatDuration(recordingSeconds)} · Recording saved</p>
          {apiError && <p style={styles.errorText}>{apiError}</p>}
        </div>

        <div style={styles.buttonRow}>
          <button style={styles.secondaryButton} onClick={onRecordAgain}>Record Again</button>
          <button style={styles.primaryButton} onClick={onBackHome}>Save Summary</button>
        </div>
      </div>

      <div style={window.innerWidth < 768 ? styles.summaryGridMobile : styles.summaryGrid}>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Audio Playback</h3>
          {audioUrl ? (
            <audio style={styles.audioPlayer} controls src={audioUrl} />
          ) : (
            <p style={styles.mutedText}>No recording available yet.</p>
          )}
        </div>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Transcript</h3>
          {transcript ? (
            <p style={styles.resultText}>{transcript}</p>
          ) : (
            <p style={styles.mutedText}>Transcript is not generated yet.</p>
          )}
        </div>
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>AI Summary</h3>
          {summary ? (
            <p style={styles.resultText}>{summary}</p>
          ) : (
            <p style={styles.mutedText}>AI summary is not generated yet.</p>
          )}

          {actionItems.length > 0 && (
            <div style={styles.resultSection}>
              <h4 style={styles.resultSectionTitle}>Action Items</h4>
              <ul style={styles.summaryList}>
                {actionItems.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {decisions.length > 0 && (
            <div style={styles.resultSection}>
              <h4 style={styles.resultSectionTitle}>Decisions</h4>
              <ul style={styles.summaryList}>
                {decisions.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0")
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
    summary:
      typeof summaryValue === "string"
        ? summaryValue
        : summaryObject.summary || summaryObject.overview || "",
    actionItems:
      result.action_items ||
      result.actionItems ||
      summaryObject.action_items ||
      summaryObject.actionItems ||
      [],
    decisions:
      result.decisions ||
      summaryObject.decisions ||
      [],
  }
}

function StatCard({ label, value }) {
  return (
    <div style={styles.statCard}>
      <p style={styles.mutedText}>{label}</p>
      <h2 style={styles.statValue}>{value}</h2>
    </div>
  )
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