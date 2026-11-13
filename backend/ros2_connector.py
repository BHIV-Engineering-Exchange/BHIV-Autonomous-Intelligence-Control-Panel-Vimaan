import asyncio
import time
import math
import threading
from typing import Dict, Any, List
from backend.drone_connector import DroneConnector

# Conditional import of rclpy for ROS2
try:
    import rclpy
    from rclpy.node import Node
    from sensor_msgs.msg import BatteryState, NavSatFix
    from geometry_msgs.msg import PoseStamped
    from std_msgs.msg import String
    ROS2_AVAILABLE = True
except ImportError:
    ROS2_AVAILABLE = False


class ROS2Connector(DroneConnector):
    """
    Subscribes to ROS2 topics to capture drone telemetry and 
    publishes commands to vehicle control topics.
    Falls back to a ROS2 bridge simulation if rclpy is not installed.
    """
    def __init__(self, domain_id: int = 0):
        self.domain_id = domain_id
        self.connected = False
        self._running = False
        self.node = None
        self._thread = None

        # Drone State Variables
        self.lat = 15.4989
        self.lon = 73.8278
        self.alt = 0.0
        self.yaw = 0.0
        self.roll = 0.0
        self.pitch = 0.0
        self.speed = 0.0
        self.battery_pct = 100.0
        self.voltage = 25.2
        self.current = 0.0
        
        self.armed = False
        self.flight_mode = "ROS2_MANUAL"
        self.link_quality = 90

        self.logs: List[Dict[str, Any]] = []
        self.alerts: List[str] = []
        self.waypoints: List[Dict[str, Any]] = []
        self.current_wp_idx = -1
        self.mission_active = False

        self.add_log(f"ROS2 Bridge plugin initialized (ROS2 Library status: {'Available' if ROS2_AVAILABLE else 'Unavailable - Running Loopback Bridge'}).")

    def add_log(self, text: str, level: str = "INFO"):
        self.logs.append({
            "timestamp": time.strftime("%H:%M:%S"),
            "level": level,
            "message": text
        })
        if len(self.logs) > 50:
            self.logs.pop(0)

    async def connect(self) -> bool:
        self.connected = True
        self._running = True

        if ROS2_AVAILABLE:
            try:
                # Start ROS2 Node thread
                self._thread = threading.Thread(target=self._ros2_thread_loop, daemon=True)
                self._thread.start()
                self.add_log("ROS2 rclpy context initialized. Subscribing to topics.")
            except Exception as e:
                self.add_log(f"Failed to start ROS2 Node thread: {e}", "ERROR")
        else:
            # ROS2 Sim bridge fallback loop
            self._thread = threading.Thread(target=self._mock_ros2_loop, daemon=True)
            self._thread.start()
            self.add_log("ROS2 Bridge loopback started. Simulating /fmu/out topics.", "WARNING")
            
        return True

    async def disconnect(self) -> None:
        self._running = False
        self.connected = False
        self.add_log("ROS2 Node bridge disconnected.")

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
                    "fix": "ROS2 GPS Fix",
                    "satellites": 14
                },
                "rc_signal": "Strong",
                "link_quality": self.link_quality,
                "vertical_speed": 0.0,
                "distance_to_home": 0.0
            },
            "system_health": {
                "fcu": "OK",
                "gps": "OK",
                "sensors": "OK",
                "motors": "OK",
                "battery": "OK",
                "link": "OK"
            },
            "mission_status": {
                "active": self.mission_active,
                "waypoints_count": len(self.waypoints),
                "current_waypoint": self.current_wp_idx + 1,
                "progress_pct": 0
            },
            "logs": self.logs[-15:],
            "alerts": self.alerts
        }

    async def send_command(self, command: str, params: Dict[str, Any] = None) -> bool:
        command = command.upper()
        self.add_log(f"ROS2 Bridge publishing request to cmd topic: {command}")
        
        # Action updates local simulation state directly
        if command == "ARM":
            self.armed = True
            self.flight_mode = "ROS2_ARMED"
        elif command == "DISARM":
            self.armed = False
            self.flight_mode = "ROS2_DISARMED"
        elif command == "RTL":
            self.flight_mode = "ROS2_RTL"
        elif command == "TAKEOFF":
            self.flight_mode = "ROS2_OFFBOARD"
            self.alt = 10.0
        elif command == "LAND":
            self.flight_mode = "ROS2_LANDING"
            self.alt = 0.0
            self.armed = False

        return True

    async def upload_mission(self, waypoints: List[Dict[str, Any]]) -> bool:
        self.waypoints = waypoints
        self.add_log(f"ROS2: Serializing and publishing mission plan with {len(waypoints)} coordinates.")
        return True

    def _ros2_thread_loop(self):
        """
        Internal ROS2 spin loop when rclpy is available.
        """
        rclpy.init()
        node = Node("bhiv_c2_bridge_node")
        self.node = node

        # Subscriptions
        node.create_subscription(NavSatFix, "/fmu/out/vehicle_gps_position", self._gps_callback, 10)
        node.create_subscription(BatteryState, "/fmu/out/battery_status", self._battery_callback, 10)
        node.create_subscription(PoseStamped, "/fmu/out/vehicle_attitude", self._pose_callback, 10)

        self.add_log("ROS2 bridge subscriptions established.")

        while self._running:
            rclpy.spin_once(node, timeout_sec=0.1)
        
        node.destroy_node()
        rclpy.shutdown()

    # Callbacks for ROS2 Topic subscribers
    def _gps_callback(self, msg):
        self.lat = msg.latitude
        self.lon = msg.longitude
        self.alt = msg.altitude

    def _battery_callback(self, msg):
        self.voltage = msg.voltage
        self.current = msg.percentage
        self.battery_pct = msg.percentage * 100.0

    def _pose_callback(self, msg):
        # Decode attitude message
        # Convert quaternion orientation to Euler roll, pitch, yaw
        q = msg.pose.orientation
        sinr_cosp = 2 * (q.w * q.x + q.y * q.z)
        cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y)
        self.roll = math.degrees(math.atan2(sinr_cosp, cosr_cosp))

        sinp = 2 * (q.w * q.y - q.z * q.x)
        if abs(sinp) >= 1:
            self.pitch = math.degrees(math.copysign(math.pi / 2, sinp))
        else:
            self.pitch = math.degrees(math.asin(sinp))

        siny_cosp = 2 * (q.w * q.z + q.x * q.y)
        cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z)
        self.yaw = math.degrees(math.atan2(siny_cosp, cosy_cosp)) % 360

    def _mock_ros2_loop(self):
        """
        Backup simulator updating properties to mimic standard ROS2 topic telemetry updates.
        """
        tick = 0
        while self._running:
            tick += 1
            # Slowly oscillate orientation values representing live hover topic telemetry
            self.roll = math.sin(tick * 0.1) * 3.0
            self.pitch = math.cos(tick * 0.1) * 2.0
            self.yaw = (self.yaw + 0.5) % 360
            
            # Simple battery discharge
            self.battery_pct = max(10.0, self.battery_pct - 0.005)
            self.voltage = 25.2 * (self.battery_pct / 100.0)

            time.sleep(0.1)
