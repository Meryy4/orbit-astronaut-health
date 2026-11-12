"""What-if simulator: how forecasts change if the astronaut changes their plan.

ILLUSTRATIVE MODEL. The coefficients below are simple linear assumptions (listed in
SOURCES.md, "ORBIT assumptions") and must be fitted from the NASA HRP evidence
reports. With the current plan, the model gives exactly the same forecasts as
the analysis, so every difference shown comes from the change the user makes.
"""

from statistics import mean

from .analysis import _bone_rate_per_month, baseline, bone_threshold_day, radiation_limit_day, thresholds
from .mission import mission_days

# Bone loss rate drops by this much (% per month) for each extra minute of daily resistance exercise.
BONE_PER_EXERCISE_MIN = 0.016
MIN_BONE_RATE = 0.3  # exercise cannot stop bone loss completely
# Share of the dose avoided for each hour spent in shielded quarters (0.3 = 30% lower dose during that hour).
SHIELD_REDUCTION = 0.3
# Expected PVT lapses and reaction time change per extra hour of sleep.
LAPSES_PER_SLEEP_H = 2.0
RT_PCT_PER_SLEEP_H = 13.0


def defaults(day: int) -> dict:
    """Today's plan, read from the data: usual exercise, sleep of the last 3 nights, no extra shielding."""
    past = mission_days()[max(0, day - 14): day]
    quiet = [d for d in past if not d["radiation"]["solar_event"]] or past
    last3 = mission_days()[max(0, day - 3): day]
    return {
        "resistance_min": round(mean(d["exercise"]["resistance_min"] for d in quiet)),
        "sleep_h": round(mean(d["sleep"]["duration_min"] for d in last3) / 60, 1),
        "shield_h": 0,
    }


def _lapse_status(lapses: int) -> str:
    t = thresholds()["behavioral"]["pvt_lapses"]
    return "red" if lapses >= t["red"]["min"] else "yellow" if lapses >= t["yellow"]["min"] else "green"


def _bone_status(rate: float) -> str:
    t = thresholds()["bone"]["bmd_loss_pct_per_month"]
    return "red" if rate > t["red"]["above"] else "yellow" if rate >= t["yellow"]["min"] else "green"


def simulate(day: int, rec: dict, plan: dict, now: dict) -> dict:
    base = baseline(day)
    c = rec["cognitive"]
    rt = c.get("pvt_median_rt_ms") or c["pvt_mean_rt_ms"]
    rt_now = round((rt - base["pvt_mean_rt_ms"]) / base["pvt_mean_rt_ms"] * 100)

    # Bone
    rate_now = _bone_rate_per_month(day)
    extra_ex = plan["resistance_min"] - now["resistance_min"]
    rate = rate_now if extra_ex == 0 else max(MIN_BONE_RATE, rate_now - BONE_PER_EXERCISE_MIN * extra_ex)
    bone_day = bone_threshold_day(day, -rec["bone"]["bmd_change_pct"], rate)

    # Radiation
    limit = thresholds()["radiation"]["cumulative_mission_dose_msv"]["career_limit"]
    daily = base["daily_dose_msv"] * (1 - SHIELD_REDUCTION * plan["shield_h"] / 24)
    radiation_day = radiation_limit_day(day, rec["radiation"]["cumulative_dose_msv"], daily, limit)

    # Vigilance
    extra_sleep = plan["sleep_h"] - now["sleep_h"]
    lapses = max(0, round(c["pvt_lapses"] - LAPSES_PER_SLEEP_H * extra_sleep))
    rt_pct = max(0, round(rt_now - RT_PCT_PER_SLEEP_H * extra_sleep))

    return {
        "bone": {"rate_pct_per_month": round(rate, 2), "threshold_day": bone_day, "status": _bone_status(rate)},
        "radiation": {"daily_dose_msv": round(daily, 3), "limit_day": radiation_day},
        "vigilance": {"lapses": lapses, "rt_vs_baseline_pct": rt_pct, "status": _lapse_status(lapses)},
    }


def suggestion(now: dict) -> dict:
    """ORBIT's suggested plan: 7 h of sleep, +15 min exercise, 8 h/day in shielded quarters."""
    return {"resistance_min": min(90, now["resistance_min"] + 15), "sleep_h": 7.0, "shield_h": 8}
