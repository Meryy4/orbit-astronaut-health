"""Generate the simulated mission of Cmdr A. Nova (fictional astronaut) -> data/mission_days.json.

Every value is either calibrated on a published figure (see SOURCES.md) or an ORBIT
assumption, marked "ASSUMPTION" below. The output is deterministic (fixed seed).

Mission: 900 days. Transit to Mars (days 1-180), Mars surface (181-680), return (681-900).
"Today" is day 412, so days 1-412 are generated.

Space weather is real: mission day 409 replays 2024-05-11, and every solar event from
NASA DONKI in that date range (data/donki_events.json, see fetch_donki.py) is replayed
on the matching mission day.

Storyline (the demo): the May 2024 superstorm. Nova spends days 409-411 in the storm
shelter, sleeps badly, keeps saying "I'm fine", and her vigilance drops.

Run:  python3 data_gen/generate.py
"""

import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
SEED = 412

META = {
    "astronaut_id": "nova-01",
    "name": "Cmdr A. Nova",
    "current_day": 412,
    "mission_length_days": 900,
    "transit_end_day": 180,
    "leave_mars_day": 680,
    "earth_delay_min": 19,
    "replay_anchor": {"mission_day": 409, "date": "2024-05-11"},
}

# --- Radiation ------------------------------------------------------------------------
TRANSIT_DOSE_MSV = 1.84  # Zeitlin et al. 2013 (MSL cruise)
SURFACE_DOSE_MSV = 0.64  # Hassler et al. 2014 (Curiosity RAD, Gale crater)
# ASSUMPTION: extra dose on the day of a replayed DONKI event (the Mars atmosphere shields part of it).
SEP_EXTRA_MSV = {"transit": 12.0, "surface": 4.0}
FLARE_X_EXTRA_MSV = {"transit": 1.5, "surface": 0.5}
SEP_ONGOING_DAYS = 2  # ASSUMPTION: elevated flux for 2 days after the SEP onset
# Storyline: the dose of days 409-412 is set so the cumulative dose is 523.2 mSv on day 412
# (career limit 600 mSv reached around day 532). Split of the storm dose over the 4 days:
STORM_SPLIT = {409: 0.07, 410: 0.53, 411: 0.30, 412: 0.10}
TARGET_CUMULATIVE_412 = 523.2

# --- Sleep and vigilance ----------------------------------------------------------------
# Barger et al. 2014 report ~6.1 h/night in flight on average. ASSUMPTION: Nova is a good
# sleeper (7.3 h), so the demo starts from a healthy baseline.
SLEEP_MEAN_H, SLEEP_SD_H = 7.3, 0.25
STORM_SLEEP_H = {409: 5.5, 410: 4.2, 411: 4.5, 412: 4.8}  # storyline: nights in the shelter
BASELINE_RT_MS = 248
# ASSUMPTION: sleep debt over the last 3 nights drives lapses and slowing (cumulative effect of sleep
# restriction, HRP sleep evidence report). Lapse = RT > 355 ms (Basner et al. 2011).
LAPSES_PER_DEBT_H = 0.7
RT_PCT_PER_DEBT_H = 4.5

# --- Body -------------------------------------------------------------------------------
# Stahn et al. 2017: core temperature rises by ~1 °C over ~2.5 months in flight. ASSUMPTION: it
# settles lower in Mars partial gravity.
TEMP_PREFLIGHT_C, TEMP_TRANSIT_C, TEMP_SURFACE_C = 36.5, 37.2, 37.0
# NASA HRP Bone Fracture report: 1-1.5 %/month without effective countermeasures.
# ASSUMPTION: 0.8 %/month in transit with daily exercise, 0.4 %/month in Mars gravity (0.38 g).
BONE_RATE = {"transit": 0.8, "surface": 0.4}
BONE_PER_EXERCISE_MIN = 0.016  # ASSUMPTION, same coefficient as the What-if model
# Fictional illness episode (immune system, latent viral reactivation in the spirit of Crucian et al.).
ILLNESS_DAYS = {263: 37.7, 264: 38.2, 265: 37.9, 266: 37.5}


