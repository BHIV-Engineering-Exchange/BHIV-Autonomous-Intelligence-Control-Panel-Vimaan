import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://api.github.com/repos/gps-touring/sample-gpx/contents"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, context=ctx) as r:
        data = json.loads(r.read().decode())
        for f in data:
            print(f"{f.get('type')}: {f.get('name')} -> {f.get('download_url')}")
except Exception as e:
    print(f"API Error: {e}")
