from app.analysis import analyze
from app.mission import get_day, mission_days
from app.ml import detect

STORY = [263, 264, 265, 266, 409, 410, 411, 412]


def test_warm_up_has_no_model():
    assert detect(10, get_day(10)) is None


def test_storyline_days_are_flagged_and_explained():
    for day in STORY:
        r = detect(day, get_day(day))
        assert r["is_anomaly"], day
        assert r["top_factors"], day
    labels = {f["label"] for f in detect(410, get_day(410))["top_factors"]}
    assert "Sleep duration" in labels
    fever = detect(264, get_day(264))
    assert fever["top_factors"][0]["shap"] <= fever["top_factors"][-1]["shap"]  # sorted, most anomalous first


def test_few_false_alarms_on_ordinary_days():
    quiet = [d for d in mission_days()[37:] if d["mission_day"] not in STORY]  # first model: day 36+
    flagged = [d["mission_day"] for d in quiet if detect(d["mission_day"], d)["is_anomaly"]]
    assert len(flagged) / len(quiet) < 0.03, flagged


def test_ml_raises_heart_to_amber_on_day_412():
    a = analyze(412, get_day(412))
    heart = a["systems"]["cardiovascular"]
    assert heart["status"] == "yellow" and heart.get("flagged_by") == "ml"
    assert any("(ML)" in reason for reason in heart["reasons"])
    assert a["method"] == "rules+ml"


def test_fever_is_explained_by_temperature():
    r = detect(264, get_day(264))
    temp = [f for f in r["top_factors"] if f["feature"] == "vitals.body_temp_c"]
    assert temp and temp[0]["vs_baseline"] > 1.0
