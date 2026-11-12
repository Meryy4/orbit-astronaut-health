"""Earth report: a compact summary for the flight surgeon, sent over a slow, delayed link.

The crew decides what is sent (priority, questions, note, attachments). Only the summary
leaves the habitat; raw check-in answers stay onboard unless attached.
"""

from datetime import datetime, timedelta

from .mission import mission_days

TREND_DAYS = 14
# ASSUMPTION: time for the flight surgeon to review, by priority (minutes).
REVIEW_MIN = {"routine": 45, "priority": 15, "urgent": 5}

# One trend per system, read from the daily records.
TRENDS = {
    "radiation": ("Cumulative dose (mSv)", lambda r: r["radiation"]["cumulative_dose_msv"]),
    "behavioral": ("Sleep (h)", lambda r: round(r["sleep"]["duration_min"] / 60, 1)),
    "cardiovascular": ("HRV (ms)", lambda r: r["vitals"]["hrv_rmssd_ms"]),
    "bone": ("Bone density change (%)", lambda r: r["bone"]["bmd_change_pct"]),
    "immune": ("Temperature (°C)", lambda r: r["vitals"]["body_temp_c"]),
}


def trends(day: int) -> dict:
    window = mission_days()[max(0, day - TREND_DAYS): day]
    return {k: {"label": label, "days": [r["mission_day"] for r in window], "values": [get(r) for r in window]}
            for k, (label, get) in TRENDS.items()}


def summary(rec: dict, analysis: dict, alert: dict) -> str:
    """Plain-English summary, built only from the data (no LLM, so nothing is invented)."""
    parts = []
    ev = rec["radiation"]["solar_event"]
    if ev:
        parts.append(f"Solar event in progress ({ev}).")
    if alert["level"] == "green":
        parts.append("All systems green; today is normal for this crew member.")
    else:
        raised = ", ".join(f"{r['label']} {r['status']}" for r in alert["raised"])
        parts.append(f"{alert['title']} ({raised}).")
    c, sl = rec["cognitive"], rec["sleep"]["duration_min"] / 60
    if analysis["systems"]["behavioral"]["status"] != "green":
        parts.append(f"Vigilance reduced: {c['pvt_lapses']} PVT lapses, {sl:.1f} h of sleep.")
    if analysis["self_report_gap"]["detected"]:
        parts.append(f"Self-rated fatigue {rec['self_report']['fatigue_1_5']}/5 does not match the measured vigilance.")
    a = analysis["anomaly"]
    if a and a["is_anomaly"] and a["top_factors"]:
        f = ", ".join(x["label"].lower() for x in a["top_factors"])
        parts.append(f"Personal model flags an unusual day (main factors: {f}).")
    symptoms = rec["self_report"]["symptoms"]
    parts.append(f"Symptoms reported: {', '.join(symptoms)}." if symptoms else "No symptoms reported.")
    parts.append(f"Cumulative dose {rec['radiation']['cumulative_dose_msv']} mSv; career limit forecast on day {analysis['forecast']['radiation_limit_day']}.")
    return " ".join(parts)


def suggested_questions(rec: dict, analysis: dict) -> list[dict]:
    st = {k: v["status"] for k, v in analysis["systems"].items()}
    qs = []
    if rec["radiation"]["solar_event"]:
        qs.append({"id": "eva", "text": "When can postponed EVAs be rescheduled?"})
    if st["behavioral"] != "green":
        qs.append({"id": "sleep-aid", "text": "Should I take a sleep aid tonight?"})
    if st["radiation"] == "red":
        qs.append({"id": "blood", "text": "Do you want a blood sample after the storm?"})
    if st["immune"] != "green":
        qs.append({"id": "meds", "text": "Should I start the antiviral or antipyretic protocol?"})
    if st["cardiovascular"] != "green":
        qs.append({"id": "ecg", "text": "Do you want an ECG recording?"})
    qs.append({"id": "plan", "text": "Do you agree with the current action plan?"})
    return qs


def actions_taken(alert: dict) -> list[dict]:
    done = [a for g in alert["groups"] for a in g["items"] if a["done"]]
    return sorted(({"text": a["text"], "at": a["done_at"]} for a in done), key=lambda a: a["at"])


def round_trip(sent_at: str, priority: str, delay_min: int) -> list[dict]:
    t0 = datetime.fromisoformat(sent_at)
    review = REVIEW_MIN[priority]
    steps = [("Sent from Mars", 0), ("Arrives at Mission Control", delay_min),
             ("Flight surgeon review (estimate)", delay_min + review), ("Reply arrives on Mars", 2 * delay_min + review)]
    return [{"label": label, "at": (t0 + timedelta(minutes=m)).isoformat(timespec="seconds"), "minutes": m} for label, m in steps]
