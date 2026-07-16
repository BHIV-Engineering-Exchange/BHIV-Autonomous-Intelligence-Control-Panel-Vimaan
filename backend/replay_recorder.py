import os
import json
import time
import asyncio
from typing import List, Dict, Any

RECORDINGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recordings")

class ReplayRecorder:
    """
    Manages telemetry logging for flight analysis playback.
    """
    def __init__(self):
        self.is_recording = False
        self.current_file = None
        self.current_filename = None
        self.playback_data: List[Dict[str, Any]] = []
        self.playback_index = 0
        self.is_playing = False

        if not os.path.exists(RECORDINGS_DIR):
            os.makedirs(RECORDINGS_DIR)

    def start_recording(self) -> str:
        if self.is_recording:
            return self.current_filename

        timestamp = time.strftime("%Y%m%d_%H%M%S")
        self.current_filename = f"flight_{timestamp}.jsonl"
        filepath = os.path.join(RECORDINGS_DIR, self.current_filename)
        
        self.current_file = open(filepath, "w", encoding="utf-8")
        self.is_recording = True
        return self.current_filename

    def stop_recording(self):
        if not self.is_recording:
            return
        
        self.is_recording = False
        if self.current_file:
            self.current_file.close()
            self.current_file = None
        self.current_filename = None

    def record_telemetry(self, telemetry_state: Dict[str, Any]):
        if not self.is_recording or not self.current_file:
            return
        
        # Write state snapshot with timestamp
        snapshot = {
            "timestamp": time.time(),
            "state": telemetry_state
        }
        try:
            self.current_file.write(json.dumps(snapshot) + "\n")
            self.current_file.flush()
        except Exception as e:
            print(f"Error writing flight recording: {e}")

    def list_recordings(self) -> List[Dict[str, Any]]:
        recordings = []
        if not os.path.exists(RECORDINGS_DIR):
            return []
        
        for file in os.listdir(RECORDINGS_DIR):
            if file.endswith(".jsonl"):
                path = os.path.join(RECORDINGS_DIR, file)
                size = os.path.getsize(path)
                # Estimate duration or size in count
                recordings.append({
                    "filename": file,
                    "size_bytes": size,
                    "date": file.replace("flight_", "").replace(".jsonl", "")
                })
        return sorted(recordings, key=lambda x: x["filename"], reverse=True)

    def load_recording(self, filename: str) -> bool:
        filepath = os.path.join(RECORDINGS_DIR, filename)
        if not os.path.exists(filepath):
            return False
        
        self.playback_data = []
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip():
                        self.playback_data.append(json.loads(line))
            self.playback_index = 0
            return len(self.playback_data) > 0
        except Exception as e:
            print(f"Error loading flight recording for playback: {e}")
            return False

    def get_next_playback_frame(self) -> Dict[str, Any]:
        if not self.playback_data:
            return {}
        
        frame = self.playback_data[self.playback_index]
        # Cycle playback index
        self.playback_index = (self.playback_index + 1) % len(self.playback_data)

        # Support both formats:
        # 1. Recorder format: {"timestamp": ..., "state": {...}}
        # 2. Direct dataset format (GPX/ArduPilot): {"connected": ..., "telemetry": ..., ...}
        if "state" in frame:
            res = frame["state"]
        else:
            res = frame
        self.current_frame = res
        return res

    def get_current_frame(self) -> Dict[str, Any]:
        return getattr(self, "current_frame", {})