def replay_date(day: int) -> date:
    a = META["replay_anchor"]
    return date.fromisoformat(a["date"]) + timedelta(days=day - a["mission_day"])


def phase(day: int) -> str:
    if day <= META["transit_end_day"]:
        return "transit"
    return "surface" if day <= META["leave_mars_day"] else "return"


def load_events() -> tuple[dict[str, list[dict]], str]:
    """Real DONKI events grouped by date. Falls back to the May 2024 storm only."""
    f = DATA / "donki_events.json"
    if f.exists():
        events, source = json.loads(f.read_text())["events"], "NASA DONKI (downloaded)"
    else:
        events = [
            {"id": "FLR 2024-05-11 X5.8 (fallback, not from DONKI)", "type": "FLR", "time": "2024-05-11T01:23Z", "class": "X5.8"},
            {"id": "SEP 2024-05-11 (fallback, not from DONKI)", "type": "SEP", "time": "2024-05-11T02:00Z"},
            {"id": "FLR 2024-05-14 X8.7 (fallback, not from DONKI)", "type": "FLR", "time": "2024-05-14T16:51Z", "class": "X8.7"},
        ]
        source = "fallback: May 2024 storm only (run data_gen/fetch_donki.py)"
    by_day: dict[str, list[dict]] = {}
    for e in events:
        by_day.setdefault(e["time"][:10], []).append(e)
    return by_day, source


def main_event(events: list[dict]) -> dict | None:
    """The event shown for the day: SEP first, then the strongest X-class flare."""
    seps = [e for e in events if e["type"] == "SEP"]
    if seps:
        return seps[0]
    xs = [e for e in events if e["type"] == "FLR" and (e.get("class") or "").startswith("X")]
    return max(xs, key=lambda e: float(e["class"][1:] or 0), default=None)


def poisson(rng: random.Random, lam: float) -> int:
    l, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= l:
            return k
        k += 1


