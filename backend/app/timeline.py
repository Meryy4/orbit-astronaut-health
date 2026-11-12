"""Mission timeline: cumulative dose (history + forecast to the end of the mission),
solar events and the days the personal ML model flagged.
"""

from functools import lru_cache

import numpy as np

from .analysis import baseline, thresholds
from .mission import meta, mission_days
from .ml import THRESHOLD, _model, _training_end, detect, vector

RETURN_DOSE_MSV = 1.84  # interplanetary cruise, same as the way out (Zeitlin et al. 2013)


def _forecast(last: dict) -> list[dict]:
    """From the day after today to the end of the mission, at the usual dose rate of each phase."""
    m = meta()
    surface_rate = baseline(last["mission_day"] + 1)["daily_dose_msv"]
    cum, out = last["radiation"]["cumulative_dose_msv"], []
    for day in range(last["mission_day"] + 1, m["mission_length_days"] + 1):
        cum += surface_rate if day <= m["leave_mars_day"] else RETURN_DOSE_MSV
        out.append({"day": day, "cumulative_msv": round(cum, 1)})
    return out


@lru_cache(maxsize=1)
def flagged() -> tuple[dict, ...]:
    """Days the model flags (score only for every day, SHAP only for the flagged ones). Cached: data never changes."""
    out = []
    for d in mission_days():
        trained = _model(_training_end(d["mission_day"]))
        if trained is None:
            continue
        score = float(trained[0].decision_function(np.array([vector(d)]))[0])
        if score < THRESHOLD:
            r = detect(d["mission_day"], d)
            if r and r["is_anomaly"]:
                top = r["top_factors"][0]["label"] if r["top_factors"] else None
                out.append({"day": d["mission_day"], "score": r["score"], "top_factor": top})
    return tuple(out)


def timeline() -> dict:
    days = mission_days()
    m = meta()
    limit = thresholds()["radiation"]["cumulative_mission_dose_msv"]["career_limit"]
    forecast = _forecast(days[-1])
    limit_day = next((f["day"] for f in forecast if f["cumulative_msv"] >= limit), None)
    events, last_id = [], None
    for d in days:
        ev = d["radiation"]["solar_event"]
        if ev and ev != last_id:  # first day of each event only
            events.append({"day": d["mission_day"], "event": ev, "replay_date": d["replay_date"]})
        last_id = ev
    return {
        "today": m["current_day"],
        "length": m["mission_length_days"],
        "phases": [
            {"name": "Transit", "start": 1, "end": m["transit_end_day"]},
            {"name": "Mars surface", "start": m["transit_end_day"] + 1, "end": m["leave_mars_day"]},
            {"name": "Return", "start": m["leave_mars_day"] + 1, "end": m["mission_length_days"]},
        ],
        "limit_msv": limit,
        "limit_day": limit_day,
        "zones_msv": {"yellow": 400, "red": 500},
        "history": [
            {"day": d["mission_day"], "cumulative_msv": d["radiation"]["cumulative_dose_msv"],
             "daily_msv": d["radiation"]["daily_dose_msv"], "event": d["radiation"]["solar_event"]}
            for d in days
        ],
        "forecast": forecast,
        "end_of_mission_msv": forecast[-1]["cumulative_msv"] if forecast else None,
        "events": events,
        "anomalies": list(flagged()),
        "event_source": m["event_source"],
    }


def warm_up() -> None:
    """Compute the flagged days once in the background, so the timeline opens instantly."""
    try:
        flagged()
    except Exception:  # never crash the server because of a warm-up
        pass

