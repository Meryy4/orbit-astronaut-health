"""Rule-based analysis: the safety net from data/thresholds.json.

Every system gets a green / yellow / red status from fixed safety thresholds. The ML
layer (app/ml.py: Isolation Forest + SHAP on the astronaut's own baseline) then fills
`anomaly` and can raise a green system to yellow when it is unusual for this astronaut.
"""

import json
import math
from functools import lru_cache
from statistics import mean

from .mission import DATA_DIR, mission_days
from .ml import detect

LAPSE_MS = 355
BASELINE_WINDOW_DAYS = 14
BONE_THRESHOLD_PCT = 10.0  # ORBIT assumption, see SOURCES.md
SCORE = {"green": 0.2, "yellow": 0.55, "red": 0.85}
RANK = {"green": 0, "yellow": 1, "red": 2}


@lru_cache(maxsize=1)
def thresholds() -> dict:
    return json.loads((DATA_DIR / "thresholds.json").read_text())


def worst(*statuses: str) -> str:
    return max(statuses, key=RANK.__getitem__)


def baseline(day: int) -> dict:
    """Personal baseline: mean of the last 14 quiet days before `day`.

    Days with a solar event are left out, so a storm does not shift the "normal".
    """
    quiet = [d for d in mission_days() if d["mission_day"] < day and not d["radiation"]["solar_event"]]
    window = quiet[-BASELINE_WINDOW_DAYS:] or [mission_days()[0]]
    return {
        "pvt_mean_rt_ms": round(mean(d["cognitive"]["pvt_mean_rt_ms"] for d in window)),
        "hrv_rmssd_ms": round(mean(d["vitals"]["hrv_rmssd_ms"] for d in window), 1),
        "sleep_duration_min": round(mean(d["sleep"]["duration_min"] for d in window)),
        "daily_dose_msv": round(mean(d["radiation"]["daily_dose_msv"] for d in window), 3),
        "resting_hr_bpm": round(mean(d["vitals"]["resting_hr_bpm"] for d in window)),
        "body_temp_c": round(mean(d["vitals"]["body_temp_c"] for d in window), 1),
    }


def pvt_status(lapses: int, rt_ms: int | None, baseline_rt: int) -> str:
    t = thresholds()["behavioral"]["pvt_lapses"]
    if lapses >= t["red"]["min"]:
        return "red"
    slow = rt_ms is not None and (rt_ms - baseline_rt) / baseline_rt >= 0.20
    if lapses >= t["yellow"]["min"] or slow:
        return "yellow"
    return "green"


def _cardiovascular(v: dict) -> tuple[str, list[str]]:
    reasons = []
    hr, sbp, hrv = v["resting_hr_bpm"], v["systolic_bp"], v["hrv_rmssd_ms"]
    t = thresholds()["cardiovascular"]
    hr_s = "red" if hr > t["resting_hr_bpm"]["red"]["above"] or hr < t["resting_hr_bpm"]["red"]["below"] else "yellow" if hr > t["resting_hr_bpm"]["green"]["max"] else "green"
    sbp_s = "red" if sbp >= 140 or sbp <= 90 else "yellow" if sbp >= 130 or sbp <= 99 else "green"
    hrv_s = "red" if hrv < t["hrv_rmssd_ms"]["yellow"]["min"] else "yellow" if hrv < t["hrv_rmssd_ms"]["green"]["min"] else "green"
    if hr_s != "green":
        reasons.append(f"Resting HR {hr} bpm")
    if sbp_s != "green":
        reasons.append(f"Systolic BP {sbp} mmHg")
    if hrv_s != "green":
        reasons.append(f"HRV {hrv} ms")
    return worst(hr_s, sbp_s, hrv_s), reasons


def _immune(v: dict) -> tuple[str, list[str]]:
    temp = v["body_temp_c"]
    t = thresholds()["immune"]["body_temp_c"]
    status = "red" if temp > t["red"]["above"] else "yellow" if temp >= t["yellow"]["min"] else "green"
    return status, [] if status == "green" else [f"Body temperature {temp} °C"]


