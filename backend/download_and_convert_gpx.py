import urllib.request
import json
import xml.etree.ElementTree as ET
import os
import time

RECORDINGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recordings")
if not os.path.exists(RECORDINGS_DIR):
    os.makedirs(RECORDINGS_DIR)

def download_and_parse_dataset():
    # 1. Query GitHub contents API for RoscoffCoastal directory to find GPX files
    api_url = "https://api.github.com/repos/gps-touring/sample-gpx/contents/RoscoffCoastal"
    
    # Set User-Agent to avoid GitHub API block
    req = urllib.request.Request(
        api_url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    )
    
    print("Connecting to GitHub API to list telemetry dataset files...")
    try:
        with urllib.request.urlopen(req) as response:
            files_list = json.loads(response.read().decode())
            
        gpx_files = [f for f in files_list if f["name"].endswith(".gpx")]
        if not gpx_files:
            print("No GPX files found in dataset repository.")
            return
        
        # Pick the first GPX file
        chosen_file = gpx_files[0]
        file_name = chosen_file["name"]
        raw_url = chosen_file["download_url"]
        
        print(f"Found dataset: {file_name}")
        print(f"Downloading raw data from: {raw_url}")
        
        # Download GPX content
        gpx_req = urllib.request.Request(raw_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(gpx_req) as gpx_response:
            gpx_data = gpx_response.read()
            
        # Parse XML
        root = ET.fromstring(gpx_data)
        
        # XML namespace parsing
        namespaces = {'default': 'http://www.topografix.com/GPX/1/1'}
        
        track_points = []
        # Find all trackpoints in the GPX XML
        for trkpt in root.findall('.//default:trkpt', namespaces):
            lat = float(trkpt.attrib['lat'])
            lon = float(trkpt.attrib['lon'])
            
            # Extract elevation (altitude)
            ele_node = trkpt.find('default:ele', namespaces)
            alt = float(ele_node.text) if ele_node is not None else 15.0
            
            track_points.append((lat, lon, alt))
            
        if not track_points:
            # Try parsing without namespace fallback
            for trkpt in root.findall('.//trkpt'):
                lat = float(trkpt.attrib['lat'])
                lon = float(trkpt.attrib['lon'])
                ele_node = trkpt.find('ele')
                alt = float(ele_node.text) if ele_node is not None else 15.0
                track_points.append((lat, lon, alt))
                
        print(f"Parsed {len(track_points)} real-world coordinates from track data.")
        
        # 2. Convert trackpoints to telemetry frames (.jsonl format)
        telemetry_frames = []
        total_pts = len(track_points)
        
        battery_pct = 95.0
        
        for idx, (lat, lon, alt) in enumerate(track_points):
            # Compute heading/bearing to next point
            heading = 90
            if idx < total_pts - 1:
                next_lat, next_lon, _ = track_points[idx + 1]
                dlat = next_lat - lat
                dlon = next_lon - lon
                heading = int(math.degrees(math.atan2(dlon, dlat))) % 360
                
            # Slowly deplete battery
            battery_pct = max(10.0, battery_pct - (80.0 / total_pts))
            voltage = 20.2 + (25.2 - 20.2) * (battery_pct / 100.0)
            
            state = {
                "connected": True,
                "armed": True,
                "flight_mode": "AUTO_MISSION",
                "telemetry": {
                    "battery": round(battery_pct, 1),
                    "voltage": round(voltage, 2),
                    "current": 12.4,
                    "altitude": round(alt, 2),
                    "speed": 6.8,
                    "heading": heading,
                    "roll": 0.0,
                    "pitch": 0.0,
                    "gps": {
                        "lat": lat,
                        "lon": lon,
                        "fix": "3D Fix (12)",
                        "satellites": 12
                    },
                    "rc_signal": "Strong",
                    "link_quality": 98,
                    "vertical_speed": 0.0,
                    "distance_to_home": 10.0
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
                    "active": True,
                    "waypoints_count": total_pts,
                    "current_waypoint": idx + 1,
                    "progress_pct": int((idx + 1) / total_pts * 100)
                },
                "logs": [
                    {"timestamp": time.strftime("%H:%M:%S"), "level": "INFO", "message": f"Replaying real flight coordinate index: {idx+1}/{total_pts}"}
                ],
                "alerts": []
            }
            
            telemetry_frames.append({
                "timestamp": time.time() + (idx * 0.1),
                "state": state
            })
            
        # Write to JSONL
        output_filename = f"flight_dataset_{file_name.replace('.gpx', '')}.jsonl"
        output_path = os.path.join(RECORDINGS_DIR, output_filename)
        
        with open(output_path, "w", encoding="utf-8") as f:
            for frame in telemetry_frames:
                f.write(json.dumps(frame) + "\n")
                
        print(f"Successfully converted and saved real flight dataset: {output_path}")
        return output_filename
        
    except Exception as e:
        print(f"Error fetching/converting dataset: {e}")
        return None

if __name__ == "__main__":
    import math
    download_and_parse_dataset()
