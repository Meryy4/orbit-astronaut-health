"""Alert screen: turns a day's analysis into one alert with a title, the reasons and an action plan.

The crew's ticks, acknowledgements and What-if plans are kept in memory only (demo).
"""

from datetime import datetime, timezone

RANK = {"green": 0, "yellow": 1, "red": 2}
SYSTEM_LABEL = {
    "radiation": "Radiation",
    "behavioral": "Vigilance",
    "cardiovascular": "Heart",
    "immune": "Immune",
    "bone": "Bone",
}

# (astronaut_id, day) -> {"done": {action_id: time ticked}, "acked_at", "plan", "report_sent"}
STATE: dict[tuple[str, int], dict] = {}


def state(astronaut_id: str, day: int) -> dict:
    return STATE.setdefault((astronaut_id, day), {"done": {}, "acked_at": None, "plan": None, "report_sent": None})


def _headline(st: dict, rec: dict, analysis: dict) -> tuple[str, str]:
    event = rec["radiation"]["solar_event"]
    if st["radiation"] == "red" and event and st["behavioral"] != "green":
        return ("Solar storm while your vigilance is low",
                "A solar particle event is under way, and your data shows slower reactions and short sleep. "
                "Shelter first, then avoid critical tasks until a new test is green.")
    if st["radiation"] == "red" and event:
        return ("Solar event: radiation alert", "Your dose is far above your daily average. Go to the shelter until the event is over.")
    if st["immune"] == "red":
        return ("Fever: possible infection", "Your temperature is above the safe range. Rest, measure again, and tell the crew medical officer if it rises.")
    if st["behavioral"] == "red":
        return ("Your vigilance is low", "Your reaction time and sleep are far from your baseline. Avoid critical tasks until a new test is green.")
    worst = [SYSTEM_LABEL[k] for k, v in st.items() if v != "green"]
    if analysis["anomaly"] and analysis["anomaly"]["is_anomaly"]:
        return (f"{', '.join(worst)}: unusual for you", "Your fixed safety limits are fine, but today is unusual compared with your last 90 days.")
    return (f"{', '.join(worst)} needs attention", "One of your systems is outside its green range. Follow the plan below.")


def build(astronaut_id: str, day: int, rec: dict, analysis: dict, earth_delay_min: int) -> dict:
    st = {k: v["status"] for k, v in analysis["systems"].items()}
    level = max(st.values(), key=RANK.__getitem__)
    s = state(astronaut_id, day)
    base = {
        "mission_day": day,
        "level": level,
        "earth_round_trip_min": 2 * earth_delay_min,
        "acknowledged_at": s["acked_at"],
    }
    if level == "green":
        return {**base, "title": "All clear", "summary": "Every system is green and today looks normal for you.",
                "raised": [], "rule_reasons": [], "anomaly": analysis["anomaly"], "self_report_gap": analysis["self_report_gap"],
                "groups": [], "done_count": 0, "total_count": 0}

    title, summary = _headline(st, rec, analysis)
    raised = sorted(({"system": k, "label": SYSTEM_LABEL[k], "status": v} for k, v in st.items() if v != "green"),
                    key=lambda r: -RANK[r["status"]])
    rule_reasons = [
        {"system": SYSTEM_LABEL[k], "text": r}
        for k, v in analysis["systems"].items() for r in v["reasons"] if not r.endswith("(ML)")
    ]

    items = list(analysis["actions"])
    if s["plan"]:
        p = s["plan"]
        items.append({"id": "whatif-plan", "priority": "today",
                      "text": f"Your new plan: {p['sleep_h']:.1f} h of sleep, {p['resistance_min']} min/day of resistance exercise, "
                              f"+{p['shield_h']} h/day in shielded quarters."})
    groups = []
    for priority, label in (("now", "Now"), ("today", "Today"), ("escalate", "Escalate if")):
        g = [{**a, "done": a["id"] in s["done"], "done_at": s["done"].get(a["id"])} for a in items if a["priority"] == priority]
        if g:
            groups.append({"priority": priority, "label": label, "items": g})
    return {
        **base,
        "title": title,
        "summary": summary,
        "raised": raised,
        "rule_reasons": rule_reasons,
        "anomaly": analysis["anomaly"],
        "self_report_gap": analysis["self_report_gap"],
        "groups": groups,
        "done_count": sum(a["done"] for g in groups for a in g["items"]),
        "total_count": sum(len(g["items"]) for g in groups),
    }


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
