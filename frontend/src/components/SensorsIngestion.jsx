import React from "react";
import { 
  Wifi, Cpu, ShieldAlert, CheckCircle, AlertTriangle, 
  Activity, Radio, ShieldCheck, Battery, Navigation, 
  Clock, Gauge, Video, Mic, MicOff, RefreshCw
} from "lucide-react";

export default function SensorsIngestion({ telemetry }) {
  const isConnected = telemetry?.connected || false;
  
  // Base Return Calculations (default fallback if missing)
  const baseReturn = telemetry?.base_return || {
    distance_m: 0,
    time_to_return_s: 0,
    battery_required_pct: 0,
    safety_status: "SAFE"
  };

  // Ingestion Devices List (default fallback)
  const ingestionDevices = telemetry?.ingestion_devices || [
    { name: "Raspberry Pi 4 (Suspended Probe)", ip: "192.168.1.102", connected: false, latency_ms: 0, packet_loss_pct: 0, type: "suspended", uptime_s: 0 },
    { name: "Raspberry Pi Zero (Handheld Rover)", ip: "192.168.1.105", connected: false, latency_ms: 0, packet_loss_pct: 0, type: "handheld", uptime_s: 0 }
  ];

  // Sensor Synchronization Board (default fallback)
  const sensorsSync = telemetry?.sensors_sync || {
    gyroscope: { status: "OFFLINE", synchronized: false, frequency_hz: 0, latency_ms: 0 },
    accelerometer: { status: "OFFLINE", synchronized: false, frequency_hz: 0, latency_ms: 0 },
    altimeter: { status: "OFFLINE", synchronized: false, frequency_hz: 0, latency_ms: 0 },
    camera: { status: "OFFLINE", synchronized: false, frequency_hz: 0, latency_ms: 0 },
    microphone: { status: "OFFLINE", synchronized: false, frequency_hz: 0, latency_ms: 0 }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "OK": return "var(--color-green)";
      case "WARNING": return "var(--color-yellow)";
      default: return "var(--color-red)";
    }
  };

  const formatUptime = (seconds) => {
    if (!seconds) return "00:00:00";
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return (
    <div className="sensors-ingestion-container">
      {/* Top Banner Status */}
      <div className="ingestion-header-card glass-panel">
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div className={`status-ring ${isConnected ? "pulse-green" : "pulse-red"}`}>
            <Radio size={24} color={isConnected ? "var(--color-green)" : "var(--color-red)"} />
          </div>
          <div>
            <h2 className="panel-title">Ingestion & Sensor Synchronization</h2>
            <p className="text-secondary" style={{ fontSize: "13px" }}>
              {isConnected 
                ? "Streaming telemetry and device logs at 10Hz from local Raspberry Pi client nodes."
                : "Awaiting connection from local ingestion devices. Verify client script is running on the Pi."
              }
            </p>
          </div>
        </div>
        <div className="safety-badge" data-status={baseReturn.safety_status}>
          {baseReturn.safety_status === "SAFE" && <ShieldCheck size={16} />}
          {baseReturn.safety_status === "WARNING" && <AlertTriangle size={16} />}
          {baseReturn.safety_status === "CRITICAL" && <ShieldAlert size={16} />}
          <span>Base Return: {baseReturn.safety_status}</span>
        </div>
      </div>

      <div className="ingestion-grid">
        
        {/* Left Column: Connection list and health statistics */}
        <div className="ingestion-col">
          
          {/* Active Ingestion Devices */}
          <div className="glass-panel content-card">
            <h3 className="section-title">
              <Cpu size={16} className="title-icon" /> Ingestion Devices (Raspberry Pi Nodes)
            </h3>
            <div className="device-list">
              {ingestionDevices.map((device, idx) => (
                <div key={idx} className="device-item glass-panel" data-connected={device.connected}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className={`indicator-dot ${device.connected ? "bg-green" : "bg-red"}`}></div>
                      <span className="device-name">{device.name}</span>
                    </div>
                    <span className="device-badge">{device.type.toUpperCase()}</span>
                  </div>

                  <div className="device-metrics">
                    <div>
                      <span className="metric-label">IP Address</span>
                      <span className="metric-value">{device.ip}</span>
                    </div>
                    <div>
                      <span className="metric-label">Latency</span>
                      <span className="metric-value">{device.connected ? `${device.latency_ms} ms` : "N/A"}</span>
                    </div>
                    <div>
                      <span className="metric-label">Packet Loss</span>
                      <span className="metric-value">{device.connected ? `${device.packet_loss_pct}%` : "N/A"}</span>
                    </div>
                    <div>
                      <span className="metric-label">Uptime</span>
                      <span className="metric-value">{device.connected ? formatUptime(device.uptime_s) : "00:00:00"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Base Return Analytics panel */}
          <div className="glass-panel content-card">
            <h3 className="section-title">
              <Navigation size={16} className="title-icon" /> Base Return & Power Capability
            </h3>
            
            <div className="base-return-panel">
              <div className="return-stats">
                <div className="stat-box glass-panel">
                  <div className="stat-icon-wrapper cyan">
                    <Navigation size={18} />
                  </div>
                  <div>
                    <span className="stat-label">Distance to Base</span>
                    <span className="stat-val">{baseReturn.distance_m} m</span>
                  </div>
                </div>

                <div className="stat-box glass-panel">
                  <div className="stat-icon-wrapper purple">
                    <Clock size={18} />
                  </div>
                  <div>
                    <span className="stat-label">Est. Time to Return</span>
                    <span className="stat-val">{baseReturn.time_to_return_s} s</span>
                  </div>
                </div>
              </div>

              {/* Required Return Battery Bar */}
              <div className="battery-requirement-card glass-panel">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Battery size={16} className="color-cyan" />
                    <span className="text-primary font-semibold" style={{ fontSize: "13px" }}>Battery capability analysis</span>
                  </div>
                  <span className="text-secondary" style={{ fontSize: "11px" }}>
                    Required to Home: {baseReturn.battery_required_pct}%
                  </span>
                </div>

                <div className="battery-double-progress">
                  {/* Current Battery Level bar */}
                  <div className="progress-track">
                    <div 
                      className="progress-fill current-battery" 
                      style={{ 
                        width: `${telemetry?.telemetry?.battery || 0}%`,
                        backgroundColor: (telemetry?.telemetry?.battery || 0) < 20 ? "var(--color-red)" : "var(--color-green)"
                      }}
                    ></div>
                    {/* Required Battery overlay marker */}
                    <div 
                      className="required-marker" 
                      style={{ left: `${baseReturn.battery_required_pct}%` }}
                      title={`Minimum battery required to return safely: ${baseReturn.battery_required_pct}%`}
                    ></div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px", fontSize: "11px" }} className="text-secondary">
                  <span>Current: {telemetry?.telemetry?.battery || 0}%</span>
                  <span>Safety Margin: {Math.max(0, roundOneDecimal((telemetry?.telemetry?.battery || 0) - baseReturn.battery_required_pct))}%</span>
                </div>
              </div>

              {/* Status explanation */}
              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }} className="alert-desc-box">
                {baseReturn.safety_status === "SAFE" && (
                  <>
                    <CheckCircle className="color-green" size={16} style={{ flexShrink: 0 }} />
                    <span className="text-secondary" style={{ fontSize: "12px" }}>
                      Safe to continue mission operations. Current battery power is well above the required return-to-base calculation threshold.
                    </span>
                  </>
                )}
                {baseReturn.safety_status === "WARNING" && (
                  <>
                    <AlertTriangle className="color-yellow" size={16} style={{ flexShrink: 0 }} />
                    <span className="text-secondary" style={{ fontSize: "12px" }}>
                      Warning limit reached! Device is approaching maximum safe distance from home base. Monitor battery depletion trends closely.
                    </span>
                  </>
                )}
                {baseReturn.safety_status === "CRITICAL" && (
                  <>
                    <ShieldAlert className="color-red" size={16} style={{ flexShrink: 0 }} />
                    <span className="text-secondary" style={{ fontSize: "12px" }}>
                      Critical safety warning! Battery power has fallen below the safety limit required to return. Trigger immediate automated RTL.
                    </span>
                  </>
                )}
              </div>

            </div>
          </div>

        </div>

        {/* Right Column: Sensors synchronization details */}
        <div className="ingestion-col">
          
          <div className="glass-panel content-card" style={{ height: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
              <h3 className="section-title" style={{ margin: 0 }}>
                <Activity size={16} className="title-icon" /> Sensor Sync & Functionality Indicators
              </h3>
              <span className="text-secondary" style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: "4px" }}>
                <RefreshCw size={10} className="spin-slow" /> Real-time checks
              </span>
            </div>

            <div className="sensor-sync-list">
              {Object.entries(sensorsSync).map(([sensorName, sensor], idx) => {
                const icon = getSensorIcon(sensorName);
                return (
                  <div key={idx} className="sensor-sync-item glass-panel">
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div className="sensor-icon-wrapper">
                        {icon}
                      </div>
                      <div>
                        <span className="sensor-name">{capitalizeFirstLetter(sensorName)}</span>
                        <div style={{ display: "flex", gap: "10px", marginTop: "2px" }}>
                          <span className="sensor-meta" style={{ color: getStatusColor(sensor.status) }}>
                            {sensor.status}
                          </span>
                          <span className="sensor-divider">|</span>
                          <span className="sensor-meta">
                            {sensor.synchronized ? "SYNCHRONIZED" : "NOT SYNCHRONIZED"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="sensor-readings">
                      <div>
                        <span className="label">Frequency</span>
                        <span className="val">{sensor.frequency_hz} Hz</span>
                      </div>
                      <div>
                        <span className="label">Latency</span>
                        <span className="val">{sensor.latency_ms} ms</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

// Helper methods
const roundOneDecimal = (val) => Math.round(val * 10) / 10;

const capitalizeFirstLetter = (str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const getSensorIcon = (name) => {
  switch (name) {
    case "gyroscope": return <Gauge size={16} />;
    case "accelerometer": return <Activity size={16} />;
    case "altimeter": return <Navigation size={16} />;
    case "camera": return <Video size={16} />;
    case "microphone": return <Mic size={16} />;
    default: return <Cpu size={16} />;
  }
};