def _behavioral(rec: dict, base: dict) -> tuple[str, list[str]]:
    reasons = []
    hours = rec["sleep"]["duration_min"] / 60
    t = thresholds()["behavioral"]["sleep_duration_h"]
    sleep_s = "red" if hours < t["red"]["below"] else "yellow" if hours < t["green"]["min"] else "green"
    if sleep_s != "green":
        reasons.append(f"Sleep {hours:.1f} h")
    c = rec["cognitive"]
    pvt_s = pvt_status(c["pvt_lapses"], c.get("pvt_median_rt_ms") or c["pvt_mean_rt_ms"], base["pvt_mean_rt_ms"])
    if pvt_s != "green":
        reasons.append(f"{c['pvt_lapses']} PVT lapses")
    return worst(sleep_s, pvt_s), reasons


def _bone_rate_per_month(day: int) -> float:
    """Bone loss rate (% per month): least-squares slope over the last 30 days."""
    past = mission_days()[max(0, day - 30): day]
    if len(past) < 2:
        return 0.0
    xs = [d["mission_day"] for d in past]
    ys = [d["bone"]["bmd_change_pct"] for d in past]
    mx, my = mean(xs), mean(ys)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    return round(-slope * 30, 2)


def _bone(day: int) -> tuple[str, list[str]]:
    rate = _bone_rate_per_month(day)
    t = thresholds()["bone"]["bmd_loss_pct_per_month"]
    status = "red" if rate > t["red"]["above"] else "yellow" if rate >= t["yellow"]["min"] else "green"
    return status, [] if status == "green" else [f"Bone loss {rate}%/month"]


def _radiation(r: dict) -> tuple[str, list[str]]:
    t = thresholds()["radiation"]
    daily, cum = r["daily_dose_msv"], r["cumulative_dose_msv"]
    daily_s = "red" if daily > t["daily_dose_msv"]["red"]["above"] else "yellow" if daily >= t["daily_dose_msv"]["yellow"]["min"] else "green"
    cum_s = "red" if cum > t["cumulative_mission_dose_msv"]["red"]["above"] else "yellow" if cum >= t["cumulative_mission_dose_msv"]["yellow"]["min"] else "green"
    reasons = []
    if daily_s != "green":
        reasons.append(f"Daily dose {daily} mSv")
    if cum_s != "green":
        reasons.append(f"Cumulative dose {cum} mSv")
    return worst(daily_s, cum_s), reasons


def forecast(day: int, rec: dict, base: dict) -> dict:
    """Linear forecasts: day the bone threshold and the career dose limit are reached."""
    limit = thresholds()["radiation"]["cumulative_mission_dose_msv"]["career_limit"]
    left = limit - rec["radiation"]["cumulative_dose_msv"]
    rate = base["daily_dose_msv"]
    radiation_day = day if left <= 0 else day + math.ceil(left / rate) if rate > 0 else None

    loss_now = -rec["bone"]["bmd_change_pct"]
    per_day = _bone_rate_per_month(day) / 30
    bone_day = day if loss_now >= BONE_THRESHOLD_PCT else day + math.ceil((BONE_THRESHOLD_PCT - loss_now) / per_day) if per_day > 0 else None
    return {"bone_threshold_day": bone_day, "radiation_limit_day": radiation_day}