def generate() -> dict:
    rng = random.Random(SEED)
    events_by_day, event_source = load_events()
    last_day = META["current_day"]

    # Pass 1: radiation, so the storm dose can be calibrated on the cumulative target.
    doses, day_events = {}, {}
    last_sep = None  # (day, event): a SEP keeps the particle flux high for a few days
    for day in range(1, last_day + 1):
        ph = phase(day)
        base = TRANSIT_DOSE_MSV if ph == "transit" else SURFACE_DOSE_MSV
        dose = base * rng.uniform(0.92, 1.08)
        ev = main_event(events_by_day.get(replay_date(day).isoformat(), []))
        extra = 0.0
        if ev and ev["type"] == "SEP":
            last_sep = (day, ev)
            extra = SEP_EXTRA_MSV[ph]
        elif last_sep and day - last_sep[0] <= SEP_ONGOING_DAYS:
            extra = SEP_EXTRA_MSV[ph] / 2
            ev = ev or {**last_sep[1], "ongoing": True}
        elif ev:
            extra = FLARE_X_EXTRA_MSV[ph]
        if day not in STORM_SPLIT:
            dose += extra
        doses[day], day_events[day] = dose, ev
    pre_storm = sum(d for day, d in doses.items() if day not in STORM_SPLIT)
    storm_total = TARGET_CUMULATIVE_412 - pre_storm
    if storm_total <= 0:
        raise SystemExit(f"Pre-storm dose {pre_storm:.1f} mSv already above the storyline target")
    for day, share in STORM_SPLIT.items():
        doses[day] = storm_total * share

    # Pass 2: physiology.
    days, cumulative, bmd, sleeps = [], 0.0, 0.0, []
    for day in range(1, last_day + 1):
        ph = phase(day)
        storm = day in STORM_SPLIT
        shelter = day in (409, 410, 411)

        sleep_h = STORM_SLEEP_H[day] if storm else rng.gauss(SLEEP_MEAN_H, SLEEP_SD_H)
        sleeps.append(sleep_h)
        debt = sum(max(0.0, 7.0 - s) for s in sleeps[-3:])

        rt = BASELINE_RT_MS * (1 + RT_PCT_PER_DEBT_H / 100 * debt) + rng.gauss(0, 5)
        lapses = round(0.2 + LAPSES_PER_DEBT_H * debt) if storm else poisson(rng, 0.2 + LAPSES_PER_DEBT_H * debt)

        if day <= 75:
            temp = TEMP_PREFLIGHT_C + (TEMP_TRANSIT_C - TEMP_PREFLIGHT_C) * day / 75
        else:
            temp = TEMP_TRANSIT_C if ph == "transit" else TEMP_SURFACE_C
        temp = ILLNESS_DAYS.get(day, temp + rng.gauss(0, 0.08))
        ill = day in ILLNESS_DAYS

        hrv = 45 - 2.8 * debt - (8 if ill else 0) + rng.gauss(0, 2.5)
        hr = 61 + 1.9 * debt + (9 if ill else 0) + rng.gauss(0, 1.5)

        if shelter:
            resistance, aerobic = 10, 0
        elif ill:
            resistance, aerobic = 15, 0
        elif day % 7 == 0:
            resistance, aerobic = 45, 15  # lighter cardio day
        else:
            resistance, aerobic = 45, 30
        rate = max(0.3, BONE_RATE["transit" if ph == "transit" else "surface"] - BONE_PER_EXERCISE_MIN * (resistance - 45))
        bmd -= rate / 30
        cumulative += doses[day]
        ev = day_events[day]

        days.append({
            "astronaut_id": META["astronaut_id"],
            "mission_day": day,
            "replay_date": replay_date(day).isoformat(),
            "phase": ph,
            "vitals": {
                "resting_hr_bpm": round(hr),
                "hrv_rmssd_ms": round(hrv),
                "systolic_bp": round(rng.gauss(117, 3)),
                "diastolic_bp": round(rng.gauss(75, 2)),
                "body_temp_c": round(temp, 1),
            },
            "sleep": {
                "duration_min": round(sleep_h * 60),
                "quality_1_5": 2 if sleep_h < 5 else 3 if sleep_h < 6.5 else rng.choice([4, 4, 5]),
            },
            "cognitive": {"pvt_mean_rt_ms": round(rt), "pvt_lapses": lapses},
            "self_report": {
                "mood_1_5": 3 if storm or ill else rng.choice([4, 4, 5]),
                "stress_1_5": 3 if storm or ill else rng.choice([1, 2, 2]),
                # Storyline: Nova keeps saying she is fine. This is the self-report gap.
                "fatigue_1_5": 2 if storm else 4 if ill else rng.choice([1, 2, 2]),
                "symptoms": ["headache"] if day in (411, 412) else ["sore throat", "chills"] if ill else [],
            },
            "exercise": {"resistance_min": resistance, "aerobic_min": aerobic},
            "radiation": {
                "daily_dose_msv": round(doses[day], 2),
                "cumulative_dose_msv": round(cumulative, 1),
                "solar_event": ev["id"] if ev else None,
            },
            "bone": {"bmd_change_pct": round(bmd + rng.gauss(0, 0.03), 2)},
        })

    return {"meta": {**META, "event_source": event_source, "seed": SEED}, "days": days}


def main() -> None:
    out = generate()
    (DATA / "mission_days.json").write_text(json.dumps(out, separators=(",", ":")))
    d = out["days"][-1]
    print(f"{len(out['days'])} days · events: {out['meta']['event_source']}")
    print(f"day 412: cumulative {d['radiation']['cumulative_dose_msv']} mSv, bone {d['bone']['bmd_change_pct']}%, "
          f"PVT {d['cognitive']['pvt_mean_rt_ms']} ms / {d['cognitive']['pvt_lapses']} lapses")


if __name__ == "__main__":
    main()
