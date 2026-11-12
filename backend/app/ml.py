"""Personal anomaly detection: Isolation Forest + SHAP.

For each analyzed day, an Isolation Forest is trained on the astronaut's own previous
90 days, so "normal" means normal *for this astronaut*, not a population average.
SHAP (TreeExplainer) then says which signals push the day towards "anomalous".

Radiation and bone are left out on purpose: they are slow, physical trends handled by
the rules and the forecasts. The model looks at physiology, sleep and vigilance.
"""

from functools import lru_cache
import numpy as np
import shap
from sklearn.ensemble import IsolationForest

from .mission import mission_days

WINDOW_DAYS = 90
RETRAIN_EVERY_DAYS = 7
MIN_TRAIN_DAYS = 30
# Decision function below this = anomaly. Calibrated on the simulated mission: every storyline
# day (illness 263-266, storm 409-412) scores below -0.10, and under 3 % of the other days are
# flagged (tests/test_ml.py checks both).
THRESHOLD = -0.09
# A factor is shown only if SHAP says it pushes towards "anomalous" and it is at least this many
# standard deviations away from the astronaut's own mean (so it works for °C as well as for minutes).
MIN_FACTOR_Z = 2.0

# (key in the API, label for people, system, how to read it from a daily record)
FEATURES = [
    ("vitals.resting_hr_bpm", "Resting heart rate", "cardiovascular", lambda r: r["vitals"]["resting_hr_bpm"]),
    ("vitals.hrv_rmssd_ms", "Heart rate variability", "cardiovascular", lambda r: r["vitals"]["hrv_rmssd_ms"]),
    ("vitals.systolic_bp", "Systolic blood pressure", "cardiovascular", lambda r: r["vitals"]["systolic_bp"]),
    ("vitals.body_temp_c", "Body temperature", "immune", lambda r: r["vitals"]["body_temp_c"]),
    ("sleep.duration_min", "Sleep duration", "behavioral", lambda r: r["sleep"]["duration_min"]),
    ("cognitive.pvt_mean_rt_ms", "Reaction time", "behavioral", lambda r: r["cognitive"]["pvt_mean_rt_ms"]),
    ("self_report.mood_1_5", "Mood", "behavioral", lambda r: r["self_report"]["mood_1_5"]),
]


def vector(rec: dict) -> list[float]:
    return [float(get(rec)) for _, _, _, get in FEATURES]


def _training_end(day: int) -> int:
    """The model is retrained once a week, like an onboard system would: on days 8, 15, 22..."""
    return ((day - 1) // RETRAIN_EVERY_DAYS) * RETRAIN_EVERY_DAYS


def detect(day: int, rec: dict) -> dict | None:
    return _detect(_training_end(day), rec)


@lru_cache(maxsize=256)
def _model(end: int):
    """Isolation Forest + explainer trained on days end-89..end (cached: training data never changes)."""
    past = mission_days()[max(0, end - WINDOW_DAYS): end]
    if len(past) < MIN_TRAIN_DAYS:
        return None
    X = np.array([vector(r) for r in past])
    forest = IsolationForest(n_estimators=100, random_state=0).fit(X)
    return forest, shap.TreeExplainer(forest), X.mean(axis=0), X.std(axis=0)


def _detect(end: int, rec: dict) -> dict | None:
    """Anomaly result for one day, shaped as in docs/DATA_FORMAT.md. None while the model warms up."""
    trained = _model(end)
    if trained is None:
        return None
    forest, explainer, base, spread = trained
    x = np.array([vector(rec)])
    score = float(forest.decision_function(x)[0])
    contributions = explainer.shap_values(x)[0]

    factors = []
    for (key, label, system, _), value, b, sd, contrib in zip(FEATURES, x[0], base, spread, contributions):
        z = (value - b) / sd if sd else 0.0
        if contrib < 0 and abs(z) >= MIN_FACTOR_Z:
            factors.append({
                "feature": key, "label": label, "system": system,
                "shap": round(float(contrib), 3),
                "vs_baseline_pct": round((value - b) / b * 100) if b else 0,
                "vs_baseline": round(float(value - b), 1),
                "z": round(float(z), 1),
            })
    factors.sort(key=lambda f: f["shap"])
    return {
        "is_anomaly": score < THRESHOLD,
        "score": round(score, 3),
        "top_factors": factors[:3],
        "model": f"IsolationForest, trained on the astronaut's previous {WINDOW_DAYS} days, retrained weekly",
    }


def flagged_days(start: int = 1, end: int | None = None) -> list[int]:
    """Days the model flags, using the simulated records (for the timeline and tests)."""
    days = mission_days()
    end = end or len(days)
    return [d["mission_day"] for d in days[start - 1:end] if (r := detect(d["mission_day"], d)) and r["is_anomaly"]]
