import React, { useEffect, useRef, useState } from "react";
import { 
  Home, Compass, Layers, Lock, MapPin, 
  Settings, Camera, ShieldAlert, Circle
} from "lucide-react";

export default function PhoneHUD({ telemetry, sendCommand, startRecording, stopRecording, isRecording }) {
  const canvasRef = useRef(null);
  const streamUrl = "http://localhost:8000/api/camera/stream";
  const t = telemetry.telemetry || {};
  const [hudConnected, setHudConnected] = useState(true);

  const roll = t.roll || 0;
  const pitch = t.pitch || 0;
  const heading = t.heading || 0;
  const alt = t.altitude || 0;
  const speed = t.speed || 0;
  const battery = t.battery || 0;
  const voltage = t.voltage || 0;
  const dist = t.distance_to_home || 0;
  const gps = t.gps || {};
  const lq = t.link_quality || 0;
  const armed = telemetry.armed || false;
  const mode = telemetry.flight_mode || "MANUAL";


  // Handle shutter record click
  const handleShutterClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Handle camera snapshot click
  const handleSnapshotClick = () => {
    window.open("http://localhost:8000/api/camera/snapshot?t=" + Date.now(), "_blank");
  };

  // Canvas HUD Overlay drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let animationId;

    const drawHUD = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2;

      ctx.save();
      
      // HUD green/cyan neon style
      ctx.strokeStyle = "rgba(0, 242, 254, 0.8)";
      ctx.fillStyle = "rgba(0, 242, 254, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.font = "bold 10px monospace";

      // 1. Draw Pitch and Roll Ladder (Centered & Rotated)
      ctx.translate(cx, cy);
      ctx.rotate((-roll * Math.PI) / 180);
      
      // Draw Pitch lines
      const pitchOffset = pitch * 3.5; // Scale pitch pixels
      ctx.translate(0, pitchOffset);

      // Pitch lines loop
      for (let p = -40; p <= 40; p += 10) {
        const y = -p * 3.5;
        if (p === 0) {
          // Horizon line
          ctx.beginPath();
          ctx.moveTo(-100, y);
          ctx.lineTo(-30, y);
          ctx.moveTo(30, y);
          ctx.lineTo(100, y);
          ctx.stroke();
        } else {
          // Standard pitch marks
          ctx.beginPath();
          ctx.moveTo(-40, y);
          ctx.lineTo(-20, y);
          ctx.moveTo(20, y);
          ctx.lineTo(40, y);
          // Small ticks indicating direction to horizon
          const tickDir = p > 0 ? 5 : -5;
          ctx.lineTo(40, y + tickDir);
          ctx.moveTo(-40, y);
          ctx.lineTo(-40, y + tickDir);
          ctx.stroke();

          // Labels
          ctx.fillText(p, -55, y + 3);
          ctx.fillText(p, 45, y + 3);
        }
      }

      ctx.restore(); // Return from translated pitch/roll space

      // 2. Draw Static Central Reticle
      ctx.save();
      ctx.strokeStyle = "rgba(0, 242, 254, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Aircraft symbol
      ctx.moveTo(cx - 20, cy);
      ctx.lineTo(cx - 8, cy);
      ctx.lineTo(cx - 3, cy + 4);
      ctx.moveTo(cx + 20, cy);
      ctx.lineTo(cx + 8, cy);
      ctx.lineTo(cx + 3, cy + 4);
      // Small center dot
      ctx.arc(cx, cy, 1.5, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();

      // 3. Draw Heading Tape at the top
      ctx.save();
      ctx.fillStyle = "rgba(8, 11, 17, 0.6)";
      ctx.fillRect(cx - 150, 10, 300, 22);
      ctx.strokeStyle = "rgba(0, 242, 254, 0.8)";
      ctx.strokeRect(cx - 150, 10, 300, 22);
      
      ctx.beginPath();
      ctx.rect(cx - 145, 10, 290, 22);
      ctx.clip();

      ctx.fillStyle = "rgba(0, 242, 254, 0.8)";
      ctx.textAlign = "center";
      
      const tapeSpacing = 4.0; // Pixels per degree
      const headingStart = heading - 30;
      
      for (let i = Math.floor(headingStart); i <= heading + 30; i++) {
        const hDeg = (i + 360) % 360;
        const x = cx + (i - heading) * tapeSpacing;
        
        if (hDeg % 10 === 0) {
          ctx.beginPath();
          ctx.moveTo(x, 10);
          ctx.lineTo(x, 18);
          ctx.stroke();
          
          let label = hDeg;
          if (hDeg === 0) label = "N";
          else if (hDeg === 90) label = "E";
          else if (hDeg === 180) label = "S";
          else if (hDeg === 270) label = "W";
          
          ctx.fillText(label, x, 28);
        } else if (hDeg % 5 === 0) {
          ctx.beginPath();
          ctx.moveTo(x, 10);
          ctx.lineTo(x, 14);
          ctx.stroke();
        }
      }
      
      // Center heading marker arrow
      ctx.restore();
      ctx.save();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(cx, 32);
      ctx.lineTo(cx - 6, 38);
      ctx.lineTo(cx + 6, 38);
      ctx.fill();
      
      // Value indicator
      ctx.fillStyle = "rgba(8, 11, 17, 0.9)";
      ctx.fillRect(cx - 20, 38, 40, 15);
      ctx.strokeStyle = "#ef4444";
      ctx.strokeRect(cx - 20, 38, 40, 15);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.round(heading)}°`, cx, 49);
      ctx.restore();

      // 4. Side altitude tape (Right) & Speed tape (Left)
      // Left speed tape
      ctx.save();
      ctx.fillStyle = "rgba(8, 11, 17, 0.4)";
      ctx.fillRect(30, cy - 80, 40, 160);
      ctx.strokeStyle = "rgba(0, 242, 254, 0.5)";
      ctx.strokeRect(30, cy - 80, 40, 160);
      // Draw speed values
      ctx.fillStyle = "rgba(0, 242, 254, 0.9)";
      ctx.textAlign = "right";
      const spdOffset = (speed % 10) * 8;
      for (let s = Math.floor(speed / 10) * 10 - 20; s <= speed + 20; s += 5) {
        if (s < 0) continue;
        const y = cy - (s - speed) * 8;
        if (y > cy - 80 && y < cy + 80) {
          ctx.fillText(s, 60, y + 4);
          ctx.beginPath();
          ctx.moveTo(64, y);
          ctx.lineTo(70, y);
          ctx.stroke();
        }
      }
      // Speed box pointer
      ctx.fillStyle = "rgba(0, 242, 254, 0.95)";
      ctx.fillRect(15, cy - 10, 40, 20);
      ctx.fillStyle = "#080b11";
      ctx.font = "bold 11px monospace";
      ctx.fillText(speed.toFixed(1), 50, cy + 4);
      ctx.restore();

      // Right altitude tape
      ctx.save();
      ctx.fillStyle = "rgba(8, 11, 17, 0.4)";
      ctx.fillRect(width - 70, cy - 80, 40, 160);
      ctx.strokeStyle = "rgba(0, 242, 254, 0.5)";
      ctx.strokeRect(width - 70, cy - 80, 40, 160);
      // Draw altitude values
      ctx.fillStyle = "rgba(0, 242, 254, 0.9)";
      ctx.textAlign = "left";
      for (let a = Math.floor(alt / 10) * 10 - 20; a <= alt + 20; a += 10) {
        if (a < 0) continue;
        const y = cy - (a - alt) * 4;
        if (y > cy - 80 && y < cy + 80) {
          ctx.fillText(a, width - 58, y + 4);
          ctx.beginPath();
          ctx.moveTo(width - 70, y);
          ctx.lineTo(width - 64, y);
          ctx.stroke();
        }
      }
      // Altitude box pointer
      ctx.fillStyle = "rgba(0, 242, 254, 0.95)";
      ctx.fillRect(width - 55, cy - 10, 45, 20);
      ctx.fillStyle = "#080b11";
      ctx.font = "bold 11px monospace";
      ctx.fillText(alt.toFixed(1), width - 50, cy + 4);
      ctx.restore();

      animationId = requestAnimationFrame(drawHUD);
    };

    // Set canvas dimensions
    const resizeCanvas = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    drawHUD();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [roll, pitch, heading, alt, speed]);

  return (
    <div className="phone-hud-view">
      {/* Left panel options bar */}
      <div className="hud-side-bar">
        <button className="hud-btn" style={{ borderColor: "rgba(239, 68, 68, 0.4)", background: "rgba(239, 68, 68, 0.1)" }} onClick={() => sendCommand("DISARM")} title="EMERGENCY MOTOR STOP">
          <ShieldAlert size={18} color="var(--color-red)" />
        </button>
        <button className="hud-btn" onClick={() => sendCommand("RTL")} title="RETURN TO LAUNCH">
          <Home size={18} />
        </button>
        <button className="hud-btn">
          <Compass size={18} />
        </button>
        <button className="hud-btn">
          <Layers size={18} />
        </button>
        <button className="hud-btn active">
          <Lock size={18} />
        </button>
      </div>

      {/* Main HUD overlay viewport */}
      <div className="hud-content-center">
        {hudConnected ? (
          <img 
            className="fpv-video" 
            src={streamUrl} 
            alt="Live Stream Feed" 
            onError={() => setHudConnected(false)}
          />
        ) : (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            background: "#080b11"
          }}>
            <ShieldAlert size={48} color="var(--color-red)" />
            <div style={{ marginTop: "12px", color: "var(--text-secondary)" }}>
              FPV Stream Server Unreachable. Reconnecting...
            </div>
            <button onClick={() => setHudConnected(true)} style={{
              marginTop: "16px",
              padding: "6px 12px",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              border: "1px solid var(--panel-border)",
              borderRadius: "4px"
            }}>Retry</button>
          </div>
        )}
        
        {/* Transparent Canvas overlays */}
        <canvas className="hud-overlay-canvas" ref={canvasRef} />

        {/* Vector HUD overlays for sharp native text */}
        <div className="hud-top-left-box">
          <div className="hud-metric">SPD: <span className="hud-val">{speed.toFixed(1)} m/s</span></div>
          <div className="hud-metric">HDG: <span className="hud-val">{Math.round(heading)}deg</span></div>
          <div className="hud-metric">BAT: <span className="hud-val" style={{ color: battery > 30 ? "var(--color-green)" : "var(--color-red)" }}>{Math.round(battery)}%</span></div>
          <div className="hud-metric">LNK: <span className="hud-val" style={{ color: lq > 50 ? "var(--color-cyan)" : "var(--color-red)" }}>{lq}%</span></div>
        </div>

        <div className="hud-top-right-box" style={{ border: `1px solid ${armed ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}` }}>
          <div className="hud-metric">MODE: <span className="hud-val">{mode}</span></div>
          <div className="hud-status" style={{ color: armed ? "var(--color-green)" : "var(--color-red)" }}>
            {armed ? "ARMED" : "DISARMED"}
          </div>
        </div>

        <div className="hud-gps-bottom">
          GPS: {gps.lat ? gps.lat.toFixed(6) : "0.000000"}, {gps.lon ? gps.lon.toFixed(6) : "0.000000"} | {gps.fix || "No GPS"}
        </div>

        {/* HUD bottom ribbons telemetry details */}
        <div className="hud-bottom-bar">
          <div className="hud-bottom-item">
            <span className="hud-bottom-label">ALT</span>
            <span className="hud-bottom-value">{alt.toFixed(1)} m</span>
          </div>
          <div className="hud-bottom-item">
            <span className="hud-bottom-label">SPD</span>
            <span className="hud-bottom-value">{speed.toFixed(1)} m/s</span>
          </div>
          <div className="hud-bottom-item">
            <span className="hud-bottom-label">BAT</span>
            <span className="hud-bottom-value">{battery}% ({voltage.toFixed(1)}V)</span>
          </div>
          <div className="hud-bottom-item">
            <span className="hud-bottom-label">DIST</span>
            <span className="hud-bottom-value">{dist.toFixed(2)} km</span>
          </div>
          <div className="hud-bottom-item">
            <span className="hud-bottom-label">TIME</span>
            <span className="hud-bottom-value">12:46</span>
          </div>
        </div>
      </div>

      {/* Right control triggers */}
      <div className="hud-right-bar">
        {/* Shutter red dot record log button */}
        <button 
          className={`shutter-btn ${isRecording ? "recording" : ""}`} 
          onClick={handleShutterClick}
          title={isRecording ? "Stop Log Recording" : "Record Flight Telemetry"}
        >
          <div className="shutter-btn-inner"></div>
        </button>
        <button 
          className="hud-btn" 
          onClick={handleSnapshotClick} 
          title="Take Camera Stream Snapshot"
          style={{ position: "relative" }}
        >
          <Camera size={18} />
        </button>
        <button className="hud-btn">
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}
