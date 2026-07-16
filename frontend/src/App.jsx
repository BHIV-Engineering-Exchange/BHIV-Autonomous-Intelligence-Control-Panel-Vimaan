import React, { useEffect, useState, useRef } from "react";
import PCDashboard from "./components/PCDashboard";
import PhoneHUD from "./components/PhoneHUD";
import PhoneTelemetry from "./components/PhoneTelemetry";
import TabletPlanner from "./components/TabletPlanner";
import SensorsIngestion from "./components/SensorsIngestion";
import { 
  Laptop, Phone, Monitor, Info, Check, Wifi, WifiOff, 
  Database, RefreshCw, Power, Circle, HelpCircle, Activity
} from "lucide-react";

// Default telemetry schema matching the simulator structure
const initialTelemetry = {
  connected: false,
  armed: false,
  flight_mode: "DISCONNECTED",
  telemetry: {
    battery: 100,
    voltage: 25.2,
    current: 0.0,
    altitude: 0.0,
    speed: 0.0,
    heading: 0,
    roll: 0.0,
    pitch: 0.0,
    gps: { lat: 15.4989, lon: 73.8278, fix: "No Fix", satellites: 0 },
    rc_signal: "None",
    link_quality: 0,
    vertical_speed: 0.0,
    distance_to_home: 0.0
  },
  system_health: { fcu: "OFFLINE", gps: "OFFLINE", sensors: "OFFLINE", motors: "OFFLINE", battery: "OFFLINE", link: "OFFLINE" },
  mission_status: { active: false, waypoints_count: 0, current_waypoint: 0, progress_pct: 0, elapsed_time: "00:00", est_time_left: "00:00" },
  logs: [],
  alerts: []
};

