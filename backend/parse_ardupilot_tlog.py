"""
parse_ardupilot_tlog.py

Downloads a real ArduPilot .tlog telemetry log from a public source and
converts it into the JSONL replay format used by the BHIV dashboard.

Usage:
    python -m backend.parse_ardupilot_tlog
"""

import json, os, math, struct, sys, urllib.request

TLOG_SOURCES = [
    "https://raw.githubusercontent.com/ArduPilot/ardupilot/master/Tools/autotest/test_logs/ArduCopter.tlog",
    "https://raw.githubusercontent.com/dronekit/dronekit-python/master/examples/mission_basic/test/test_log.tlog",
]

OUTPUT_DIR  = os.path.join(os.path.dirname(__file__), "recordings")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "real_ardupilot_flight.jsonl")
TLOG_CACHE  = os.path.join(OUTPUT_DIR, "_cached_ardupilot.tlog")

def download_tlog():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    for url in TLOG_SOURCES:
        try:
            print(f"[download] Trying: {url}")
            req = urllib.request.Request(url, headers={"User-Agent": "BHIV/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status == 200:
                    data = resp.read()
                    if len(data) < 500:
                        print(f"[download] Too small, skipping.")
                        continue
                    with open(TLOG_CACHE, "wb") as f:
                        f.write(data)
                    print(f"[download] OK {len(data):,} bytes")
                    return True
        except Exception as e:
            print(f"[download] Failed: {e}")
    return False

def try_pymavlink(filepath):
    try:
        from pymavlink import mavutil
        print("[pymavlink] Parsing...")
        mlog = mavutil.mavlink_connection(filepath, robust_parsing=True)
    except Exception as e:
        print(f"[pymavlink] Unavailable: {e}")
        return []

    frames = []
    state = dict(lat=None, lon=None, alt=0.0, roll=0.0, pitch=0.0, yaw=0.0,
                 airspeed=0.0, groundspeed=0.0, heading=0.0,
                 voltage=0.0, current=0.0, battery_pct=100.0,
                 satellites=0, fix_type=0, vz=0.0, link_quality=85,
                 _ts=0.0, _last=0.0)

    INTERVAL = 0.1
    try:
        while True:
            msg = mlog.recv_match(blocking=False)
            if msg is None:
                break
            mtype = msg.get_type()
            ts = getattr(msg, "_timestamp", state["_ts"])
            state["_ts"] = ts
            if mtype == "ATTITUDE":
                state["roll"]  = math.degrees(msg.roll)
                state["pitch"] = math.degrees(msg.pitch)
                state["yaw"]   = math.degrees(msg.yaw) % 360
            elif mtype == "GPS_RAW_INT":
                state.update(lat=msg.lat/1e7, lon=msg.lon/1e7,
                             alt=msg.alt/1000.0, satellites=msg.satellites_visible,
                             fix_type=msg.fix_type)
            elif mtype == "GLOBAL_POSITION_INT":
                state.update(lat=msg.lat/1e7, lon=msg.lon/1e7,
                             alt=msg.relative_alt/1000.0, vz=msg.vz/100.0)
                if msg.hdg != 65535:
                    state["heading"] = msg.hdg / 100.0
            elif mtype == "VFR_HUD":
                state.update(airspeed=msg.airspeed, groundspeed=msg.groundspeed,
                             heading=msg.heading, vz=msg.climb)
            elif mtype == "BATTERY_STATUS":
                volts = [v for v in msg.voltages if v != 65535]
                if volts: state["voltage"] = sum(volts)/1000.0
                if msg.current_battery >= 0: state["current"] = msg.current_battery/100.0
                if msg.battery_remaining >= 0: state["battery_pct"] = float(msg.battery_remaining)
            elif mtype == "SYS_STATUS":
                if msg.voltage_battery > 0: state["voltage"] = msg.voltage_battery/1000.0
                if msg.current_battery >= 0: state["current"] = msg.current_battery/100.0
                if msg.battery_remaining >= 0: state["battery_pct"] = float(msg.battery_remaining)
            elif mtype == "RADIO_STATUS":
                state["link_quality"] = min(100, int(msg.rssi/2.55))

            if state["lat"] is None or abs(state["lat"]) < 0.001:
                continue
            if ts - state["_last"] < INTERVAL:
                continue
            state["_last"] = ts

            frames.append({
                "connected": True, "armed": True, "flight_mode": "AUTO",
                "telemetry": {
                    "battery": round(state["battery_pct"],1),
                    "voltage": round(state["voltage"],2),
                    "current": round(state["current"],1),
                    "altitude": round(state["alt"],2),
                    "speed": round(state["groundspeed"],2),
                    "airspeed": round(state["airspeed"],2),
                    "heading": int(state["heading"])%360,
                    "roll": round(state["roll"],1),
                    "pitch": round(state["pitch"],1),
                    "gps": {"lat": state["lat"], "lon": state["lon"],
                            "fix": f"3D Fix ({state['satellites']})" if state["fix_type"]>=3 else "No Fix",
                            "satellites": state["satellites"]},
                    "rc_signal": "Strong" if state["link_quality"]>60 else "Weak",
                    "link_quality": state["link_quality"],
                    "vertical_speed": round(state["vz"],2),
                    "distance_to_home": 0.0,
                },
                "system_health": {
                    "fcu":"OK","gps":"OK" if state["fix_type"]>=3 else "WARNING",
                    "sensors":"OK","motors":"OK",
                    "battery":"OK" if state["battery_pct"]>20 else "WARNING",
                    "link":"OK" if state["link_quality"]>60 else "WARNING",
                },
                "mission_status": {"active":True,"waypoints_count":0,
                    "current_waypoint":0,"progress_pct":0,"elapsed_time":"","est_time_left":""},
                "logs":[],"alerts":[]
            })
    except Exception as e:
        print(f"[pymavlink] Error: {e}")

    print(f"[pymavlink] {len(frames)} frames extracted")
    return frames

def parse_manual(filepath):
    """Fallback manual binary MAVLink parser."""
    frames = []
    state = dict(lat=None,lon=None,alt=0.0,roll=0.0,pitch=0.0,yaw=0.0,
                 airspeed=0.0,groundspeed=0.0,heading=0.0,voltage=0.0,
                 current=0.0,battery_pct=100.0,satellites=0,fix_type=0,vz=0.0,link_quality=85)
    try:
        raw = open(filepath,"rb").read()
    except Exception as e:
        print(f"[manual] Can't read: {e}"); return []

    print(f"[manual] {len(raw):,} bytes")
    i=0; pkts=0; EMIT=100_000; last_ts=None

    while i < len(raw):
        if i+8 > len(raw): break
        ts = struct.unpack_from(">Q", raw, i)[0]; i+=8
        if i>=len(raw): break
        stx=raw[i]
        if stx==0xFE:
            if i+6>len(raw): break
            ln=raw[i+1]; mid=raw[i+5]
            tot=6+ln+2
            if i+tot>len(raw): break
            pl=raw[i+6:i+6+ln]; i+=tot
        elif stx==0xFD:
            if i+10>len(raw): break
            ln=raw[i+1]; inc=raw[i+2]
            mid=raw[i+7]|(raw[i+8]<<8)|(raw[i+9]<<16)
            sig=13 if (inc&1) else 0; tot=10+ln+2+sig
            if i+tot>len(raw): break
            pl=raw[i+10:i+10+ln]; i+=tot
        else:
            i+=1; continue
        pkts+=1
        try:
            if mid==30 and len(pl)>=28:   # ATTITUDE
                v=struct.unpack_from("<Iffffff",pl); state.update(roll=math.degrees(v[1]),pitch=math.degrees(v[2]),yaw=math.degrees(v[3])%360)
            elif mid==24 and len(pl)>=30: # GPS_RAW_INT
                v=struct.unpack_from("<QBiiiHHHHB",pl); state.update(fix_type=v[1],lat=v[2]/1e7,lon=v[3]/1e7,alt=v[4]/1000.0,satellites=v[9])
            elif mid==33 and len(pl)>=28: # GLOBAL_POSITION_INT
                v=struct.unpack_from("<Iiiiihhhh",pl); state.update(lat=v[1]/1e7,lon=v[2]/1e7,alt=v[4]/1000.0,vz=v[7]/100.0)
                if v[8]!=65535: state["heading"]=v[8]/100.0
            elif mid==74 and len(pl)>=20: # VFR_HUD
                v=struct.unpack_from("<ffhHff",pl); state.update(airspeed=v[0],groundspeed=v[1],heading=v[2]%360,vz=v[5])
            elif mid==1 and len(pl)>=31:  # SYS_STATUS
                v=struct.unpack_from("<IIIHHhH",pl)
                if v[4]>0: state["voltage"]=v[4]/1000.0
                if v[5]>=0: state["current"]=v[5]/100.0
                if v[6]>=0: state["battery_pct"]=float(v[6])
        except: pass
        if state["lat"] is None or abs(state["lat"])<0.001: continue
        if last_ts is None: last_ts=ts
        if ts-last_ts<EMIT: continue
        last_ts=ts
        lq=state["link_quality"]
        frames.append({"connected":True,"armed":True,"flight_mode":"AUTO",
            "telemetry":{"battery":round(state["battery_pct"],1),"voltage":round(state["voltage"],2),
                "current":round(state["current"],1),"altitude":round(state["alt"],2),
                "speed":round(state["groundspeed"],2),"airspeed":round(state["airspeed"],2),
                "heading":int(state["heading"])%360,"roll":round(state["roll"],1),"pitch":round(state["pitch"],1),
                "gps":{"lat":state["lat"],"lon":state["lon"],
                    "fix":f"3D Fix ({state['satellites']})" if state["fix_type"]>=3 else "No Fix",
                    "satellites":state["satellites"]},
                "rc_signal":"Strong" if lq>60 else "Weak","link_quality":lq,
                "vertical_speed":round(state["vz"],2),"distance_to_home":0.0},
            "system_health":{"fcu":"OK","gps":"OK" if state["fix_type"]>=3 else "WARNING",
                "sensors":"OK","motors":"OK","battery":"OK" if state["battery_pct"]>20 else "WARNING",
                "link":"OK" if lq>60 else "WARNING"},
            "mission_status":{"active":True,"waypoints_count":0,"current_waypoint":0,
                "progress_pct":0,"elapsed_time":"","est_time_left":""},
            "logs":[],"alerts":[]})
    print(f"[manual] {pkts} packets ? {len(frames)} frames")
    return frames

def main():
    print("="*60)
    print("BHIV - ArduPilot Real Telemetry Downloader")
    print("="*60)
    if not download_tlog():
        print("[ERROR] Could not download any .tlog file."); sys.exit(1)
    frames = try_pymavlink(TLOG_CACHE)
    if len(frames)<10:
        print("[fallback] Using manual parser...")
        frames = parse_manual(TLOG_CACHE)
    if len(frames)<5:
        print("[ERROR] Not enough frames."); sys.exit(1)
    with open(OUTPUT_FILE,"w") as f:
        for fr in frames: f.write(json.dumps(fr)+"\n")
    print(f"\n? {len(frames):,} real frames ? {OUTPUT_FILE}")

if __name__=="__main__":
    main()


