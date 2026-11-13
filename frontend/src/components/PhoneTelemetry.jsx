import React, { useEffect, useState } from "react";
import { Compass, Battery, AlertTriangle, ShieldAlert } from "lucide-react";

export default function PhoneTelemetry({ telemetry }) {
  const [altHistory, setAltHistory] = useState([]);
  const [speedHistory, setSpeedHistory] = useState([]);
  const [vSpeedHistory, setVSpeedHistory] = useState([]);

  const state = telemetry || {};
  const t = state.telemetry || {};
  const battery = t.battery || 0;
  const voltage = t.voltage || 0;
  const current = t.current || 0;
  const alt = t.altitude || 0;
  const speed = t.speed || 0;
  const verticalSpeed = t.vertical_speed || 0;
  const heading = t.heading || 0;
  const gpsFix = t.gps?.fix || "No GPS";
  const satellites = t.gps?.satellites || 0;
  const linkQuality = t.link_quality || 0;
  const rcSignal = t.rc_signal || "None";
  const mode = state.flight_mode || "MANUAL";
  const armed = state.armed || false;

  // Update sparkline histories
  useEffect(() => {
    if (!t.altitude && !t.speed) return;

    setAltHistory(prev => [...prev.slice(-39), alt]);
    setSpeedHistory(prev => [...prev.slice(-39), speed]);
    setVSpeedHistory(prev => [...prev.slice(-39), verticalSpeed]);
  }, [alt, speed, verticalSpeed]);

  // SVG sparkline path generator
  const renderSparkline = (data, minVal = 0, maxVal = 50) => {
    if (data.length < 2) return null;
    const width = 160;
    const height = 45;
    
    // Auto-scale to data range for details
    const actualMax = Math.max(...data, maxVal);
    const actualMin = Math.min(...data, minVal);
    const range = (actualMax - actualMin) || 1;

    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - actualMin) / range) * (height - 6) - 3;
      return `${x},${y}`;
    }).join(" ");

    return (
      <svg width="100%" height="45" viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
        <polyline
          fill="none"
          stroke="var(--color-cyan)"
          strokeWidth="2"
          points={points}
          style={{ transition: "all 0.1s" }}
        />
        {/* Glow effect */}
        <polyline
          fill="none"
          stroke="var(--color-cyan)"
          strokeWidth="4"
          strokeOpacity="0.25"
          points={points}
          style={{ filter: "drop-shadow(0 0 4px var(--color-cyan))" }}
        />
      </svg>
    );
  };

  // Battery gauge dashboard circumference
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (battery / 100) * circumference;

  return (
    <div className="phone-telemetry-view">
      {/* 1. Battery Gauge & Remaining HUD */}
      <div className="glass-panel" style={{ padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <div className="card-title">Battery</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Voltage: {voltage.toFixed(1)} V</span>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Current: {current.toFixed(1)} A</span>
            <span style={{ fontSize: "14px", fontWeight: "bold", color: "var(--color-green)", marginTop: "4px" }}>
              Remaining: ~18 Min
            </span>
          </div>
        </div>
        <div className="battery-gauge-wrapper">
          <svg className="battery-ring-svg" width="120" height="120">
            <circle className="battery-ring-bg" cx="60" cy="60" r={radius} strokeWidth="8" />
            <circle 
              className="battery-ring-progress" 
              cx="60" 
              cy="60" 
              r={radius} 
              strokeWidth="8" 
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{
                stroke: battery < 20 ? "var(--color-red)" : battery < 50 ? "var(--color-orange)" : "var(--color-green)"
              }}
            />
          </svg>
          <div className="battery-gauge-text">
            <span className="battery-gauge-pct">{Math.round(battery)}%</span>
            <span className="battery-gauge-volts">{voltage.toFixed(1)}V</span>
          </div>
        </div>
      </div>

      {/* 2. Sparklines charts */}
      <div className="gauge-row">
        {/* Altitude (AGL) */}
        <div className="glass-panel sparkline-card">
          <div className="sparkline-value-row">
            <span style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: "bold", textTransform: "uppercase" }}>Altitude</span>
            <span className="sparkline-number" style={{ color: "var(--color-cyan)" }}>{alt.toFixed(1)}m</span>
          </div>
          {renderSparkline(altHistory, 0, 50)}
        </div>

        {/* Speed */}
        <div className="glass-panel sparkline-card">
          <div className="sparkline-value-row">
            <span style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: "bold", textTransform: "uppercase" }}>Speed</span>
            <span className="sparkline-number" style={{ color: "var(--color-cyan)" }}>{speed.toFixed(1)}m/s</span>
          </div>
          {renderSparkline(speedHistory, 0, 20)}
        </div>
      </div>

      <div className="gauge-row">
        {/* Vertical Speed */}
        <div className="glass-panel sparkline-card">
          <div className="sparkline-value-row">
            <span style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: "bold", textTransform: "uppercase" }}>V. Speed</span>
            <span className="sparkline-number" style={{ color: "var(--color-cyan)" }}>{verticalSpeed.toFixed(1)}m/s</span>
          </div>
          {renderSparkline(vSpeedHistory, -5, 5)}
        </div>

        {/* Dynamic Heading card */}
        <div className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: "bold", textTransform: "uppercase" }}>Heading</span>
            <div style={{ fontSize: "24px", fontWeight: "800", fontFamily: "monospace", marginTop: "4px" }}>
              {Math.round(heading)}°
            </div>
          </div>
          {/* Simple rotating compass ring */}
          <div style={{
            width: "50px", 
            height: "50px", 
            borderRadius: "50%", 
            border: "2px solid var(--panel-border)", 
            position: "relative",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}>
            <div style={{
              transform: `rotate(${-heading}deg)`,
              transition: "transform 0.1s ease-out",
              position: "absolute",
              width: "100%",
              height: "100%",
              display: "flex",
              justifyContent: "center"
            }}>
              <span style={{ fontSize: "8px", fontWeight: "bold", color: "var(--color-red)", position: "absolute", top: "2px" }}>N</span>
            </div>
            <div style={{ width: "4px", height: "4px", background: "var(--color-cyan)", borderRadius: "50%" }}></div>
          </div>
        </div>
      </div>

      {/* 3. Status list parameters */}
      <div className="glass-panel" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div className="telemetry-row">
          <span className="telemetry-label">GPS FIX</span>
          <span className="telemetry-value">{gpsFix}</span>
        </div>
        <div className="telemetry-row">
          <span className="telemetry-label">SATELLITES</span>
          <span className="telemetry-value">{satellites}</span>
        </div>
        <div className="telemetry-row">
          <span className="telemetry-label">RC SIGNAL</span>
          <span className="telemetry-value" style={{ color: rcSignal === "Strong" ? "var(--color-green)" : "var(--color-orange)" }}>
            {rcSignal}
          </span>
        </div>
        <div className="telemetry-row">
          <span className="telemetry-label">LINK QUALITY</span>
          <span className="telemetry-value">{linkQuality}%</span>
        </div>
        <div className="telemetry-row">
          <span className="telemetry-label">FLIGHT TIME</span>
          <span className="telemetry-value">12:46</span>
        </div>
        <div className="telemetry-row">
          <span className="telemetry-label">DISTANCE</span>
          <span className="telemetry-value">1.23 km</span>
        </div>
      </div>

      {/* 4. Bottom mobile ribbon */}
      <div className="glass-panel" style={{
        marginTop: "auto",
        padding: "12px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderLeft: armed ? "4px solid var(--color-green)" : "4px solid var(--color-red)"
      }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "10px", color: "var(--text-secondary)", textTransform: "uppercase" }}>FLIGHT MODE</span>
          <span style={{ fontSize: "14px", fontWeight: "800", color: "#fff" }}>{mode}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{ fontSize: "10px", color: "var(--text-secondary)", textTransform: "uppercase" }}>AUTOPILOT</span>
          <span style={{ fontSize: "14px", fontWeight: "800", color: armed ? "var(--color-green)" : "var(--color-red)" }}>
            {armed ? "ARMED" : "DISARMED"}
          </span>
        </div>
      </div>
    </div>
  );
}
