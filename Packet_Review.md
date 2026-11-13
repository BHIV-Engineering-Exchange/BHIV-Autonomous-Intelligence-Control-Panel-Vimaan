# BHIV Autonomous Intelligence Control Panel

An advanced, premium-tier ground control station (GCS) and cockpit simulator for autonomous drone operations. It connects to simulated software environments, real-time drone networks via MAVLink (PX4/ArduPilot), or ROS2 middleware, rendering high-refresh-rate telemetry, spatial maps, diagnostic feeds, and high-fidelity cockpit FPV (First-Person View) feeds.

---

## 🚀 Setup & Execution Guide

Open **two separate terminals** in the project directory:

### Terminal 1 — Backend (FastAPI Server)
```powershell
.\venv\Scripts\uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### Terminal 2 — Frontend (Vite + React Dev Server)
```powershell
cd frontend
npm run dev
```
Open **http://localhost:5173** in your web browser.

---

## 🛠️ Feature Overview & Connection Status

Here is the exact mapping of what features are fully connected, what is simulated/real, and what remains as static UI elements:

### 1. PC Dashboard
* **Autopilot Connection Switcher (Top Right):** **Fully Functional ✅**
  * **Telemetry Sim:** Connects to the built-in software simulation loop.
  * **MAVLink (PX4):** Binds a real UDP socket listener (default `udp:127.0.0.1:14540`) to read packets from PX4 SITL or real drone transponders.
  * **ROS2 (Bridge):** Binds to target companion computer streams.
  * *Note: Switching dropdown changes target connection. You must click the **Connect/Disconnect** button to active-bind or drop connection.*
* **Flight Replay Player (Top Right):** **Fully Functional ✅**
  * Reads historical flight paths (stored as `.jsonl` files in `backend/recordings/`) at 10Hz. Replays battery, speed, altitude, coordinates, and health data exactly as they occurred in past flights. Commands are automatically blocked during replay mode.
* **Payload Control Panel (Sub-Tab):** **Functional & Simulated 🔌**
  * **Trigger Payload Drop button:** Sends a command to the backend to open the electromagnet. The system automatically switches the drone's flight mode to **POSCTL (Position Hold)** to stabilize the drone after releasing mass weight. Re-arms automatically after 4 seconds.
  * **Gimbal Pitch, Yaw, and Digital Camera Zoom sliders:** Mock/interactive sliders. Values update on-screen but are not wired to physical servo motors.
* **Flight Logs Panel (Sub-Tab):** **Fully Functional ✅**
  * Streams real-time event logs (e.g., mission updates, connections, mode changes, safety warnings) pushed from the backend over WebSockets.

### 2. Cockpit FPV View
* **Camera Stream Grid:** **Fully Functional ✅**
  * Renders a live stream feed (`/api/camera/stream`). Fallbacks to an artificial PIL horizon grid simulator (drawn at 15fps) if the physical camera node is unreachable.
* **Vector HUD Overlays:** **Fully Functional ✅**
  * Draws crystal-clear altitude tapes, speed tapes, central reticle, and heading tapes natively in the browser on canvas overlays. Sharp, native resolution numbers replace low-quality drawn-on-video digits.
* **Emergency Stop (Shield Alert icon):** **Fully Functional ✅**
  * Sends an immediate `DISARM` command to kill drone motors.
* **RTL (Home icon):** **Fully Functional ✅**
  * commands the active autopilot connection to return the drone home and land.
* **Camera Icon (Snapshot):** **Fully Functional ✅**
  * Captures the exact current video stream frame on the backend (`/api/camera/snapshot`) and opens it in a new window/tab to view or save.
* **Red Shutter Icon (Record Logs):** **Fully Functional ✅**
  * Starts and stops recording live flight telemetry into new, dated `.jsonl` files in `backend/recordings` for later playback.
* **Left FPV Sidebar Static Icons (Compass, Layers, Lock):** **Static Mockup ⚪**
  * Standard UI tab placeholders (intended for layer configs, locking orientation, and changing gimbal modes).
* **Right FPV Sidebar Static Icons (Settings Gear):** **Static Mockup ⚪**
  * Placeholder settings menu trigger.

### 3. Mobile Status Dashboard
* **Circular Battery Ring:** **Fully Functional ✅**
  * Dynamically updates charging indicators, voltage, and current draw.
* **Diagnostic Readouts:** **Fully Functional ✅**
  * Real-time GPS Fix status, Satellite locks, RC Signal strength, and Link Quality indicators.
* **Live Neon Sparklines:** **Fully Functional ✅**
  * Accumulates rolling history arrays for **Altitude, Speed, and Vertical Speed** to render dynamic line graph trends.
* **Heading Compass Bezel:** **Fully Functional ✅**
  * Rotating compass rose that spins to align with current heading.

### 4. Tablet Planner
* **Plan Mission (Default):** **Fully Functional ✅**
  * Click on the map to place waypoints connected by a path. Custom altitudes and speed values are inherited automatically.
* **Waypoints Tab (Sidebar Editor):** **Fully Functional ✅**
  * Lists placed waypoints. Allows you to change individual altitudes, modify speeds, or delete waypoints.
* **Survey Parameters Tab (Sidebar Sliders):** **Fully Functional ✅**
  * Interactive sliders to configure Default Altitude, Photo Overlap, and Flight Speed. Dragging them dynamically updates target area, flight time, battery cost, and estimated picture calculations.
* **Geofences Tab (Circular Boundary):** **Fully Functional & Integrated ✅**
  * Click the map to place a red circular safety perimeter. Drag the slider to expand/contract. 
  * **Safety Trigger:** If the drone flies outside this radius during a mission, the backend detects the breach, sounds an alert in the System Alerts pane, and forces the drone into **RTL** home.
* **Obstacles Tab (Hazard Placer):** **Fully Functional & Integrated ✅**
  * Click the map to place yellow ⚠️ warning flags representing power lines, trees, or buildings.
  * **Safety Trigger:** If the drone flies within 15 meters of any hazard marker, the backend logs a critical proximity warning.
* **Upload & Start Button:** **Fully Functional & Integrated ✅**
  * Sends waypoints, geofences, and hazards to `/api/mission`. Automatically powers up and connects the simulator if it was offline.

### 5. Sensors & Ingestion Dashboard
* **Diagnostics Board:** **Fully Functional ✅**
  * Monitors real-time latency, packet loss, and uptime of simulated Raspberry Pi ingestion nodes. Automatically turns to "OFFLINE" if you disconnect the autopilot.
* **Sensor Sync Panel:** **Fully Functional ✅**
  * Tracks Gyroscope, Accelerometer, Altimeter, Camera, and Microphone sync frequencies.
* **Base Return Indicator:** **Fully Functional ✅**
  * Calculates direct distance to home base and estimates battery return safety margin, triggering **SAFE / WARNING / CRITICAL** alarms dynamically.
* *Note: Data dynamically reflects autopilot telemetry packet rates. Real Raspberry Pi inputs require running a client telemetry exporter script.*
