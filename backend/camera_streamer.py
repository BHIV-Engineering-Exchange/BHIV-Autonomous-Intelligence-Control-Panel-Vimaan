import io
import math
import asyncio
import subprocess
import time
from PIL import Image, ImageDraw
from typing import Generator
from backend.drone_connector import DroneConnector

# Public drone FPV footage video (stable, pre-recorded, loops cleanly)
# Using a well-known DJI / drone footage clip that is publicly available
DRONE_VIDEO_YOUTUBE_URL = "https://www.youtube.com/watch?v=kcfs1-ryKWE"

import sys

def _get_video_stream_url(yt_url: str) -> str | None:
    """Use yt-dlp to extract a direct mp4 stream URL from a YouTube video."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "yt_dlp",
             "--no-playlist",
             "-f", "best[ext=mp4][height<=480]/best[height<=480]/best",
             "--get-url", yt_url],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            url = result.stdout.strip().splitlines()[0]
            if url.startswith("http"):
                return url
    except Exception as e:
        print(f"[CameraStreamer] yt-dlp error: {e}")
    return None



class CameraStreamer:
    """
    FPV camera feed. Attempts to stream real drone footage from YouTube
    using yt-dlp + OpenCV. Falls back to a simulated PIL terrain grid
    if the real video cannot be loaded.
    """
    def __init__(self, connector: DroneConnector):
        self.connector = connector
        self.width = 640
        self.height = 360
        self.grid_offset_x = 0.0
        self.grid_offset_y = 0.0
        self._cv2_cap = None
        self._use_real_video = False
        self._init_real_video()

    def _init_real_video(self):
        """Try to open real drone footage via yt-dlp + OpenCV."""
        try:
            import cv2  # noqa: F401
        except ImportError:
            print("[CameraStreamer] opencv-python not installed, using PIL fallback.")
            return

        stream_url = _get_video_stream_url(DRONE_VIDEO_YOUTUBE_URL)
        if not stream_url:
            print("[CameraStreamer] yt-dlp could not resolve video URL, using PIL fallback.")
            return

        try:
            import cv2
            cap = cv2.VideoCapture(stream_url)
            if cap.isOpened():
                self._cv2_cap = cap
                self._use_real_video = True
                print("[CameraStreamer] Real drone footage stream opened successfully.")
            else:
                print("[CameraStreamer] OpenCV could not open stream, using PIL fallback.")
        except Exception as e:
            print(f"[CameraStreamer] OpenCV error: {e}, using PIL fallback.")



    def _frame_from_real_video(self, state: dict):
        """Read one frame from real OpenCV video capture and return as JPEG."""
        if not self._use_real_video or self._cv2_cap is None:
            return None
        try:
            import cv2
            ret, frame = self._cv2_cap.read()
            if not ret:
                self._cv2_cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = self._cv2_cap.read()
            if not ret or frame is None:
                return None
            frame = cv2.resize(frame, (self.width, self.height))
            _, jpeg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            return jpeg.tobytes()
        except Exception as e:
            print(f"[CameraStreamer] Real video error: {e}, reverting to PIL.")
            self._use_real_video = False
            return None

    def generate_frame(self) -> bytes:
        # Get active telemetry values
        import backend.main as main_mod
        if getattr(main_mod, "replay_active", False):
            state = main_mod.replay_recorder.get_current_frame()
        else:
            state = self.connector.get_telemetry()

        # Try real video first
        real_frame = self._frame_from_real_video(state)
        if real_frame is not None:
            return real_frame

        # PIL fallback below
        telemetry = state.get("telemetry", {})
        
        # Pull telemetry variables
        alt = telemetry.get("altitude", 0.0)
        speed = telemetry.get("speed", 0.0)
        heading = telemetry.get("heading", 0.0)
        roll = telemetry.get("roll", 0.0)
        pitch = telemetry.get("pitch", 0.0)
        armed = state.get("armed", False)
        mode = state.get("flight_mode", "MANUAL")
        gps = telemetry.get("gps", {})
        lat = gps.get("lat", 0.0)
        lon = gps.get("lon", 0.0)

        # 1. Background image (Earthy colors / grid)
        # We scroll the ground grid based on speed and heading
        if speed > 0.1:
            rad = math.radians(heading)
            self.grid_offset_x = (self.grid_offset_x - speed * math.sin(rad) * 2.0) % 80
            self.grid_offset_y = (self.grid_offset_y + speed * math.cos(rad) * 2.0) % 80

        # Create base canvas (Deep Navy sky color if altitude > 50, otherwise green terrain ground)
        sky_r = int(max(10, min(30, 20 + alt * 0.1)))
        sky_g = int(max(15, min(40, 24 + alt * 0.15)))
        sky_b = int(max(25, min(60, 33 + alt * 0.2)))
        
        # Let's draw an artificial horizon line division on the image
        img = Image.new("RGB", (self.width, self.height), color=(sky_r, sky_g, sky_b))
        draw = ImageDraw.Draw(img)

        # Draw scrolling ground pattern
        # The center of the horizon moves up/down with pitch, rotates with roll
        horizon_y = self.height / 2 + pitch * 2.0
        
        # Define ground shape
        # Draw a polygon representing ground
        # For simplicity, let's draw a grid patterns representing mountains or fields
        # If altitude is 0, we draw concrete drone landing pad
        if alt < 0.5:
            # Landing Pad circle
            draw.ellipse([self.width/2 - 100, self.height/2 - 50, self.width/2 + 100, self.height/2 + 50], fill=(60, 64, 73), outline=(0, 242, 254), width=3)
            # Big "H"
            draw.rectangle([self.width/2 - 15, self.height/2 - 30, self.width/2 - 5, self.height/2 + 30], fill=(255, 255, 255))
            draw.rectangle([self.width/2 + 5, self.height/2 - 30, self.width/2 + 15, self.height/2 + 30], fill=(255, 255, 255))
            draw.rectangle([self.width/2 - 15, self.height/2 - 5, self.width/2 + 15, self.height/2 + 5], fill=(255, 255, 255))
        else:
            # Draw fields / rolling terrain
            # Simple grid lines
            for i in range(-5, 15):
                # Parallel ground grid lines scrolling
                gx = i * 80 + self.grid_offset_x
                draw.line([gx, horizon_y, gx - (roll * 1.5), self.height], fill=(45, 65, 45), width=2)
                
                gy = horizon_y + i * 40 + self.grid_offset_y
                if gy > horizon_y:
                    draw.line([0, gy, self.width, gy], fill=(45, 65, 45), width=1)

        # 2. Draw Pitch Ladder (moving HUD)
        # Rotate HUD elements according to roll
        hud_center_x = self.width / 2
        hud_center_y = self.height / 2
        
        # Center reticle
        draw.line([hud_center_x - 20, hud_center_y, hud_center_x - 5, hud_center_y], fill=(0, 242, 254), width=2)
        draw.line([hud_center_x + 5, hud_center_y, hud_center_x + 20, hud_center_y], fill=(0, 242, 254), width=2)
        draw.line([hud_center_x, hud_center_y - 5, hud_center_x, hud_center_y + 5], fill=(0, 242, 254), width=2)

        # Pitch scale marks (-20 to +20 degrees)
        for p_deg in range(-20, 21, 10):
            if p_deg == 0:
                continue
            py = hud_center_y + (pitch - p_deg) * 3.0
            if 40 < py < self.height - 40:
                draw.line([hud_center_x - 30, py, hud_center_x - 10, py], fill=(0, 242, 254), width=1)
                draw.line([hud_center_x + 10, py, hud_center_x + 30, py], fill=(0, 242, 254), width=1)
                draw.text((hud_center_x - 45, py - 6), str(p_deg), fill=(0, 242, 254))
                draw.text((hud_center_x + 35, py - 6), str(p_deg), fill=(0, 242, 254))

        # Roll Arc Indicator at top
        arc_rect = [hud_center_x - 100, 40, hud_center_x + 100, 240]
        draw.arc(arc_rect, start=220, end=320, fill=(0, 242, 254), width=1)
        # Roll arrow
        arrow_x = hud_center_x + 100 * math.sin(math.radians(-roll))
        arrow_y = 140 - 100 * math.cos(math.radians(-roll))
        draw.line([hud_center_x, 140, arrow_x, arrow_y], fill=(255, 63, 94), width=1)

        # 3. Dynamic Telemetry Text Overlay (Side panels)
        draw.rectangle([10, 10, 150, 80], fill=(12, 15, 23, 180), outline=(255, 255, 255, 30))
        draw.text((20, 15), f"ALT: {alt:.1f} m", fill=(255, 255, 255))
        draw.text((20, 35), f"SPD: {speed:.1f} m/s", fill=(255, 255, 255))
        draw.text((20, 55), f"YAW: {heading:d}\u00b0", fill=(255, 255, 255))

        # System Mode Indicator
        mode_color = (16, 185, 129) if armed else (244, 63, 94)
        draw.rectangle([self.width - 150, 10, self.width - 10, 50], fill=(12, 15, 23, 180), outline=mode_color)
        draw.text((self.width - 140, 15), f"MODE: {mode}", fill=(255, 255, 255))
        draw.text((self.width - 140, 32), "ARMED" if armed else "DISARMED", fill=mode_color)

        # GPS status bottom left
        draw.text((20, self.height - 25), f"GPS: {lat:.6f}, {lon:.6f}", fill=(0, 242, 254))

        # Save to buffer as JPEG
        output = io.BytesIO()
        img.save(output, format="JPEG")
        return output.getvalue()

    async def get_stream(self) -> Generator[bytes, None, None]:
        """
        Yields multipart boundaries and frames for the MJPEG stream.
        """
        while True:
            frame = self.generate_frame()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n'
                   b'Content-Length: ' + str(len(frame)).encode() + b'\r\n\r\n' +
                   frame + b'\r\n')
            # 15 FPS streaming is more than enough and low overhead
            await asyncio.sleep(0.066)
