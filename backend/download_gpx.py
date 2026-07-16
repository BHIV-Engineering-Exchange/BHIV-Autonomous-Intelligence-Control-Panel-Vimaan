import urllib.request
import os

RECORDINGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recordings")
if not os.path.exists(RECORDINGS_DIR):
    os.makedirs(RECORDINGS_DIR)

gpx_url = "https://raw.githubusercontent.com/gps-touring/gpx-viewer/master/test/test.gpx"
target_path = os.path.join(RECORDINGS_DIR, "test_track.gpx")

print(f"Downloading real-world flight GPX track dataset from: {gpx_url}")
try:
    urllib.request.urlretrieve(gpx_url, target_path)
    file_size = os.path.getsize(target_path)
    print(f"Download complete! Saved as: {target_path} ({file_size} bytes)")
except Exception as e:
    print(f"Failed to download public dataset: {e}")
