import asyncio
import time
import math
from typing import Dict, Any, List

class DroneConnector:
    """
    Abstract interface for drone connections.
    Supports either real MAVLink connection or simulated physics engine.
    """
    async def connect(self) -> bool:
        raise NotImplementedError()

    async def disconnect(self) -> None:
        raise NotImplementedError()

    def get_telemetry(self) -> Dict[str, Any]:
        raise NotImplementedError()

    async def send_command(self, command: str, params: Dict[str, Any] = None) -> bool:
        raise NotImplementedError()

    async def upload_mission(self, waypoints: List[Dict[str, Any]]) -> bool:
        raise NotImplementedError()


class SimulatorConnector(DroneConnector):
    """
    Simulates a PX4-like autopilot with live coordinate movement, 
    battery drain, mission tracking, and manual command overrides.
    """
    def __init__(self):
        # Initial home position (matches the Leaflet Map defaults around a default coordinate, e.g., near Mumbai/Goa)
        self.home_lat = 15.4989
        self.home_lon = 73.8278
        self.home_alt = 0.0

        # Current state variables
        self.lat = self.home_lat
        self.lon = self.home_lon
        self.alt = 0.0
        self.yaw = 135.0  # Heading degrees
        self.roll = 0.0
        self.pitch = 0.0
        self.vx = 0.0
        self.vy = 0.0
        self.vz = 0.0
        self.speed = 0.0
        
        # Battery state
        self.battery_pct = 95.0
        self.voltage = 24.8
        self.current = 0.5 # Amps

        # Connection & System Health
        self.connected = False
        self.armed = False
        self.flight_mode = "MANUAL"
        self.link_quality = 98

        self.fcu_health = "OK"
        self.gps_health = "OK"
        self.sensors_health = "OK"
        self.motors_health = "OK"
        self.battery_health = "OK"
        self.link_health = "OK"

        # Mission control
        self.waypoints: List[Dict[str, Any]] = []
        self.current_wp_idx = -1
        self.mission_active = False
        self.geofence: Dict[str, Any] = {}
        self.obstacles: List[Dict[str, Any]] = []

        # Logs & alerts
        self.logs: List[Dict[str, Any]] = []
        self.alerts: List[str] = []

        # Background simulator task
        self.sim_task = None
        self._running = False

        self.add_log("Simulator connector initialized. Ready for connections.")

    def add_log(self, text: str, level: str = "INFO"):
        self.logs.append({
            "timestamp": time.strftime("%H:%M:%S"),
            "level": level,
            "message": text
        })
        # Keep logs under 100 entries
        if len(self.logs) > 100:
            self.logs.pop(0)

    def trigger_alert(self, text: str):
        if text not in self.alerts:
            self.alerts.append(text)
            self.add_log(f"ALERT: {text}", "WARNING")

    def clear_alert(self, text: str):
        if text in self.alerts:
            self.alerts.remove(text)
            self.add_log(f"ALERT CLEARED: {text}", "INFO")

    async def connect(self) -> bool:
        self.connected = True
        self._running = True
        # Pre-load a default SURVEY_01 waypoint mission
        self.waypoints = [
            {"lat": 15.4995, "lon": 73.8285, "alt": 30.0, "speed": 8.0},
            {"lat": 15.5005, "lon": 73.8295, "alt": 35.0, "speed": 8.0},
            {"lat": 15.5010, "lon": 73.8278, "alt": 35.0, "speed": 8.0},
            {"lat": 15.5000, "lon": 73.8265, "alt": 30.0, "speed": 8.0},
            {"lat": 15.4989, "lon": 73.8278, "alt": 20.0, "speed": 6.0},
        ]
        self.sim_task = asyncio.create_task(self._simulation_loop())
        self.add_log("Drone connected successfully.")
        self.add_log("Default SURVEY_01 mission loaded (5 waypoints).")
        return True


    async def disconnect(self) -> None:
        self._running = False
        if self.sim_task:
            self.sim_task.cancel()
        self.connected = False
        self.add_log("Drone disconnected.")

    def get_telemetry(self) -> Dict[str, Any]:
        return {
            "connected": self.connected,
            "armed": self.armed,
            "flight_mode": self.flight_mode,
            "telemetry": {
                "battery": round(self.battery_pct, 1),
                "voltage": round(self.voltage, 2),
                "current": round(self.current, 1),
                "altitude": round(self.alt, 2),
                "speed": round(self.speed, 2),
                "heading": int(self.yaw) % 360,
                "roll": round(self.roll, 1),
                "pitch": round(self.pitch, 1),
                "gps": {
                    "lat": self.lat,
                    "lon": self.lon,
                    "fix": "3D Fix (12)" if self.connected else "No GPS",
                    "satellites": 12 if self.connected else 0
                },
                "rc_signal": "Strong" if self.connected else "None",
                "link_quality": self.link_quality,
                "vertical_speed": round(self.vz, 2),
                "distance_to_home": round(self.get_distance_to_home(), 2)
            },
            "system_health": {
                "fcu": self.fcu_health,
                "gps": self.gps_health,
                "sensors": self.sensors_health,
                "motors": self.motors_health,
                "battery": self.battery_health,
                "link": self.link_health
            },
            "mission_status": {
                "active": self.mission_active,
                "waypoints_count": len(self.waypoints),
                "current_waypoint": self.current_wp_idx + 1,
                "progress_pct": int((self.current_wp_idx + 1) / len(self.waypoints) * 100) if self.waypoints else 0,
                "elapsed_time": "12:46", # format string or calculated timestamp
                "est_time_left": "18:12"
            },
            "logs": self.logs[-15:], # Send latest 15 logs
            "alerts": self.alerts
        }

    def get_distance_to_home(self) -> float:
        # Simple flat distance estimation in meters
        dlat = (self.lat - self.home_lat) * 111320
        dlon = (self.lon - self.home_lon) * 111320 * math.cos(math.radians(self.home_lat))
        return math.sqrt(dlat**2 + dlon**2)

    def ensure_running(self):
        if not self._running:
            self.connected = True
            self._running = True
            self.sim_task = asyncio.create_task(self._simulation_loop())
            self.add_log("Autopilot auto-connected on command dispatch.")

    async def upload_mission(self, waypoints: List[Dict[str, Any]], geofence: Dict[str, Any] = None, obstacles: List[Dict[str, Any]] = None) -> bool:
        self.ensure_running()
        self.waypoints = waypoints
        self.current_wp_idx = -1
        self.mission_active = False
        self.geofence = geofence or {}
        self.obstacles = obstacles or []
        self.add_log(f"Mission uploaded. {len(waypoints)} waypoints, geofence={'yes' if geofence else 'no'}, obstacles={len(self.obstacles)}.")
        return True

    async def send_command(self, command: str, params: Dict[str, Any] = None) -> bool:
        self.ensure_running()
        params = params or {}
        command = command.upper()
        self.add_log(f"Received command: {command} with params {params}")

        if command == "ARM":
            self.armed = True
            self.motors_health = "OK"
            self.add_log("Motors ARMED.")
            return True
        elif command == "DISARM":
            self.armed = False
            self.speed = 0.0
            self.vx, self.vy, self.vz = 0.0, 0.0, 0.0
            self.add_log("Motors DISARMED.")
            return True
        elif command == "TAKEOFF":
            if not self.armed:
                self.armed = True
                self.add_log("Auto-arming before takeoff.")
            self.flight_mode = "TAKEOFF"
            self.add_log("Executing auto-takeoff...")
            return True
        elif command == "LAND":
            self.flight_mode = "LAND"
            self.add_log("Executing auto-landing...")
            return True
        elif command == "RTL":
            self.flight_mode = "RTL"
            self.add_log("Returning to Launch (RTL)...")
            return True
        elif command == "START_MISSION":
            if not self.waypoints:
                self.add_log("Cannot start mission: No waypoints uploaded.", "ERROR")
                return False
            if not self.armed:
                self.armed = True
                self.add_log("Auto-arming before mission start.")
            self.flight_mode = "AUTO"
            self.mission_active = True
            self.current_wp_idx = 0
            self.add_log(f"Starting mission Survey_01. Navigating to Waypoint 1.")
            return True
        elif command == "PAUSE_MISSION":
            self.mission_active = False
            self.flight_mode = "POSCTL"
            self.speed = 0.0
            self.vx, self.vy, self.vz = 0.0, 0.0, 0.0
            self.add_log("Mission paused. Holding position.")
            return True
        elif command == "CHANGE_MODE":
            mode = params.get("mode", "MANUAL").upper()
            self.flight_mode = mode
            self.add_log(f"Flight mode changed to {mode}.")
            return True
        
        self.add_log(f"Command {command} unhandled.", "WARNING")
        return False

    async def _simulation_loop(self):
        """
        Background simulation thread simulating 10Hz updates.
        """
        dt = 0.1  # 10Hz frequency
        tick_counter = 0

        while self._running:
            try:
                tick_counter += 1
                
                # 1. Update Battery details
                if self.armed:
                    # Drain battery faster if armed and flying
                    drain = 0.02 if self.alt > 1.0 else 0.005
                    self.current = 15.6 if self.alt > 1.0 else 2.5
                else:
                    drain = 0.001
                    self.current = 0.5
                
                self.battery_pct = max(0.0, self.battery_pct - drain)
                self.voltage = max(18.0, 25.2 * (self.battery_pct / 100.0))

                # Alert if battery is low
                if self.battery_pct < 20.0:
                    self.trigger_alert("Low Battery Warning (Below 20%)")
                    self.battery_health = "WARNING"
                if self.battery_pct < 10.0:
                    self.trigger_alert("CRITICAL Battery Warning (Below 10%)")
                    self.battery_health = "CRITICAL"

                # 2a. Geofence breach check
                if self.armed and self.geofence.get("lat") is not None:
                    gf_lat = self.geofence["lat"]
                    gf_lng = self.geofence.get("lng", self.geofence.get("lon", 0.0))
                    gf_radius = self.geofence.get("radius", 150.0)
                    dlat_m = (self.lat - gf_lat) * 111320
                    dlon_m = (self.lon - gf_lng) * 111320 * math.cos(math.radians(gf_lat))
                    dist_from_center = math.sqrt(dlat_m**2 + dlon_m**2)
                    if dist_from_center > gf_radius:
                        alert_msg = f"GEOFENCE BREACHED! ({dist_from_center:.0f}m from center, limit {gf_radius:.0f}m) — Initiating RTL."
                        self.trigger_alert(alert_msg)
                        if self.flight_mode not in ("RTL", "LAND"):
                            self.flight_mode = "RTL"
                            self.mission_active = False
                            self.add_log(alert_msg, "WARNING")

                # 2b. Obstacle proximity check
                if self.armed and self.obstacles:
                    for obs in self.obstacles:
                        o_lat = obs.get("lat", 0.0)
                        o_lng = obs.get("lng", obs.get("lon", 0.0))
                        o_name = obs.get("name", "Unknown Hazard")
                        dlat_m = (self.lat - o_lat) * 111320
                        dlon_m = (self.lon - o_lng) * 111320 * math.cos(math.radians(o_lat))
                        dist_to_obs = math.sqrt(dlat_m**2 + dlon_m**2)
                        if dist_to_obs < 15.0:  # Within 15 metres
                            self.trigger_alert(f"COLLISION ALERT: {o_name} is {dist_to_obs:.1f}m away!")

                # 2. Simulate Flight Physics / Behavior based on mode
                if self.flight_mode == "TAKEOFF":
                    self.vz = 2.0  # Ascend at 2m/s
                    self.speed = 0.0
                    self.pitch = -5.0  # Slightly nose up
                    self.roll = 0.0
                    self.alt += self.vz * dt
                    # Rotate slightly to simulate wind/yaw correction
                    self.yaw = (self.yaw + 1.2) % 360

                    if self.alt >= 15.0: # Hover height
                        self.alt = 15.0
                        self.vz = 0.0
                        self.pitch = 0.0
                        self.flight_mode = "POSCTL"
                        self.add_log("Takeoff complete. Hovering at 15.0 meters.")

                elif self.flight_mode == "LAND":
                    self.vz = -1.5  # Descend at 1.5m/s
                    self.speed = 1.0
                    self.pitch = 3.0  # Nose down slightly
                    self.roll = math.sin(tick_counter * 0.1) * 2.0 # Wobble
                    self.alt += self.vz * dt
                    
                    # Drift slightly towards home
                    dlat = (self.home_lat - self.lat)
                    dlon = (self.home_lon - self.lon)
                    dist = math.sqrt(dlat**2 + dlon**2)
                    if dist > 0.00001:
                        self.lat += (dlat / dist) * 0.00005 * dt
                        self.lon += (dlon / dist) * 0.00005 * dt

                    if self.alt <= 0.2:
                        self.alt = 0.0
                        self.vz = 0.0
                        self.pitch = 0.0
                        self.roll = 0.0
                        self.speed = 0.0
                        self.armed = False
                        self.flight_mode = "MANUAL"
                        self.add_log("Landing complete. Motors disarmed.")

                elif self.flight_mode == "RTL":
                    # Fly towards home lat/lon, keep altitude of 20m
                    target_alt = 20.0
                    
                    # Ascend if below target_alt
                    if self.alt < target_alt - 0.5:
                        self.vz = 2.0
                    elif self.alt > target_alt + 0.5:
                        self.vz = -1.5
                    else:
                        self.vz = 0.0

                    self.alt += self.vz * dt

                    # Calculate direction to home
                    dlat = self.home_lat - self.lat
                    dlon = self.home_lon - self.lon
                    distance = math.sqrt(dlat**2 + dlon**2)

                    if distance > 0.00005:  # Not arrived yet
                        target_yaw = math.degrees(math.atan2(dlon, dlat)) % 360
                        # Smooth yaw transition
                        self.yaw = self.yaw + math.copysign(min(5.0, abs(target_yaw - self.yaw)), target_yaw - self.yaw)
                        
                        self.speed = 8.5
                        # Update lat/lon
                        self.lat += (dlat / distance) * 0.0001 * dt
                        self.lon += (dlon / distance) * 0.0001 * dt
                        self.roll = -5.0 if dlon > 0 else 5.0
                        self.pitch = -8.0 # Lean forward
                    else:
                        self.speed = 0.0
                        self.roll = 0.0
                        self.pitch = 0.0
                        self.add_log("RTL: Reached home station coordinates. Landing...")
                        self.flight_mode = "LAND"

                elif self.flight_mode == "AUTO" and self.mission_active:
                    # Navigate waypoints
                    if 0 <= self.current_wp_idx < len(self.waypoints):
                        wp = self.waypoints[self.current_wp_idx]
                        target_lat = wp["lat"]
                        target_lon = wp.get("lon", wp.get("lng", 0.0))  # support both "lon" and "lng"
                        target_alt = wp.get("alt", 20.0)

                        # Calculate distance to current waypoint
                        dlat = target_lat - self.lat
                        dlon = target_lon - self.lon
                        distance = math.sqrt(dlat**2 + dlon**2)

                        # Heading
                        target_yaw = math.degrees(math.atan2(dlon, dlat)) % 360
                        diff_yaw = (target_yaw - self.yaw + 180) % 360 - 180
                        self.yaw = (self.yaw + diff_yaw * 0.15) % 360

                        # Adjust Altitude
                        if self.alt < target_alt - 0.5:
                            self.vz = 2.0
                        elif self.alt > target_alt + 0.5:
                            self.vz = -1.5
                        else:
                            self.vz = 0.0
                        self.alt += self.vz * dt

                        if distance > 0.00003: # Arbitrary threshold for waypoint arrival
                            self.speed = wp.get("speed", 8.2)
                            self.lat += (dlat / distance) * (self.speed * 0.00001) * dt
                            self.lon += (dlon / distance) * (self.speed * 0.00001) * dt
                            self.pitch = -8.0
                            self.roll = clamp(diff_yaw * 0.5, -15.0, 15.0)
                        else:
                            # Waypoint reached
                            self.add_log(f"Waypoint {self.current_wp_idx + 1} reached.")
                            self.current_wp_idx += 1
                            if self.current_wp_idx >= len(self.waypoints):
                                self.add_log("Mission completed. Entering RTL...")
                                self.mission_active = False
                                self.flight_mode = "RTL"
                            else:
                                self.add_log(f"Navigating to Waypoint {self.current_wp_idx + 1}.")
                    else:
                        self.flight_mode = "RTL"

                elif self.flight_mode == "MANUAL":
                    # Stationary or drift slightly
                    self.speed = 0.0
                    self.vx = 0.0
                    self.vy = 0.0
                    self.vz = 0.0
                    self.roll = 0.0
                    self.pitch = 0.0
                    if self.alt > 0:
                        # Falling if motor is not spinning
                        self.vz = -9.81
                        self.alt = max(0.0, self.alt + self.vz * dt)
                        if self.alt == 0:
                            self.armed = False
                            self.add_log("Crash or hard landing: zero altitude in MANUAL.")
                            self.trigger_alert("Crash detected! Zero altitude in MANUAL mode.")

                else: # POSCTL / Hover
                    self.vz = 0.0
                    self.speed = 0.0
                    # Add simple hover wind noise
                    self.roll = math.sin(tick_counter * 0.2) * 1.5
                    self.pitch = math.cos(tick_counter * 0.2) * 1.5
                    self.yaw = (self.yaw + 0.1) % 360

            except Exception as e:
                print(f"Simulation tick error: {e}")
            
            await asyncio.sleep(dt)

def clamp(val, min_v, max_v):
    return max(min_v, min(max_v, val))
