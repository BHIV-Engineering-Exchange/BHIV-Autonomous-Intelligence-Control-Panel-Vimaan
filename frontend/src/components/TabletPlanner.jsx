import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { 
  Map, Edit, Settings, Database, Trash2, 
  Upload, Eye, RefreshCw, AlertTriangle, X
} from "lucide-react";
import { apiBase } from "../config";

export default function TabletPlanner({ uploadMission, isActive }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const polylineRef = useRef(null);
  const geofenceLayerRef = useRef(null);
  const obstacleLayerRef = useRef(null);

  const [waypoints, setWaypoints] = useState([]);
  const [obstacles, setObstacles] = useState([]);
  const [geofence, setGeofence] = useState(null); // { lat, lng, radius }
  const [loading, setLoading] = useState(false);
  const [activeTool, setActiveTool] = useState("plan");
  const [surveyParams, setSurveyParams] = useState({
    defaultAlt: 30,
    overlap: 75,
    speed: 8.0
  });

  const defaultLat = 15.4989;
  const defaultLng = 73.8278;

  // Re-render map tiles when tab becomes active (Leaflet blank-tile fix)
  useEffect(() => {
    if (isActive && mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current.invalidateSize(), 50);
    }
  }, [isActive]);

  // Initialize Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    mapInstanceRef.current = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false
    }).setView([defaultLat, defaultLng], 16);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19
    }).addTo(mapInstanceRef.current);

    markersLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    geofenceLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current);
    obstacleLayerRef.current = L.layerGroup().addTo(mapInstanceRef.current);

    polylineRef.current = L.polyline([], {
      color: "#10b981",
      weight: 3
    }).addTo(mapInstanceRef.current);
  }, []);

  // Map click handler — routes based on activeTool
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleClick = (e) => {
      const { lat, lng } = e.latlng;
      if (activeTool === "plan") {
        setWaypoints(prev => [...prev, {
          lat, lng,
          alt: surveyParams.defaultAlt,
          speed: surveyParams.speed
        }]);
      } else if (activeTool === "geofences") {
        setGeofence({ lat, lng, radius: 150 });
      } else if (activeTool === "obstacles") {
        setObstacles(prev => [...prev, {
          lat, lng,
          name: `Hazard ${prev.length + 1}`
        }]);
      }
    };

    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [activeTool, surveyParams]);

  // Sync waypoint markers + polyline
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    markersLayerRef.current.clearLayers();
    const latlngs = waypoints.map(wp => [wp.lat, wp.lng]);
    polylineRef.current.setLatLngs(latlngs);
    waypoints.forEach((wp, idx) => {
      const icon = L.divIcon({
        className: "waypoint-number-icon",
        html: `<div style="
          width:24px;height:24px;border-radius:50%;
          background:#10b981;color:#080b11;
          font-weight:800;font-size:12px;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 0 8px rgba(16,185,129,0.6);">${idx + 1}</div>`,
        iconSize: [24, 24], iconAnchor: [12, 12]
      });
      L.marker([wp.lat, wp.lng], { icon }).addTo(markersLayerRef.current);
    });
  }, [waypoints]);

  // Sync geofence circle
  useEffect(() => {
    if (!geofenceLayerRef.current) return;
    geofenceLayerRef.current.clearLayers();
    if (geofence?.lat) {
      L.circle([geofence.lat, geofence.lng], {
        radius: geofence.radius,
        color: "#ef4444",
        fillColor: "#ef4444",
        fillOpacity: 0.08,
        weight: 2,
        dashArray: "6, 6"
      }).addTo(geofenceLayerRef.current);
      L.marker([geofence.lat, geofence.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="
            width:18px;height:18px;border-radius:50%;
            background:rgba(239,68,68,0.8);border:2px solid #ef4444;
            display:flex;align-items:center;justify-content:center;">
            <span style="color:#fff;font-size:9px;font-weight:bold;">GF</span></div>`,
          iconSize: [18, 18], iconAnchor: [9, 9]
        })
      }).addTo(geofenceLayerRef.current);
    }
  }, [geofence]);

  // Sync obstacle markers
  useEffect(() => {
    if (!obstacleLayerRef.current) return;
    obstacleLayerRef.current.clearLayers();
    obstacles.forEach((obs, idx) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="
          width:22px;height:22px;border-radius:4px;
          background:rgba(251,191,36,0.85);border:2px solid #f59e0b;
          display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:10px;color:#080b11;">⚠</div>`,
        iconSize: [22, 22], iconAnchor: [11, 11]
      });
      L.marker([obs.lat, obs.lng], { icon }).addTo(obstacleLayerRef.current);
    });
  }, [obstacles]);

  const clearWaypoints = () => setWaypoints([]);
  const clearGeofence = () => setGeofence(null);
  const clearObstacles = () => setObstacles([]);

  const handleUpload = async () => {
    if (waypoints.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/mission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waypoints: waypoints.map(wp => ({
            lat: wp.lat,
            lng: wp.lng,
            alt: wp.alt,
            speed: wp.speed
          })),
          geofence: geofence ? {
            lat: geofence.lat,
            lng: geofence.lng,
            radius: geofence.radius
          } : null,
          obstacles: obstacles.length > 0 ? obstacles.map(obs => ({
            lat: obs.lat,
            lng: obs.lng,
            name: obs.name
          })) : null
        })
      });

      const data = await res.json();
      if (data.status === "success") {
        // Also send START_MISSION
        await fetch(`${apiBase}/api/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: "START_MISSION" })
        });
        alert(`✅ Mission uploaded! ${waypoints.length} waypoints${geofence ? ", geofence active" : ""}${obstacles.length > 0 ? `, ${obstacles.length} hazard markers` : ""}.\n\nDrone initialized and mission started — check PC Dashboard.`);
      } else {
        alert("Failed to upload mission.");
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
    setLoading(false);
  };

  // Derived mission analytics
  const areaSqKm = waypoints.length > 2 ? (waypoints.length * 0.15).toFixed(2) : "0.00";
  const groundRes = (surveyParams.defaultAlt * 0.052).toFixed(1);
  const estTimeMin = waypoints.length > 0
    ? ((waypoints.length * 180) / surveyParams.speed / 60).toFixed(1)
    : "0";
  const estBatteryPct = waypoints.length > 0
    ? Math.max(15, 95 - waypoints.length * Math.ceil(100 / surveyParams.speed))
    : 100;
  const imageCount = Math.round(waypoints.length * (surveyParams.overlap / 10) * 1.5);

  const toolItems = [
    { key: "plan",      icon: <Edit size={16} />,         label: "Plan Mission" },
    { key: "waypoints", icon: <Map size={16} />,          label: `Waypoints (${waypoints.length})` },
    { key: "survey",    icon: <Settings size={16} />,     label: "Survey Parameters" },
    { key: "geofences", icon: <Database size={16} />,     label: "Geofences" },
    { key: "obstacles", icon: <Eye size={16} />,          label: "Obstacles" },
  ];

  const renderSidePanelContent = () => {
    switch (activeTool) {
      case "plan":
        return (
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
            <div style={{ padding: "8px", background: "rgba(0,242,254,0.06)", borderRadius: "6px", border: "1px solid rgba(0,242,254,0.15)", marginBottom: "8px" }}>
              Click anywhere on the map to place numbered waypoints in sequence.
            </div>
            <div style={{ color: "var(--text-muted)" }}>
              Waypoints placed: <strong style={{ color: "var(--color-cyan)" }}>{waypoints.length}</strong>
            </div>
          </div>
        );

      case "waypoints":
        return (
          <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 280px)", display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
            {waypoints.length === 0 && (
              <div style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", marginTop: "16px" }}>
                No waypoints placed yet.<br />Switch to Plan Mission and click the map.
              </div>
            )}
            {waypoints.map((wp, idx) => (
              <div key={idx} style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--panel-border)",
                borderRadius: "6px", padding: "8px", fontSize: "11px"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ color: "var(--color-cyan)", fontWeight: "700" }}>WP {idx + 1}</span>
                  <button onClick={() => setWaypoints(prev => prev.filter((_, i) => i !== idx))}
                    style={{ background: "none", border: "none", color: "var(--color-red)", cursor: "pointer", padding: "0" }}>
                    <X size={12} />
                  </button>
                </div>
                <div style={{ color: "var(--text-muted)", marginBottom: "4px" }}>
                  {wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <label style={{ flex: 1 }}>
                    <span style={{ color: "var(--text-secondary)", display: "block", marginBottom: "2px" }}>Alt (m)</span>
                    <input type="number" value={wp.alt} min={5} max={200} step={5}
                      onChange={e => setWaypoints(prev => prev.map((w, i) => i === idx ? { ...w, alt: parseFloat(e.target.value) } : w))}
                      style={{ width: "100%", background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid var(--panel-border)", borderRadius: "4px", padding: "2px 4px" }} />
                  </label>
                  <label style={{ flex: 1 }}>
                    <span style={{ color: "var(--text-secondary)", display: "block", marginBottom: "2px" }}>Speed (m/s)</span>
                    <input type="number" value={wp.speed} min={2} max={20} step={0.5}
                      onChange={e => setWaypoints(prev => prev.map((w, i) => i === idx ? { ...w, speed: parseFloat(e.target.value) } : w))}
                      style={{ width: "100%", background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid var(--panel-border)", borderRadius: "4px", padding: "2px 4px" }} />
                  </label>
                </div>
              </div>
            ))}
          </div>
        );

      case "survey":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "8px" }}>
            {[
              { label: "Default Altitude", key: "defaultAlt", min: 10, max: 150, step: 5, unit: "m" },
              { label: "Photo Overlap", key: "overlap", min: 50, max: 95, step: 5, unit: "%" },
              { label: "Flight Speed", key: "speed", min: 3, max: 18, step: 0.5, unit: "m/s" }
            ].map(({ label, key, min, max, step, unit }) => (
              <div key={key}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                  <span style={{ color: "var(--color-cyan)", fontWeight: "700" }}>{surveyParams[key]} {unit}</span>
                </div>
                <input type="range" min={min} max={max} step={step} value={surveyParams[key]}
                  onChange={e => setSurveyParams(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                  style={{ width: "100%", accentColor: "var(--color-cyan)" }} />
              </div>
            ))}
            <div style={{ fontSize: "11px", color: "var(--text-muted)", borderTop: "1px solid var(--panel-border)", paddingTop: "10px" }}>
              Ground Resolution: <strong style={{ color: "#fff" }}>{groundRes} cm/px</strong>
            </div>
          </div>
        );

      case "geofences":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
            <div style={{ fontSize: "12px", padding: "8px", background: "rgba(239,68,68,0.06)", borderRadius: "6px", border: "1px solid rgba(239,68,68,0.2)", color: "var(--text-secondary)" }}>
              Click on the map to place the geofence center. The drone will auto-RTL if it exits the safety boundary.
            </div>
            {geofence ? (
              <div style={{ fontSize: "12px" }}>
                <div style={{ color: "var(--color-green)", fontWeight: "700", marginBottom: "6px" }}>✅ Geofence Active</div>
                <div style={{ color: "var(--text-muted)", marginBottom: "8px" }}>
                  Center: {geofence.lat.toFixed(5)}, {geofence.lng.toFixed(5)}
                </div>
                <div style={{ marginBottom: "4px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Radius</span>
                  <span style={{ color: "var(--color-red)", fontWeight: "700" }}>{geofence.radius}m</span>
                </div>
                <input type="range" min={30} max={1000} step={10} value={geofence.radius}
                  onChange={e => setGeofence(prev => ({ ...prev, radius: parseFloat(e.target.value) }))}
                  style={{ width: "100%", accentColor: "#ef4444" }} />
                <button onClick={clearGeofence}
                  style={{ marginTop: "8px", width: "100%", padding: "6px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--color-red)", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>
                  <Trash2 size={12} style={{ marginRight: "4px" }} /> Remove Geofence
                </button>
              </div>
            ) : (
              <div style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center" }}>
                No geofence set. Click on the map to place one.
              </div>
            )}
          </div>
        );

      case "obstacles":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
            <div style={{ fontSize: "12px", padding: "8px", background: "rgba(251,191,36,0.06)", borderRadius: "6px", border: "1px solid rgba(251,191,36,0.2)", color: "var(--text-secondary)", marginBottom: "4px" }}>
              Click on the map to place hazard/obstacle markers. Drone will alert when within 15m.
            </div>
            {obstacles.length === 0 && (
              <div style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center" }}>No hazards placed.</div>
            )}
            {obstacles.map((obs, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: "6px", padding: "6px 8px" }}>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: "#fbbf24" }}>⚠ {obs.name}</div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{obs.lat.toFixed(5)}, {obs.lng.toFixed(5)}</div>
                </div>
                <button onClick={() => setObstacles(prev => prev.filter((_, i) => i !== idx))}
                  style={{ background: "none", border: "none", color: "var(--color-red)", cursor: "pointer" }}>
                  <X size={12} />
                </button>
              </div>
            ))}
            {obstacles.length > 0 && (
              <button onClick={clearObstacles} style={{ marginTop: "4px", padding: "6px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--color-red)", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}>
                <Trash2 size={12} style={{ marginRight: "4px" }} /> Clear All Obstacles
              </button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="tablet-planner-view">
      {/* Left Planning Tools Menu */}
      <div className="planner-sidebar glass-panel">
        <div className="card-title">Mission Tools</div>
        {toolItems.map(({ key, icon, label }) => (
          <button
            key={key}
            className={`menu-item ${activeTool === key ? "active" : ""}`}
            onClick={() => setActiveTool(key)}
          >
            {icon} {label}
          </button>
        ))}

        <div style={{ borderTop: "1px solid var(--panel-border)", marginTop: "10px", paddingTop: "10px" }}>
          {renderSidePanelContent()}
        </div>

        <button style={{
          marginTop: "auto",
          padding: "8px 12px",
          background: "rgba(239, 68, 68, 0.12)",
          color: "var(--color-red)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "6px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "13px"
        }} onClick={clearWaypoints}>
          <Trash2 size={16} /> Clear Path
        </button>
      </div>

      {/* Interactive Map */}
      <div style={{ position: "relative", height: "100%" }}>
        <div className="map-container" style={{ height: "100%" }} ref={mapContainerRef} />
        <div className="planner-map-btn" style={{ bottom: "20px", left: "20px", display: "flex", gap: "8px", alignItems: "center" }}>
          {activeTool === "plan" && <span>📍 Click map to add waypoints</span>}
          {activeTool === "geofences" && <span style={{ color: "#ef4444" }}>🔴 Click map to set geofence center</span>}
          {activeTool === "obstacles" && <span style={{ color: "#fbbf24" }}>⚠️ Click map to place hazard marker</span>}
        </div>
      </div>

      {/* Right Details Panel */}
      <div className="planner-details-panel glass-panel">
        <div className="card-title">Mission Details</div>
        <div className="telemetry-table">
          {[
            ["Mission Type", "Waypoint Survey"],
            ["Target Area", `${areaSqKm} km²`],
            ["Waypoints", waypoints.length],
            ["Est. Time", `${estTimeMin} min`],
            ["Est. Battery Cost", `${estBatteryPct}%`],
          ].map(([label, val]) => (
            <div className="telemetry-row" key={label}>
              <span className="telemetry-label">{label}</span>
              <span className="telemetry-value">{val}</span>
            </div>
          ))}
        </div>

        <div className="card-title" style={{ marginTop: "16px" }}>Analytics</div>
        <div className="telemetry-table">
          {[
            ["Coverage", `${Math.min(99, Math.round(waypoints.length * 12))}%`],
            ["Overlap Ratio", `${surveyParams.overlap}% / ${Math.min(95, surveyParams.overlap + 5)}%`],
            ["Ground Resolution", `${groundRes} cm/px`],
            ["Est. Images", imageCount],
          ].map(([label, val]) => (
            <div className="telemetry-row" key={label}>
              <span className="telemetry-label">{label}</span>
              <span className="telemetry-value">{val}</span>
            </div>
          ))}
        </div>

        {geofence && (
          <>
            <div className="card-title" style={{ marginTop: "16px", color: "var(--color-red)" }}>Safety</div>
            <div className="telemetry-table">
              <div className="telemetry-row">
                <span className="telemetry-label">Geofence</span>
                <span className="telemetry-value" style={{ color: "var(--color-red)" }}>Active ({geofence.radius}m)</span>
              </div>
              <div className="telemetry-row">
                <span className="telemetry-label">Obstacles</span>
                <span className="telemetry-value" style={{ color: obstacles.length > 0 ? "#fbbf24" : "var(--text-muted)" }}>
                  {obstacles.length > 0 ? `${obstacles.length} hazards` : "None"}
                </span>
              </div>
            </div>
          </>
        )}

        <button
          className="btn-primary"
          style={{
            marginTop: "auto",
            padding: "12px",
            background: waypoints.length > 0 ? "var(--color-green)" : "rgba(255,255,255,0.05)",
            boxShadow: waypoints.length > 0 ? "0 0 15px rgba(16, 185, 129, 0.3)" : "none",
            cursor: waypoints.length === 0 ? "not-allowed" : "pointer"
          }}
          onClick={handleUpload}
          disabled={waypoints.length === 0 || loading}
        >
          <Upload size={16} /> {loading ? "Uploading..." : "UPLOAD & START"}
        </button>
      </div>
    </div>
  );
}
