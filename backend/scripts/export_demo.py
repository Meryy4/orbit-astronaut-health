"""Export the backend's answers to static JSON for the online demo (GitHub Pages has no Python).

Every file is produced by calling the real API, so the demo shows exactly what the app computes.
The What-if model is re-implemented in JavaScript (frontend/src/lib/demoApi.js) from the inputs
exported here, so its sliders stay live in the browser.

Run from backend/:   .venv/bin/python -m scripts.export_demo
"""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app import whatif as W
from app.analysis import BONE_THRESHOLD_PCT, NOMINAL_BONE_PCT_MONTH, NOMINAL_DOSE_MSV, _bone_rate_per_month, baseline, thresholds
from app.main import app
from app.mission import get_day, meta, mission_days

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "demo"
ID = "nova-01"


def write(name: str, data) -> None:
    path = OUT / name
    path.write_text(json.dumps(data, separators=(",", ":")))
    print(f"{name}: {path.stat().st_size / 1024:.0f} KB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    c = TestClient(app)
    m = meta()
    today = m["current_day"]
    n_days = len(mission_days())

    write("mission.json", c.get(f"/mission/{ID}").json())
    write("days.json", c.get(f"/mission/{ID}/days").json())
    write("analysis.json", [c.get(f"/analysis/{ID}/day/{n}").json() for n in range(1, n_days + 1)])
    write("alerts.json", [c.get(f"/alert/{ID}/day/{n}").json() for n in range(1, n_days + 1)])
    write("timeline.json", c.get(f"/timeline/{ID}").json())
    write("report.json", c.get(f"/report/{ID}/day/{today}").json())

    # Inputs of the What-if model for today, so the browser can recompute it for any slider position.
    rec, base = get_day(today), baseline(today)
    cog = rec["cognitive"]
    rt = cog.get("pvt_median_rt_ms") or cog["pvt_mean_rt_ms"]
    t = thresholds()
    write("whatif.json", {
        "response": c.post("/whatif", json={"astronaut_id": ID, "mission_day": today, "plan": None}).json(),
        "inputs": {
            "day": today,
            "transit_end_day": m["transit_end_day"],
            "leave_mars_day": m["leave_mars_day"],
            "cumulative_msv": rec["radiation"]["cumulative_dose_msv"],
            "base_daily_msv": base["daily_dose_msv"],
            "career_limit_msv": t["radiation"]["cumulative_mission_dose_msv"]["career_limit"],
            "bone_rate_now": _bone_rate_per_month(today),
            "bone_loss_now": -rec["bone"]["bmd_change_pct"],
            "bone_threshold_pct": BONE_THRESHOLD_PCT,
            "lapses_now": cog["pvt_lapses"],
            "rt_now_pct": round((rt - base["pvt_mean_rt_ms"]) / base["pvt_mean_rt_ms"] * 100),
            "nominal_dose_msv": NOMINAL_DOSE_MSV,
            "nominal_bone_pct_month": NOMINAL_BONE_PCT_MONTH,
            "coef": {
                "bone_per_exercise_min": W.BONE_PER_EXERCISE_MIN,
                "min_bone_rate": W.MIN_BONE_RATE,
                "shield_reduction": W.SHIELD_REDUCTION,
                "lapses_per_sleep_h": W.LAPSES_PER_SLEEP_H,
                "rt_pct_per_sleep_h": W.RT_PCT_PER_SLEEP_H,
            },
            "thresholds": {
                "lapses_yellow": t["behavioral"]["pvt_lapses"]["yellow"]["min"],
                "lapses_red": t["behavioral"]["pvt_lapses"]["red"]["min"],
                "bone_yellow": t["bone"]["bmd_loss_pct_per_month"]["yellow"]["min"],
                "bone_red": t["bone"]["bmd_loss_pct_per_month"]["red"]["above"],
            },
        },
    })


if __name__ == "__main__":
    main()