def self_report_gap(rec: dict, base: dict) -> dict:
    """The astronaut says they feel fine (fatigue 1-2 / 5) but the measured vigilance is not green."""
    fatigue = rec["self_report"]["fatigue_1_5"]
    c = rec["cognitive"]
    rt = c.get("pvt_median_rt_ms") or c["pvt_mean_rt_ms"]
    if fatigue is None or fatigue > 2 or rt is None or pvt_status(c["pvt_lapses"], rt, base["pvt_mean_rt_ms"]) == "green":
        return {"detected": False, "message": None}
    delta = round((rt - base["pvt_mean_rt_ms"]) / base["pvt_mean_rt_ms"] * 100)
    lapses = c["pvt_lapses"]
    lapse_txt = f"{lapses} lapse{'s' if lapses > 1 else ''}"
    if delta > 0:
        msg = f"You rated your fatigue {fatigue}/5, but your reaction time is {delta}% slower than your baseline"
        msg += f", with {lapse_txt}." if lapses else "."
    else:
        msg = f"You rated your fatigue {fatigue}/5, but the test shows {lapse_txt} (responses slower than {LAPSE_MS} ms)."
    return {"detected": True, "message": msg}


def actions(rec: dict, systems: dict) -> list[dict]:
    """Action plan. Each action has a stable id so the crew can tick it off."""
    st = {name: s["status"] for name, s in systems.items()}
    event = rec["radiation"]["solar_event"]
    out = []

    def add(id_: str, priority: str, text: str) -> None:
        out.append({"id": id_, "priority": priority, "text": text})

    if event and st["radiation"] != "green":
        add("shelter", "now", "Move to the radiation shelter module.")
        add("postpone-eva", "now", "Postpone any planned EVA until the event is over.")
    if st["immune"] == "red":
        add("isolate", "now", "Rest and limit close contact with the crew until the fever drops.")
    if st["behavioral"] != "green":
        add("no-critical-task", "today", "No critical task (EVA, docking, robotic arm) until a new PVT is green.")
    if rec["sleep"]["duration_min"] < 7 * 60:
        add("sleep", "today", "Aim for 7 h of sleep tonight.")
    if st["cardiovascular"] != "green":
        add("breathing", "today", "10-minute guided breathing session, then measure HRV again.")
    if st["immune"] != "green":
        add("temp-check", "today", "Measure your temperature again in 4 h and drink regularly.")
    if event and st["radiation"] == "red":
        add("ars-protocol", "escalate", "Nausea or vomiting: start the acute radiation protocol and call the crew medical officer now.")
    if st["immune"] == "red":
        add("fever-escalate", "escalate", "Fever above 38.5 °C or a rash: inform the crew medical officer now.")
    if st["cardiovascular"] != "green" or st["behavioral"] == "red":
        add("cmo-2-days", "escalate", "Still the same in 2 days: inform the crew medical officer.")
    return out


def analyze(day: int, rec: dict) -> dict:
    base = baseline(day)
    parts = {
        "cardiovascular": _cardiovascular(rec["vitals"]),
        "bone": _bone(day),
        "immune": _immune(rec["vitals"]),
        "radiation": _radiation(rec["radiation"]),
        "behavioral": _behavioral(rec, base),
    }
    systems = {name: {"status": s, "score": SCORE[s], "reasons": reasons} for name, (s, reasons) in parts.items()}
    anomaly = detect(day, rec)
    # Personal baseline: a system the fixed rules call green turns amber if the model finds it
    # unusual *for this astronaut*, with the reason given.
    if anomaly and anomaly["is_anomaly"]:
        for f in anomaly["top_factors"]:
            sys_ = systems[f["system"]]
            delta = f"{f['vs_baseline']:+.1f} °C" if f["feature"] == "vitals.body_temp_c" else f"{f['vs_baseline_pct']:+d}%"
            sys_["reasons"].append(f"{f['label']} {delta} vs your baseline (ML)")
            if sys_["status"] == "green":
                sys_["status"], sys_["score"], sys_["flagged_by"] = "yellow", SCORE["yellow"], "ml"
    return {
        "mission_day": day,
        "systems": systems,
        "anomaly": anomaly,  # None while the model warms up (first 30 days)
        "self_report_gap": self_report_gap(rec, base),
        "forecast": forecast(day, rec, base),
        "actions": actions(rec, systems),
        "baseline": base,
        "metrics": {"bone_loss_pct_per_month": _bone_rate_per_month(day)},
        "method": "rules+ml" if anomaly else "rules",
    }
