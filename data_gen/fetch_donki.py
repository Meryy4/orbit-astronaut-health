"""Download real solar events from NASA DONKI and save them to data/donki_events.json.

The mission replays real space weather: mission day 409 = 2024-05-11, so day 1 = 2023-03-29.
DONKI limits one request to 60 days, so the range is fetched in chunks.

Run once (the result is committed, so the app works offline):
    python3 data_gen/fetch_donki.py            # uses DEMO_KEY (30 requests/hour)
    NASA_API_KEY=... python3 data_gen/fetch_donki.py
"""

import json
import os
import time
import urllib.request
from datetime import date, timedelta
from pathlib import Path

START = date(2023, 3, 29)  # mission day 1
END = date(2024, 5, 31)
CHUNK_DAYS = 59
OUT = Path(__file__).resolve().parents[1] / "data" / "donki_events.json"
# Two public hosts serve the same DONKI data. The first needs an api.nasa.gov key (DEMO_KEY works, rate limited).
HOSTS = [
    "https://api.nasa.gov/DONKI/{kind}?startDate={start}&endDate={end}&api_key={key}",
    "https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/{kind}?startDate={start}&endDate={end}",
]


def fetch(kind: str, start: date, end: date, key: str) -> list[dict]:
    errors = []
    for host in HOSTS:
        url = host.format(kind=kind, start=start.isoformat(), end=end.isoformat(), key=key)
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                body = resp.read().decode()
            return json.loads(body) if body.strip() else []
        except Exception as err:  # try the next host
            errors.append(f"{url.split('?')[0]}: {err}")
    raise RuntimeError(f"DONKI {kind} unavailable:\n  " + "\n  ".join(errors))


def flare(e: dict) -> dict:
    return {
        "id": e["flrID"],
        "type": "FLR",
        "time": e["peakTime"] or e["beginTime"],
        "class": e["classType"],
        "region": e.get("activeRegionNum"),
        "link": e.get("link"),
    }


def sep(e: dict) -> dict:
    return {
        "id": e["sepID"],
        "type": "SEP",
        "time": e["eventTime"],
        "instruments": sorted({i["displayName"] for i in e.get("instruments") or []}),
        "link": e.get("link"),
    }


def main() -> None:
    key = os.environ.get("NASA_API_KEY", "DEMO_KEY")
    events = []
    start = START
    while start <= END:
        end = min(start + timedelta(days=CHUNK_DAYS), END)
        events += [flare(e) for e in fetch("FLR", start, end, key)]
        events += [sep(e) for e in fetch("SEP", start, end, key)]
        print(f"{start} -> {end}: {len(events)} events so far")
        start = end + timedelta(days=1)
        time.sleep(1)
    events.sort(key=lambda e: e["time"])
    OUT.write_text(json.dumps({
        "source": "NASA DONKI (https://kauai.ccmc.gsfc.nasa.gov/DONKI/)",
        "fetched": date.today().isoformat(),
        "range": [START.isoformat(), END.isoformat()],
        "events": events,
    }, indent=1))
    print(f"Saved {len(events)} events to {OUT}")


if __name__ == "__main__":
    main()
