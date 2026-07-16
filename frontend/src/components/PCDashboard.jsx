import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { 
  Play, Pause, Home, ShieldAlert, CheckCircle, AlertTriangle, 
  Cpu, Radio, Battery, Gauge, Compass, MapPin, Video, Eye,
  Sliders, ClipboardList, Target, SlidersHorizontal
} from "lucide-react";

export default function PCDashboard({ telemetry, sendCommand, isActive }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const droneMarkerRef = useRef(null);
  const polylineRef = useRef(null);

  // Sub-tab navigation state on PC Dashboard
  const [activeSubTab, setActiveSubTab] = useState("overview"); // overview, payload, logs
  
  // Gimbal and payload mock states
  const [gimbalPitch, setGimbalPitch] = useState(0);
  const [gimbalYaw, setGimbalYaw] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [payloadReleased, setPayloadReleased] = useState(false);

  const t = telemetry.telemetry || {};
  const lat = t.gps?.lat || 15.4989;
  const lon = t.gps?.lon || 73.8278;
  const heading = t.heading || 0;

  // Re-render map when tab becomes active (fixes Leaflet blank-tile issue)
  useEffect(() => {
    if (isActive && mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current.invalidateSize(), 50);
    }
  }, [isActive]);

  // Initialize Map
  useEffect(() => {
    // Only initialize map if we are on the overview sub-tab and the container is ready
    if (activeSubTab !== "overview" || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([lat, lon], 16);

      // Dark theme map tiles
      L.tileLayer("https://{s.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19
      }).addTo(mapInstanceRef.current);

      polylineRef.current = L.polyline([], { 
        color: "#00f2fe", 
        weight: 3, 
        dashArray: "5, 10" 
      }).addTo(mapInstanceRef.current);
    } else {
      // If map instance already exists, trigger a recalculation of size
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 100);
    }
  }, [activeSubTab]);

  // Update drone position and path
  useEffect(() => {
    if (activeSubTab !== "overview" || !mapInstanceRef.current) return;

    const newPos = [lat, lon];
    
    const droneSVG = `
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="transform: rotate(${heading}deg); transition: transform 0.1s ease-out;">
        <circle cx="16" cy="16" r="6" fill="#00f2fe" stroke="#fff" stroke-width="2"/>
        <line x1="16" y1="16" x2="16" y2="4" stroke="#00f2fe" stroke-width="3"/>
        <line x1="16" y1="16" x2="4" y2="16" stroke="#fff" stroke-width="1.5"/>
        <line x1="16" y1="16" x2="28" y2="16" stroke="#fff" stroke-width="1.5"/>
        <circle cx="16" cy="4" r="3" fill="#ef4444"/>
        <circle cx="4" cy="16" r="2.5" fill="#10b981"/>
        <circle cx="28" cy="16" r="2.5" fill="#10b981"/>
      </svg>
    `;

    const customIcon = L.divIcon({
      className: "drone-map-icon",
      html: droneSVG,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    if (!droneMarkerRef.current) {
      droneMarkerRef.current = L.marker(newPos, { icon: customIcon }).addTo(mapInstanceRef.current);
    } else {
      droneMarkerRef.current.setLatLng(newPos);
      droneMarkerRef.current.setIcon(customIcon);
    }

    if (telemetry.armed && telemetry.flight_mode !== "MANUAL") {
      const currentLatLngs = polylineRef.current.getLatLngs();
      if (currentLatLngs.length === 0 || 
          Math.abs(currentLatLngs[currentLatLngs.length - 1].lat - lat) > 0.00001 ||
          Math.abs(currentLatLngs[currentLatLngs.length - 1].lng - lon) > 0.00001) {
        polylineRef.current.addLatLng(newPos);
      }
    }

    mapInstanceRef.current.panTo(newPos);
  }, [lat, lon, heading, telemetry.armed, activeSubTab]);

  const getHealthClass = (status) => {
    if (!status) return "status-value";
    status = status.toUpperCase();
    if (status === "OK") return "status-value ok";
    if (status === "WARNING") return "status-value warning";
    return "status-value fail";
  };

  const triggerPayloadDrop = () => {
    setPayloadReleased(true);
    sendCommand("CHANGE_MODE", { mode: "POSCTL" }); // Hold position on release
    alert("Payload released! Actuator triggered successfully.");
    setTimeout(() => setPayloadReleased(false), 4000);
  };

  return (
    <div className="dashboard-grid">
      {/* 1. Sidebar Panel */}
      <div className="sidebar-menu glass-panel">
        <div className="menu-list">
          <button 
            className={`menu-item ${activeSubTab === "overview" ? "active" : ""}`} 
            onClick={() => setActiveSubTab("overview")}
          >
            <Cpu size={18} /> PC Overview
          </button>
          <button 
            className={`menu-item ${activeSubTab === "payload" ? "active" : ""}`} 
            onClick={() => setActiveSubTab("payload")}
          >
            <Sliders size={18} /> Payload Control
          </button>
          <button 
            className={`menu-item ${activeSubTab === "logs" ? "active" : ""}`} 
            onClick={() => setActiveSubTab("logs")}
          >
            <ClipboardList size={18} /> Flight Logs
          </button>
        </div>
        
        <div className="drone-card glass-panel glow-cyan">
          <img 
            className="drone-graphic" 
            src="https://img.icons8.com/neon/96/quadcopter.png" 
            alt="Drone Graphic"
            onError={(e) => {
              e.target.src = "https://cdn-icons-png.flaticon.com/512/3120/3120079.png";
            }}
          />
          <div style={{ fontSize: "12px", fontWeight: "bold", color: "#fff" }}>BHIV UAV 01</div>
          <div className="drone-status-text" style={{ color: telemetry.armed ? "var(--color-green)" : "var(--color-red)" }}>
            {telemetry.armed ? "Armed & Ready" : "Disarmed"}
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
            PX4 v1.14.0 | BHIV-UAV-01
          </div>
        </div>
      </div>

      {/* 2. Central Dynamic Area */}
      <div className="center-area">
        
        {activeSubTab === "overview" && (
          <>
            {/* Map and PIP Camera overlay */}
            <div className="map-container glass-panel" ref={mapContainerRef}>
              
              {/* Picture in Picture Live Camera feed overlay */}
              {telemetry.connected && (
                <div style={{
                  position: "absolute",
                  bottom: "12px",
                  left: "12px",
                  width: "180px",
                  height: "110px",
                  borderRadius: "8px",
                  border: "2px solid var(--color-cyan)",
                  boxShadow: "0 0 15px rgba(0, 242, 254, 0.4)",
                  overflow: "hidden",
                  zIndex: 1000,
                  background: "#000"
                }}>
                  <div style={{
                    position: "absolute",
                    top: "4px",
                    left: "4px",
                    background: "rgba(8,11,17,0.8)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontSize: "8px",
                    fontWeight: "bold",
                    color: "var(--color-cyan)",
                    display: "flex",
                    alignItems: "center",
                    gap: "3px"
                  }}>
                    <Video size={10} /> PIP FPV FEED
                  </div>
                  <img 
                    src="http://localhost:8000/api/camera/stream" 
                    alt="FPV Stream Thumbnail" 
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                </div>
              )}

              {/* Status Header */}
              <div style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                background: "rgba(8, 11, 17, 0.8)",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "12px",
                border: "1px solid rgba(255,255,255,0.06)",
                zIndex: 1000,
                display: "flex",
                gap: "10px",
                alignItems: "center"
              }}>
                <span style={{ color: telemetry.connected ? "var(--color-green)" : "var(--color-red)", fontWeight: "bold" }}>
                  ● {telemetry.connected ? "Autopilot Connected" : "Autopilot Offline"}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>|</span>
                <span style={{ color: "var(--color-cyan)" }}>Mode: {telemetry.flight_mode}</span>
              </div>
            </div>

            {/* Lower cards */}
            <div className="status-cards-row">
              {/* Mission Status */}
              <div className="glass-panel" style={{ padding: "16px" }}>
                <div className="card-title">
                  <span>Mission Control</span>
                  <span style={{ color: "var(--color-cyan)" }}>Survey_01</span>
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span style={{ color: "var(--text-secondary)" }}>
                    Waypoints: {telemetry.mission_status?.current_waypoint || 0} / {telemetry.mission_status?.waypoints_count || 0}
                  </span>
                  <span style={{ color: "var(--color-cyan)" }}>
                    {telemetry.mission_status?.progress_pct || 0}%
                  </span>
                </div>

                <div className="progress-bar-container">
                  <div className="progress-fill" style={{ width: `${telemetry.mission_status?.progress_pct || 0}%` }}></div>
                </div>

                <div className="btn-row">
                  {telemetry.mission_status?.active ? (
                    <button className="btn-primary" onClick={() => sendCommand("PAUSE_MISSION")}>
                      <Pause size={14} /> Pause Mission
                    </button>
                  ) : (
                    <button className="btn-primary" onClick={() => sendCommand("START_MISSION")}>
                      <Play size={14} /> Start Mission
                    </button>
                  )}
                  
                  <button className="btn-danger" onClick={() => sendCommand("RTL")}>
                    <Home size={14} /> RTL (Return Home)
                  </button>
                </div>
              </div>

              {/* System Health */}
              <div className="glass-panel" style={{ padding: "16px" }}>
                <div className="card-title">System Health</div>
                <div className="status-grid">
                  <div className="status-cell">
                    <span className="status-label">FCU</span>
                    <span className={getHealthClass(telemetry.system_health?.fcu)}>
                      {telemetry.system_health?.fcu || "OK"}
                    </span>
                  </div>
                  <div className="status-cell">
                    <span className="status-label">GPS</span>
                    <span className={getHealthClass(telemetry.system_health?.gps)}>
                      {telemetry.system_health?.gps || "OK"}
                    </span>
                  </div>
                  <div className="status-cell">
                    <span className="status-label">Sensors</span>
                    <span className={getHealthClass(telemetry.system_health?.sensors)}>
                      {telemetry.system_health?.sensors || "OK"}
                    </span>
                  </div>
                  <div className="status-cell">
                    <span className="status-label">Motors</span>
                    <span className={getHealthClass(telemetry.system_health?.motors)}>
                      {telemetry.system_health?.motors || "OK"}
                    </span>
                  </div>
                  <div className="status-cell">
                    <span className="status-label">Battery</span>
                    <span className={getHealthClass(telemetry.system_health?.battery)}>
                      {telemetry.system_health?.battery || "OK"}
                    </span>
                  </div>
                  <div className="status-cell">
                    <span className="status-label">Link</span>
                    <span className={getHealthClass(telemetry.system_health?.link)}>
                      {telemetry.system_health?.link || "OK"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Payload Control Tab */}
        {activeSubTab === "payload" && (
          <div className="glass-panel" style={{ padding: "24px", height: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="card-title" style={{ fontSize: "16px" }}>Payload Gimbal Control & drop Actuators</div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              
              {/* Gimbal Sliders */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span>Gimbal Pitch</span>
                    <span style={{ color: "var(--color-cyan)" }}>{gimbalPitch}°</span>
                  </label>
                  <input 
                    type="range" min="-90" max="15" value={gimbalPitch} 
                    onChange={(e) => setGimbalPitch(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span>Gimbal Yaw</span>
                    <span style={{ color: "var(--color-cyan)" }}>{gimbalYaw}°</span>
                  </label>
                  <input 
                    type="range" min="-120" max="120" value={gimbalYaw} 
                    onChange={(e) => setGimbalYaw(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "13px", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span>Digital Camera Zoom</span>
                    <span style={{ color: "var(--color-cyan)" }}>{zoomLevel}x</span>
                  </label>
                  <input 
                    type="range" min="1" max="16" value={zoomLevel} 
                    onChange={(e) => setZoomLevel(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              {/* Payload Servo status */}
              <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContnet: "center", alignItems: "center", gap: "12px" }}>
                <Target size={48} color={payloadReleased ? "var(--color-red)" : "var(--color-cyan)"} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "14px", fontWeight: "bold" }}>Electro-Magnetic Release Lock</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                    Status: {payloadReleased ? "RELEASED / OPEN" : "SECURED / LOCKED"}
                  </div>
                </div>

                <button 
                  onClick={triggerPayloadDrop}
                  className="btn-danger"
                  style={{
                    padding: "10px 24px",
                    marginTop: "10px",
                    fontWeight: "bold",
                    width: "80%",
                    boxShadow: payloadReleased ? "none" : "0 0 15px rgba(239, 68, 68, 0.4)"
                  }}
                  disabled={payloadReleased}
                >
                  TRIGGER PAYLOAD DROP
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Flight Logs Tab */}
        {activeSubTab === "logs" && (
          <div className="glass-panel" style={{ padding: "24px", height: "100%", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="card-title" style={{ fontSize: "16px" }}>Autopilot System Event Logs (WebSocket Stream)</div>
            
            <div style={{
              flex: 1,
              background: "rgba(0,0,0,0.2)",
              border: "1px solid var(--panel-border)",
              borderRadius: "8px",
              padding: "16px",
              overflowY: "auto",
              fontFamily: "monospace"
            }}>
              {telemetry.logs && telemetry.logs.length > 0 ? (
                telemetry.logs.map((log, i) => (
                  <div key={i} className="log-item" style={{ fontSize: "13px", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                    <span className="log-time">[{log.timestamp}]</span>
                    <span className={`log-level ${log.level}`}>[{log.level}]</span>
                    <span style={{ color: "#fff", marginLeft: "10px" }}>{log.message}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px" }}>
                  Waiting for autopilot connection state to stream event logs...
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* 3. Telemetry Sidebar */}
      <div className="telemetry-sidebar glass-panel">
        <div className="card-title">Real-Time Telemetry</div>
        <div className="telemetry-table">
          <div className="telemetry-row">
            <span className="telemetry-label">Battery</span>
            <span className="telemetry-value" style={{ color: t.battery < 25 ? "var(--color-red)" : "var(--color-green)" }}>
              {t.battery || 0}%
            </span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-label">Voltage</span>
            <span className="telemetry-value">{t.voltage || 0} V</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-label">Current</span>
            <span className="telemetry-value">{t.current || 0} A</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-label">Altitude (AGL)</span>
            <span className="telemetry-value" style={{ color: "var(--color-cyan)" }}>
              {t.altitude || 0} m
            </span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-label">Speed</span>
            <span className="telemetry-value">{t.speed || 0} m/s</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-label">Heading</span>
            <span className="telemetry-value">{t.heading || 0}°</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-label">GPS Fix</span>
            <span className="telemetry-value">{t.gps?.fix || "No Fix"}</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-label">Satellites</span>
            <span className="telemetry-value">{t.gps?.satellites || 0}</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-label">RC Signal</span>
            <span className="telemetry-value">{t.rc_signal || "None"}</span>
          </div>
          <div className="telemetry-row">
            <span className="telemetry-label">Link Quality</span>
            <span className="telemetry-value">{t.link_quality || 0}%</span>
          </div>
        </div>

        {/* Live Alerts List */}
        <div style={{ marginTop: "16px" }}>
          <div className="card-title">System Alerts</div>
          <div style={{ maxHeight: "150px", overflowY: "auto" }}>
            {telemetry.alerts && telemetry.alerts.length > 0 ? (
              telemetry.alerts.map((alert, i) => (
                <div key={i} className="alert-item">
                  <AlertTriangle size={14} />
                  <span>{alert}</span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", padding: "10px" }}>
                No active system alerts.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
