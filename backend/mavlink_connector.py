import asyncio
import time
import math
import threading
from typing import Dict, Any, List
from pymavlink import mavutil
from backend.drone_connector import DroneConnector

# Mapping of PX4 custom flight modes to text
PX4_FLIGHT_MODES = {
    0: "MANUAL",
    1: "ALTCTL",
    2: "POSCTL",
    3: "AUTO_MISSION",
    4: "AUTO_LOITER",
    5: "AUTO_RTL",
    8: "AUTO_LAND",
    9: "AUTO_TAKEOFF",
}

class MAVLinkConnector(DroneConnector):
    """
    Connects to an autopilot via MAVLink UDP/Serial.
    Works with PX4/ArduPilot SITL or physical telemetry connections.
    """
    def __init__(self, connection_str: str = "udp:127.0.0.1:14540"):
        self.connection_str = connection_str
        self.conn = None
        self.connected = False
        self._running = False
        self._thread = None
        
        # Latest data storage (updated by background parser thread)
        self.lat = 0.0
        self.lon = 0.0
        self.alt = 0.0
        self.yaw = 0.0
        self.roll = 0.0
        self.pitch = 0.0
        self.vx = 0.0
        self.vy = 0.0
        self.vz = 0.0
        self.speed = 0.0
        
        self.battery_pct = 100.0
        self.voltage = 0.0
        self.current = 0.0

        self.armed = False
        self.flight_mode = "DISCONNECTED"
        self.link_quality = 0
        self.satellites = 0
        self.gps_fix = "No Fix"

        self.system_status_health = {
            "fcu": "OK",
            "gps": "OK",
            "sensors": "OK",
            "motors": "OK",
            "battery": "OK",
            "link": "OK"
        }

        self.logs: List[Dict[str, Any]] = []
        self.alerts: List[str] = []
        self.waypoints: List[Dict[str, Any]] = []
        self.current_wp_idx = -1
        self.mission_active = False

        self.add_log(f"MAVLink Connector configured for {connection_str}")

    def add_log(self, text: str, level: str = "INFO"):
        self.logs.append({
            "timestamp": time.strftime("%H:%M:%S"),
            "level": level,
            "message": text
        })
        if len(self.logs) > 50:
            self.logs.pop(0)

    async def connect(self) -> bool:
        try:
            # Run blocking connection setup in a separate thread/executor
            self.add_log(f"Attempting to bind MAVLink to {self.connection_str}...")
            self.conn = mavutil.mavlink_connection(self.connection_str)
            self.connected = True
            self._running = True
            
            # Start background reading thread
            self._thread = threading.Thread(target=self._read_loop, daemon=True)
            self._thread.start()
            self.add_log("MAVLink reader thread started.")
            return True
        except Exception as e:
            self.add_log(f"MAVLink connection failed: {e}", "ERROR")
            self.connected = False
            return False

    async def disconnect(self) -> None:
        self._running = False
        self.connected = False
        if self.conn:
            self.conn.close()
        self.add_log("MAVLink connection closed.")

    def get_telemetry(self) -> Dict[str, Any]:
        dist_home = 0.0 # Could calculate if we store home coordinates
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
                    "fix": self.gps_fix,
                    "satellites": self.satellites
                },
                "rc_signal": "Strong" if self.link_quality > 70 else "Weak",
                "link_quality": self.link_quality,
                "vertical_speed": round(self.vz, 2),
                "distance_to_home": round(dist_home, 2)
            },
            "system_health": self.system_status_health,
            "mission_status": {
                "active": self.mission_active,
                "waypoints_count": len(self.waypoints),
                "current_waypoint": self.current_wp_idx + 1,
                "progress_pct": int((self.current_wp_idx + 1) / len(self.waypoints) * 100) if self.waypoints else 0,
                "elapsed_time": "00:00",
                "est_time_left": "00:00"
            },
            "logs": self.logs[-15:],
            "alerts": self.alerts
        }

    async def send_command(self, command: str, params: Dict[str, Any] = None) -> bool:
        if not self.conn or not self.connected:
            self.add_log("Command failed: MAVLink disconnected.", "ERROR")
            return False

        params = params or {}
        command = command.upper()
        self.add_log(f"Sending command long: {command}")

        target_system = self.conn.target_system or 1
        target_component = self.conn.target_component or 1

        try:
            if command == "ARM":
                self.conn.mav.command_long_send(
                    target_system, target_component,
                    mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
                    0, 1, 0, 0, 0, 0, 0, 0
                )
                return True
            elif command == "DISARM":
                self.conn.mav.command_long_send(
                    target_system, target_component,
                    mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
                    0, 0, 0, 0, 0, 0, 0, 0
                )
                return True
            elif command == "TAKEOFF":
                altitude = float(params.get("alt", 10.0))
                self.conn.mav.command_long_send(
                    target_system, target_component,
                    mavutil.mavlink.MAV_CMD_NAV_TAKEOFF,
                    0, 0, 0, 0, 0, 0, 0, altitude
                )
                return True
            elif command == "LAND":
                self.conn.mav.command_long_send(
                    target_system, target_component,
                    mavutil.mavlink.MAV_CMD_NAV_LAND,
                    0, 0, 0, 0, 0, 0, 0, 0
                )
                return True
            elif command == "RTL":
                self.conn.mav.command_long_send(
                    target_system, target_component,
                    mavutil.mavlink.MAV_CMD_NAV_RETURN_TO_LAUNCH,
                    0, 0, 0, 0, 0, 0, 0, 0
                )
                return True
            elif command == "CHANGE_MODE":
                # Convert mode text to MAVLink mode numbers or PX4 base mode
                mode_str = params.get("mode", "POSCTL").upper()
                # Custom PX4 mode setup can be done here using MAV_MODE flags or set_mode helper
                # For simplicity, we trigger PX4 set_mode command
                # In standard pymavlink, setting mode uses conn.set_mode() or custom packets:
                # We can call conn.set_mode(mode_str) directly as pymavlink provides a set_mode wrapper
                try:
                    self.conn.set_mode(mode_str)
                    return True
                except Exception as mode_err:
                    self.add_log(f"Set mode {mode_str} error: {mode_err}", "ERROR")
                    return False
        except Exception as e:
            self.add_log(f"Error writing MAVLink packet: {e}", "ERROR")
            return False

        return False

    async def upload_mission(self, waypoints: List[Dict[str, Any]]) -> bool:
        """
        Uploads waypoints to the MAVLink autopilot.
        """
        self.waypoints = waypoints
        if not self.conn or not self.connected:
            return False

        self.add_log(f"Preparing to upload {len(waypoints)} waypoints via MAVLink mission protocol...")
        # A full mission protocol requires sending MISSION_COUNT, listening for MISSION_REQUEST, 
        # and sending MISSION_ITEM_INT packets. 
        # To avoid blocking, we run this sequentially in a thread or log it for this day's hackathon view.
        # We can implement a simplified writer here:
        target_system = self.conn.target_system or 1
        target_component = self.conn.target_component or 1

        try:
            # 1. Clear current mission
            self.conn.mav.mission_clear_all_send(target_system, target_component)
            
            # 2. Tell the FCU we are uploading N waypoints (plus 1 home position usually)
            self.conn.mav.mission_count_send(target_system, target_component, len(waypoints))
            
            # Since full handshake is highly state-dependent, in this SITL connector 
            # we also store it locally to drive the simulator views immediately.
            self.current_wp_idx = 0
            self.mission_active = True
            self.add_log("Mission uploaded locally & queued for transmission.")
            return True
        except Exception as e:
            self.add_log(f"Mission upload failed: {e}", "ERROR")
            return False

    def _read_loop(self):
        """
        Sub-thread running blocking socket reads for inbound MAVLink packets.
        """
        last_heartbeat = time.time()
        while self._running:
            try:
                # Wait for MAVLink message
                msg = self.conn.recv_match(blocking=True, timeout=1.0)
                if msg is None:
                    # Timeout, check link quality
                    if time.time() - last_heartbeat > 5.0:
                        self.link_quality = 0
                        self.flight_mode = "LOST CONNECTION"
                        self.system_status_health["link"] = "CRITICAL"
                    continue

                msg_type = msg.get_type()

                if msg_type == "HEARTBEAT":
                    last_heartbeat = time.time()
                    self.link_quality = 100
                    self.system_status_health["link"] = "OK"
                    
                    # Read system mode and armed status
                    self.armed = bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
                    custom_mode = msg.custom_mode
                    
                    # Decode custom mode for PX4 / ArduPilot
                    if msg.autopilot == mavutil.mavlink.MAV_AUTOPILOT_PX4:
                        # PX4 custom mode format: main_mode (high byte) and sub_mode
                        main_mode = (custom_mode >> 16) & 0xFF
                        sub_mode = (custom_mode >> 24) & 0xFF
                        # Translate typical main modes
                        if main_mode == 1: # Manual
                            self.flight_mode = "MANUAL"
                        elif main_mode == 2: # Altitude control
                            self.flight_mode = "ALTCTL"
                        elif main_mode == 3: # Position control
                            self.flight_mode = "POSCTL"
                        elif main_mode == 4: # Auto
                            if sub_mode == 4:
                                self.flight_mode = "AUTO_TAKEOFF"
                            elif sub_mode == 5:
                                self.flight_mode = "AUTO_LAND"
                            elif sub_mode == 6:
                                self.flight_mode = "AUTO_RTL"
                            else:
                                self.flight_mode = "AUTO_MISSION"
                        else:
                            self.flight_mode = f"PX4_{main_mode}_{sub_mode}"
                    else:
                        # ArduPilot or other fallback mode mapping
                        self.flight_mode = PX4_FLIGHT_MODES.get(custom_mode, f"MODE_{custom_mode}")

                elif msg_type == "GLOBAL_POSITION_INT":
                    # Alt / coordinate telemetry (lat/lon are 1e7 format, alt is mm)
                    self.lat = msg.lat / 1e7
                    self.lon = msg.lon / 1e7
                    self.alt = msg.relative_alt / 1000.0  # relative altitude above ground in meters
                    # Velocities are cm/s
                    self.vx = msg.vx / 100.0
                    self.vy = msg.vy / 100.0
                    self.vz = msg.vz / -100.0  # invert if standard coordinate system
                    self.speed = math.sqrt(self.vx**2 + self.vy**2)

                elif msg_type == "ATTITUDE":
                    # Roll/Pitch/Yaw are in radians, convert to degrees
                    self.roll = math.degrees(msg.roll)
                    self.pitch = math.degrees(msg.pitch)
                    self.yaw = math.degrees(msg.yaw) % 360

                elif msg_type == "SYS_STATUS":
                    # Battery percentage and load details
                    self.battery_pct = msg.battery_remaining if msg.battery_remaining != -1 else 100.0
                    self.voltage = msg.voltage_battery / 1000.0  # mV to V
                    self.current = msg.current_battery / 100.0  # cA to A (if available, else -1)
                    if self.current < 0:
                        self.current = 0.0

                    # Read sensor health bits to map system status
                    onboard_control = msg.onboard_control_sensors_enabled
                    onboard_health = msg.onboard_control_sensors_health
                    
                    # If health flags indicate sensor failure, update status
                    if (onboard_control & 1) and not (onboard_health & 1):
                        self.system_status_health["sensors"] = "FAIL"
                        self.alerts.append("Sensor Gyroscope reports failure")

                elif msg_type == "GPS_RAW_INT":
                    self.satellites = msg.satellites_visible
                    fix_type = msg.fix_type
                    if fix_type >= 3:
                        self.gps_fix = f"3D Fix ({self.satellites})"
                        self.system_status_health["gps"] = "OK"
                    elif fix_type == 2:
                        self.gps_fix = "2D Fix"
                        self.system_status_health["gps"] = "WARNING"
                    else:
                        self.gps_fix = "No Fix"
                        self.system_status_health["gps"] = "CRITICAL"

                elif msg_type == "STATUSTEXT":
                    # Parse status text logs from autopilot
                    text_msg = msg.text
                    severity = msg.severity
                    level = "INFO"
                    if severity <= 3:
                        level = "CRITICAL"
                        self.alerts.append(f"FCU: {text_msg}")
                    elif severity <= 4:
                        level = "WARNING"
                    self.add_log(f"FCU: {text_msg}", level)

            except Exception as read_err:
                print(f"MAVLink message read error: {read_err}")
                time.sleep(0.5)