export default function App() {
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [activeTab, setActiveTab] = useState("pc"); // pc, phone-hud, phone-telemetry, tablet
  
  // Connection state controls
  const [connType, setConnType] = useState("sim");
  const [connStr, setConnStr] = useState("udp:127.0.0.1:14540");
  const [connecting, setConnecting] = useState(false);
  
  // Record/Replay state controls
  const [isRecording, setIsRecording] = useState(false);
  const [recordings, setRecordings] = useState([]);
  const [selectedRecording, setSelectedRecording] = useState("");
  const [replayActive, setReplayActive] = useState(false);
  const [toasts, setToasts] = useState([]);
  
  const wsRef = useRef(null);

  // 1. WebSocket handler for live telemetry streaming
  useEffect(() => {
    let socket;
    const connectWS = () => {
      socket = new WebSocket("ws://localhost:8000/ws/telemetry");
      wsRef.current = socket;

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setTelemetry(data);
        if (data.replay_mode !== undefined) {
          setReplayActive(data.replay_mode);
        }
      };

      socket.onclose = () => {
        console.warn("WebSocket closed. Attempting reconnect...");
        setTimeout(connectWS, 1500);
      };
    };

    connectWS();
    
    // Initial fetch of files
    fetchRecordings();

    return () => {
      if (socket) socket.close();
    };
  }, []);

  // 2. Fetch past recordings
  const fetchRecordings = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/replay/list");
      const data = await res.json();
      setRecordings(data);
    } catch (err) {
      console.error("Failed to load recordings: ", err);
    }
  };

  // 3. Command dispatcher
  const sendCommand = async (command, params = null) => {
    try {
      const res = await fetch("http://localhost:8000/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, params })
      });
      const data = await res.json();
      if (!res.ok) {
        // Show backend error (e.g. "Cannot send commands during replay playback.")
        const detail = data.detail || "Command rejected by autopilot.";
        showToast(`⚠️ ${command}: ${detail}`, "warning");
        return false;
      }
      if (data.status === "failed") {
        showToast(`❌ ${command} failed — autopilot rejected.`, "error");
        return false;
      }
      showToast(`✅ ${command} sent`, "success");
      return true;
    } catch (err) {
      console.error("Failed to send command: ", err);
      showToast(`❌ ${command} failed — no connection.`, "error");
      return false;
    }
  };

  // Toast notification helper
  const showToast = (msg, type = "info") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };


  // 4. Mission uploader & executor
  const uploadMission = async (waypoints) => {
    try {
      // Upload waypoints
      const res = await fetch("http://localhost:8000/api/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waypoints })
      });
      const data = await res.json();
      if (data.status === "success") {
        // Trigger mission start command
        return await sendCommand("START_MISSION");
      }
      return false;
    } catch (err) {
      console.error("Failed to upload mission: ", err);
      return false;
    }
  };

  // 5. Connect to Sim / MAVLink Autopilot
  const handleConnect = async () => {
    setConnecting(true);
    try {
      if (telemetry.connected) {
        const res = await fetch("http://localhost:8000/api/disconnect", { method: "POST" });
        await res.json();
      } else {
        const res = await fetch("http://localhost:8000/api/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connection_type: connType, connection_str: connStr })
        });
        await res.json();
      }
      setConnecting(false);
      setReplayActive(false);
    } catch (err) {
      console.error("Connector error: ", err);
      setConnecting(false);
      alert("Autopilot connection failed. Verify address or simulation setup.");
    }
  };

  // 6. Record start/stop
  const startRecording = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/replay/record/start", { method: "POST" });
      const data = await res.json();
      if (data.status === "recording") {
        setIsRecording(true);
        fetchRecordings();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const stopRecording = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/replay/record/stop", { method: "POST" });
      const data = await res.json();
      if (data.status === "idle") {
        setIsRecording(false);
        fetchRecordings();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 7. Replay playback loading
  const startReplay = async (filename) => {
    if (!filename) return;
    try {
      const res = await fetch("http://localhost:8000/api/replay/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
      });
      const data = await res.json();
      if (data.status === "playing") {
        setReplayActive(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const stopReplay = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/replay/stop", { method: "POST" });
      const data = await res.json();
      if (data.status === "live") {
        setReplayActive(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="app-container">
      {/* Dynamic Header */}
      <header className="main-header">
        <div className="logo-section">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="var(--color-cyan)"/>
            <path d="M2 17L12 22L22 17" stroke="var(--color-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="var(--color-cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="logo-text">BHIV <span className="logo-sub">C2 PANEL</span></span>
        </div>

        {/* View Switch Tabs */}
        <div className="view-tabs">
          <button className={`view-tab ${activeTab === "pc" ? "active" : ""}`} onClick={() => setActiveTab("pc")}>
            <Monitor size={14} /> PC Dashboard
          </button>
          <button className={`view-tab ${activeTab === "phone-hud" ? "active" : ""}`} onClick={() => setActiveTab("phone-hud")}>
            <Phone size={14} /> FPV View
          </button>
          <button className={`view-tab ${activeTab === "phone-telemetry" ? "active" : ""}`} onClick={() => setActiveTab("phone-telemetry")}>
            <Laptop size={14} /> Mobile Status
          </button>
          <button className={`view-tab ${activeTab === "tablet" ? "active" : ""}`} onClick={() => setActiveTab("tablet")}>
            <Laptop size={14} /> Tablet Planner
          </button>
          <button className={`view-tab ${activeTab === "sensors" ? "active" : ""}`} onClick={() => setActiveTab("sensors")}>
            <Activity size={14} /> Sensors & Ingestion
          </button>
        </div>

        {/* Autopilot connection settings panel */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          
          {/* Autopilot Select Type */}
          <select 
            value={connType} 
            onChange={(e) => setConnType(e.target.value)}
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              color: "#fff",
              border: "1px solid var(--panel-border)",
              borderRadius: "4px",
              padding: "4px 8px",
              fontSize: "12px",
              cursor: "pointer"
            }}
          >
            <option value="sim">Telemetry Sim</option>
            <option value="mavlink">MAVLink (PX4)</option>
            <option value="ros2">ROS2 (Bridge)</option>
          </select>

          {connType === "mavlink" && (
            <input 
              type="text" 
              value={connStr} 
              onChange={(e) => setConnStr(e.target.value)} 
              placeholder="udp:127.0.0.1:14540"
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                color: "#fff",
                border: "1px solid var(--panel-border)",
                borderRadius: "4px",
                padding: "4px 8px",
                fontSize: "12px",
                width: "140px"
              }}
            />
          )}

          <button 
            onClick={handleConnect}
            disabled={connecting}
            style={{
              background: telemetry.connected ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)",
              color: telemetry.connected ? "var(--color-red)" : "var(--color-green)",
              border: `1px solid ${telemetry.connected ? "rgba(239, 68, 68, 0.4)" : "rgba(16, 185, 129, 0.4)"}`,
              padding: "4px 10px",
              borderRadius: "4px",
              fontSize: "12px",
              cursor: "pointer",
              fontWeight: "600",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            <Power size={12} /> {connecting ? "Loading..." : telemetry.connected ? "Disconnect" : "Connect"}
          </button>

          {/* Replay Controls Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "10px", borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: "12px" }}>
            {replayActive ? (
              <button 
                onClick={stopReplay}
                style={{
                  background: "var(--color-red)",
                  color: "#fff",
                  border: "none",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  cursor: "pointer"
                }}
              >
                Stop Replay
              </button>
            ) : (
              <>
                <select 
                  value={selectedRecording} 
                  onChange={(e) => {
                    setSelectedRecording(e.target.value);
                    startReplay(e.target.value);
                  }}
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    color: "#fff",
                    border: "1px solid var(--panel-border)",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    fontSize: "12px",
                    width: "120px",
                    cursor: "pointer"
                  }}
                >
                  <option value="">Flight Replay</option>
                  {recordings.map((rec) => (
                    <option key={rec.filename} value={rec.filename}>
                      {rec.date} ({(rec.size_bytes / 1024).toFixed(1)}k)
                    </option>
                  ))}
                </select>
                <button 
                  onClick={fetchRecordings} 
                  style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
                  title="Refresh recordings list"
                >
                  <RefreshCw size={12} />
                </button>
              </>
            )}
            
            {/* Record Telemetry Toggle indicator */}
            {!replayActive && (
              <button 
                onClick={isRecording ? stopRecording : startRecording}
                style={{
                  background: isRecording ? "rgba(239, 68, 68, 0.15)" : "transparent",
                  color: isRecording ? "var(--color-red)" : "var(--text-muted)",
                  border: isRecording ? "1px solid var(--color-red)" : "1px solid var(--panel-border)",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <Circle size={10} fill={isRecording ? "var(--color-red)" : "transparent"} />
                {isRecording ? "Recording" : "Record Logs"}
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Always-mounted tabs — hidden with display:none to preserve state */}
      <div className="view-content">
        <div style={{ display: activeTab === "pc" ? "contents" : "none" }}>
          <PCDashboard telemetry={telemetry} sendCommand={sendCommand} isActive={activeTab === "pc"} />
        </div>
        <div style={{ display: activeTab === "phone-hud" ? "contents" : "none" }}>
          <PhoneHUD
            telemetry={telemetry}
            sendCommand={sendCommand}
            startRecording={startRecording}
            stopRecording={stopRecording}
            isRecording={isRecording}
          />
        </div>
        <div style={{ display: activeTab === "phone-telemetry" ? "contents" : "none" }}>
          <PhoneTelemetry telemetry={telemetry} />
        </div>
        <div style={{ display: activeTab === "tablet" ? "contents" : "none" }}>
          <TabletPlanner uploadMission={uploadMission} isActive={activeTab === "tablet"} />
        </div>
        <div style={{ display: activeTab === "sensors" ? "contents" : "none" }}>
          <SensorsIngestion telemetry={telemetry} />
        </div>
      </div>

      {/* Toast Notifications */}
      <div style={{
        position: "fixed", bottom: "24px", right: "24px",
        display: "flex", flexDirection: "column", gap: "8px", zIndex: 9999
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: t.type === "success" ? "rgba(16,185,129,0.15)" : t.type === "error" ? "rgba(239,68,68,0.15)" : "rgba(251,191,36,0.15)",
            border: `1px solid ${t.type === "success" ? "rgba(16,185,129,0.4)" : t.type === "error" ? "rgba(239,68,68,0.4)" : "rgba(251,191,36,0.4)"}`,
            color: t.type === "success" ? "#10b981" : t.type === "error" ? "#ef4444" : "#fbbf24",
            padding: "10px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: "600",
            backdropFilter: "blur(8px)", boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
            animation: "fadeIn 0.2s ease"
          }}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
