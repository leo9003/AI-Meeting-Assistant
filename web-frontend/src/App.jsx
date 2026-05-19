import { useState } from "react";

export default function App() {
  const [screen, setScreen] = useState("home");

  const renderScreen = () => {
    switch (screen) {
      case "home":
        return (
          <div style={styles.container}>
            <h1 style={styles.title}>AI Meeting Assistant</h1>
            <p style={styles.subtitle}>
              Record, transcribe, and summarize your meetings with AI.
            </p>

            <button
              style={styles.primaryButton}
              onClick={() => setScreen("recording")}
            >
              🎤 Start Recording
            </button>

            <BottomNav screen={screen} setScreen={setScreen} />
          </div>
        );

      case "recording":
        return (
          <div style={styles.container}>
            <h2>Recording...</h2>

            <div style={styles.waveBox}>
              🎙️ Recording Audio
            </div>

            <h1 style={{ marginTop: 20 }}>00:01:24</h1>

            <button
              style={styles.stopButton}
              onClick={() => setScreen("processing")}
            >
              ⏹ Stop
            </button>

            <BottomNav screen={screen} setScreen={setScreen} />
          </div>
        );

      case "processing":
        return (
          <div style={styles.container}>
            <h2>Processing your meeting...</h2>

            <div style={styles.spinner}></div>

            <div style={{ marginTop: 40 }}>
              <p>✅ Uploading audio</p>
              <p>🔄 Transcribing</p>
              <p>⚪ Generating summary</p>
            </div>

            <button
              style={styles.primaryButton}
              onClick={() => setScreen("summary")}
            >
              Continue
            </button>
          </div>
        );

      case "summary":
        return (
          <div style={styles.container}>
            <h2>Meeting Summary</h2>

            <div style={styles.card}>
              <h3>Summary</h3>
              <p>
                This meeting discussed project progress, blockers,
                and next actions.
              </p>
            </div>

            <div style={styles.card}>
              <h3>Key Points</h3>
              <ul>
                <li>Frontend UI updated</li>
                <li>Backend connected</li>
                <li>Need database integration</li>
              </ul>
            </div>

            <div style={styles.card}>
              <h3>Action Items</h3>
              <ul>
                <li>Fix deployment issue</li>
                <li>Connect PostgreSQL</li>
              </ul>
            </div>

            <button
              style={styles.primaryButton}
              onClick={() => setScreen("saved")}
            >
              Save Meeting
            </button>
          </div>
        );

      case "saved":
        return (
          <div style={styles.container}>
            <div style={{ fontSize: 80 }}>✅</div>

            <h2>Meeting Saved!</h2>

            <p>You can view it in History.</p>

            <button
              style={styles.primaryButton}
              onClick={() => setScreen("history")}
            >
              Go to History
            </button>
          </div>
        );

      case "history":
        return (
          <div style={styles.container}>
            <h2>History</h2>

            <div style={styles.historyCard}>
              <strong>Project Kickoff</strong>
              <p>2026-05-19 10:30 AM</p>
            </div>

            <div style={styles.historyCard}>
              <strong>Weekly Sync</strong>
              <p>2026-05-18 02:00 PM</p>
            </div>

            <div style={styles.historyCard}>
              <strong>Client Meeting</strong>
              <p>2026-05-17 09:00 AM</p>
            </div>

            <BottomNav screen={screen} setScreen={setScreen} />
          </div>
        );

      default:
        return null;
    }
  };

  return <div>{renderScreen()}</div>;
}

function BottomNav({ screen, setScreen }) {
  return (
    <div style={styles.nav}>
      <button
        style={screen === "home" ? styles.activeNav : styles.navButton}
        onClick={() => setScreen("home")}
      >
        Home
      </button>

      <button
        style={screen === "history" ? styles.activeNav : styles.navButton}
        onClick={() => setScreen("history")}
      >
        History
      </button>

      <button style={styles.navButton}>Settings</button>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    backgroundColor: "#f5f6fa",
    padding: "40px 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    fontFamily: "Arial, sans-serif",
  },

  title: {
    fontSize: "42px",
    fontWeight: "bold",
    marginBottom: 12,
  },

  subtitle: {
    fontSize: "18px",
    color: "#666",
    textAlign: "center",
    maxWidth: "500px",
    marginBottom: 40,
  },

  primaryButton: {
    backgroundColor: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "14px",
    padding: "16px 28px",
    fontSize: "18px",
    cursor: "pointer",
    marginTop: 20,
  },

  stopButton: {
    backgroundColor: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "999px",
    width: "120px",
    height: "120px",
    fontSize: "20px",
    cursor: "pointer",
    marginTop: 30,
  },

  waveBox: {
    width: "300px",
    height: "120px",
    backgroundColor: "#ffffff",
    borderRadius: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  },

  card: {
    backgroundColor: "white",
    width: "100%",
    maxWidth: "600px",
    padding: 24,
    borderRadius: 20,
    marginBottom: 20,
    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
  },

  historyCard: {
    width: "100%",
    maxWidth: "600px",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
  },

  nav: {
    position: "fixed",
    bottom: 20,
    display: "flex",
    gap: 12,
    backgroundColor: "white",
    padding: 12,
    borderRadius: 999,
    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
  },

  navButton: {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    padding: "10px 16px",
  },

  activeNav: {
    border: "none",
    backgroundColor: "#2563eb",
    color: "white",
    borderRadius: 999,
    cursor: "pointer",
    padding: "10px 16px",
  },

  spinner: {
    width: 70,
    height: 70,
    border: "6px solid #ddd",
    borderTop: "6px solid #2563eb",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginTop: 30,
  },
};