import asyncio
import json
import logging
import math
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, List, Optional

from backend.drone_connector import SimulatorConnector
from backend.mavlink_connector import MAVLinkConnector
from backend.ros2_connector import ROS2Connector
from backend.camera_streamer import CameraStreamer
from backend.replay_recorder import ReplayRecorder

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BHIV_ControlPanel")

app = FastAPI(title="BHIV Autonomous Intelligence Control Panel API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global runtime state
active_connector = SimulatorConnector()

@app.on_event("startup")
async def startup_event():
    await active_connector.connect()

camera_streamer = CameraStreamer(active_connector)
replay_recorder = ReplayRecorder()

replay_active = False
current_recording_file = None

# Pydantic schemas for requests
class ConnectionRequest(BaseModel):
    connection_type: str  # "sim" or "mavlink"
    connection_str: Optional[str] = "udp:127.0.0.1:14540"

class CommandRequest(BaseModel):
    command: str  # ARM, DISARM, TAKEOFF, LAND, RTL, START_MISSION, PAUSE_MISSION, CHANGE_MODE
    params: Optional[Dict[str, Any]] = None

class Waypoint(BaseModel):
    lat: float
    lng: float
    alt: Optional[float] = 20.0
    speed: Optional[float] = 8.2

class GeofenceParam(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius: Optional[float] = 150.0

class ObstacleParam(BaseModel):
    lat: float
    lng: float
    name: Optional[str] = "Hazard"

class MissionRequest(BaseModel):
    waypoints: List[Waypoint]
    geofence: Optional[GeofenceParam] = None
    obstacles: Optional[List[ObstacleParam]] = None

class ReplayLoadRequest(BaseModel):
    filename: str


@app.post("/api/connect")
async def connect_drone(req: ConnectionRequest):
    global active_connector, camera_streamer, replay_active
    
    # Pause replay mode if running
    replay_active = False
    
    logger.info(f"Switching connection: {req.connection_type} on {req.connection_str}")
    
    # Disconnect existing
    await active_connector.disconnect()

    if req.connection_type.lower() == "mavlink":
        active_connector = MAVLinkConnector(req.connection_str)
    elif req.connection_type.lower() == "ros2":
        active_connector = ROS2Connector()
    else:
        active_connector = SimulatorConnector()

    success = await active_connector.connect()
    
    # Re-initialize camera streamer with the new active connector
    camera_streamer = CameraStreamer(active_connector)
    
    if not success:
        raise HTTPException(status_code=500, detail="Autopilot connection failed.")
    
    return {"status": "connected", "type": req.connection_type}


@app.post("/api/disconnect")
async def disconnect_drone():
    global active_connector
    await active_connector.disconnect()
    return {"status": "disconnected"}



@app.post("/api/command")
async def send_command(req: CommandRequest):
    if replay_active:
        raise HTTPException(status_code=400, detail="Cannot send commands during replay playback.")
    
    success = await active_connector.send_command(req.command, req.params)
    if not success:
        return {"status": "failed", "detail": "Autopilot rejected command or is disconnected."}
    return {"status": "success"}


@app.post("/api/mission")
async def upload_mission(req: MissionRequest):
    if replay_active:
        raise HTTPException(status_code=400, detail="Cannot upload mission during replay playback.")
    
    wps = [wp.dict() for wp in req.waypoints]
    gf = req.geofence.dict() if req.geofence else None
    obs = [ob.dict() for ob in req.obstacles] if req.obstacles else None
    
    success = await active_connector.upload_mission(wps, gf, obs)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to upload mission to drone connector.")
    return {"status": "success", "waypoints_count": len(wps)}


@app.get("/api/camera/stream")
def get_camera_stream():
    """
    Renders live streaming video feed overlaid with real-time HUD telemetry.
    """
    return StreamingResponse(
        camera_streamer.get_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/api/camera/snapshot")
def get_camera_snapshot():
    """
    Captures a single current frame from the camera stream.
    """
    frame = camera_streamer.generate_frame()
    if not frame:
        raise HTTPException(status_code=500, detail="Failed to capture camera frame.")
    return Response(content=frame, media_type="image/jpeg")


# --- Replay & Recording Endpoints ---

@app.post("/api/replay/record/start")
def start_flight_recording():
    if replay_active:
        raise HTTPException(status_code=400, detail="Cannot record during playback.")
    filename = replay_recorder.start_recording()
    return {"status": "recording", "file": filename}


@app.post("/api/replay/record/stop")
def stop_flight_recording():
    replay_recorder.stop_recording()
    return {"status": "idle"}


@app.get("/api/replay/list")
def list_recordings():
    return replay_recorder.list_recordings()


@app.post("/api/replay/load")
def load_recording(req: ReplayLoadRequest):
    global replay_active
    success = replay_recorder.load_recording(req.filename)
    if not success:
        raise HTTPException(status_code=404, detail="Flight recording file not found.")
    
    replay_active = True
    return {"status": "playing", "file": req.filename}


@app.post("/api/replay/stop")
def stop_replay():
    global replay_active
    replay_active = False
    return {"status": "live"}


start_time = time.time()

def enrich_telemetry_with_ingestion(data: dict) -> dict:
    if not data:
        return data

    connected = data.get("connected", False)
    
    # 1. Base return safety calculations
    telemetry = data.get("telemetry", {})
    gps = telemetry.get("gps", {}) or {}
    lat = gps.get("lat", 15.4989)
    lon = gps.get("lon", 73.8278)
    battery_pct = telemetry.get("battery", 100.0)
    
    # Simple flat distance estimation in meters to home base (15.4989, 73.8278)
    dlat = (lat - 15.4989) * 111320
    dlon = (lon - 73.8278) * 111320 * math.cos(math.radians(15.4989))
    dist_to_base = math.sqrt(dlat**2 + dlon**2)
    
    # Return time at average speed of 5m/s
    return_time = dist_to_base / 5.0 if dist_to_base > 0.5 else 0.0
    # battery required is return time * 0.15% battery/sec + 15% safety buffer
    bat_required = (return_time * 0.15) + 15.0 if dist_to_base > 0.5 else 0.0
    
    # Safety status
    if dist_to_base <= 2.0:
        safety_status = "SAFE"
    elif battery_pct > bat_required + 15:
        safety_status = "SAFE"
    elif battery_pct > bat_required:
        safety_status = "WARNING"
    else:
        safety_status = "CRITICAL"
        
    data["base_return"] = {
        "distance_m": round(dist_to_base, 1),
        "time_to_return_s": int(return_time),
        "battery_required_pct": round(bat_required, 1),
        "safety_status": safety_status
    }
    
    # 2. Ingestion devices list
    uptime = int(time.time() - start_time)
    data["ingestion_devices"] = [
        {
            "name": "Raspberry Pi 4 (Suspended Probe)",
            "ip": "192.168.1.102",
            "connected": connected,
            "latency_ms": 12 if connected else 0,
            "packet_loss_pct": 0.1 if connected else 0.0,
            "type": "suspended",
            "uptime_s": uptime if connected else 0
        },
        {
            "name": "Raspberry Pi Zero (Handheld Rover)",
            "ip": "192.168.1.105",
            "connected": connected,
            "latency_ms": 22 if connected else 0,
            "packet_loss_pct": 0.4 if connected else 0.0,
            "type": "handheld",
            "uptime_s": uptime if connected else 0
        }
    ]
    
    # 3. Individual sensors sync
    data["sensors_sync"] = {
        "gyroscope": {
            "status": "OK" if connected else "OFFLINE",
            "synchronized": connected,
            "frequency_hz": 100 if connected else 0,
            "latency_ms": 2 if connected else 0
        },
        "accelerometer": {
            "status": "OK" if connected else "OFFLINE",
            "synchronized": connected,
            "frequency_hz": 100 if connected else 0,
            "latency_ms": 2 if connected else 0
        },
        "altimeter": {
            "status": "OK" if connected else "OFFLINE",
            "synchronized": connected,
            "frequency_hz": 50 if connected else 0,
            "latency_ms": 5 if connected else 0
        },
        "camera": {
            "status": "OK" if connected else "OFFLINE",
            "synchronized": connected,
            "frequency_hz": 30 if connected else 0,
            "latency_ms": 110 if connected else 0
        },
        "microphone": {
            "status": "WARNING" if connected else "OFFLINE",
            "synchronized": False,
            "frequency_hz": 8 if connected else 0,
            "latency_ms": 320 if connected else 0
        }
    }
    
    return data


# --- WebSocket Telemetry Streamer ---

@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    global replay_active
    await websocket.accept()
    logger.info("Client connected to telemetry WebSocket.")
    
    try:
        while True:
            # 1. Fetch current frame data
            if replay_active:
                data = replay_recorder.get_next_playback_frame()
                # Mark as replay mode for UI
                if data:
                    data["replay_mode"] = True
            else:
                data = active_connector.get_telemetry()
                data["replay_mode"] = False
                
                # If currently recording, write snapshot to file
                if replay_recorder.is_recording:
                    replay_recorder.record_telemetry(data)

            # Send telemetry JSON
            if data:
                data = enrich_telemetry_with_ingestion(data)
                await websocket.send_json(data)
            
            # Send at 10Hz frequency
            await asyncio.sleep(0.1)

    except WebSocketDisconnect:
        logger.info("Client disconnected from telemetry WebSocket.")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except:
            pass


# --- Serve Built Frontend Files (Production/Deployment) ---
import os
from fastapi.staticfiles import StaticFiles

# Resolve path to frontend/dist relative to this main.py file
dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

if os.path.exists(dist_dir):
    logger.info(f"Mounting frontend static files from: {dist_dir}")
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="frontend")
else:
    logger.warning(f"Frontend build folder not found at: {dist_dir}. Serving API only.")

