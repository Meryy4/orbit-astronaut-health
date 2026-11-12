from fastapi.testclient import TestClient

from app.main import CHECKINS, app

client = TestClient(app)


def checkin_body(**cognitive):
    c = {"pvt_mode": "demo", "pvt_mean_rt_ms": 252, "pvt_median_rt_ms": 250,
         "pvt_lapses": 0, "pvt_false_starts": 0, "pvt_trials": 8}
    c.update(cognitive)
    return {"astronaut_id": "nova-01", "mission_day": 412, "cognitive": c,
            "sleep": {"quality_1_5": 4}, "self_report": {"mood_1_5": 4, "fatigue_1_5": 2}}


def setup_function():
    CHECKINS.clear()


def test_health_and_mission():
    assert client.get("/health").json()["status"] == "ok"
    m = client.get("/mission/nova-01").json()
    assert m["current_day"] == 412 and m["days_available"] == 412


def test_days_follow_data_format():
    days = client.get("/mission/nova-01/days").json()
    assert len(days) == 412
    d = days[-1]
    for key in ("vitals", "sleep", "cognitive", "self_report", "exercise", "radiation", "bone"):
        assert key in d
    assert d["replay_date"] == "2024-05-14"
    assert client.get("/mission/nova-01/day/409").json()["replay_date"] == "2024-05-11"


def test_unknown_astronaut_and_day():
    assert client.get("/mission/nobody/days").status_code == 404
    assert client.get("/mission/nova-01/day/0").status_code == 404
    assert client.get("/mission/nova-01/day/9999").status_code == 404


def test_storyline_day_412():
    a = client.get("/analysis/nova-01/day/412").json()
    assert a["systems"]["radiation"]["status"] == "red"
    assert a["systems"]["behavioral"]["status"] == "red"
    assert a["self_report_gap"]["detected"] is True
    assert 240 <= a["baseline"]["pvt_mean_rt_ms"] <= 256  # storm days are left out of the baseline
    assert 525 <= a["forecast"]["radiation_limit_day"] <= 540  # career limit ~4 months away
    assert a["actions"][0]["priority"] == "now"
    assert a["anomaly"]["is_anomaly"] is True


def test_quiet_day_is_calm():
    a = client.get("/analysis/nova-01/day/300").json()
    assert a["systems"]["behavioral"]["status"] == "green"
    assert a["self_report_gap"]["detected"] is False


def test_checkin_good_result_replaces_simulated_pvt():
    r = client.post("/checkin", json=checkin_body())
    assert r.status_code == 200
    body = r.json()
    assert body["checkin"]["pvt_status"] == "green"
    assert 240 <= body["checkin"]["baseline_rt_ms"] <= 256
    # Sleep is still 4.8 h on day 412, so behavioral stays red, but only because of sleep.
    assert body["systems"]["behavioral"]["reasons"] == ["Sleep 4.8 h"]
    assert body["self_report_gap"]["detected"] is False
    # The analysis endpoint now uses the live check-in too.
    assert client.get("/analysis/nova-01/day/412").json()["systems"]["behavioral"]["reasons"] == ["Sleep 4.8 h"]


def test_checkin_gap_when_slow_but_feels_fine():
    body = client.post("/checkin", json=checkin_body(pvt_median_rt_ms=310, pvt_lapses=2)).json()
    assert body["checkin"]["pvt_status"] == "yellow"
    pct = body["checkin"]["vs_baseline_pct"]
    assert 20 <= pct <= 30
    assert body["self_report_gap"]["detected"] is True
    assert f"{pct}% slower" in body["self_report_gap"]["message"]


def test_checkin_validation():
    bad = checkin_body()
    bad["self_report"]["fatigue_1_5"] = 7
    assert client.post("/checkin", json=bad).status_code == 422
    bad = checkin_body()
    bad["astronaut_id"] = "nobody"
    assert client.post("/checkin", json=bad).status_code == 404


def test_gap_message_with_fast_median_but_lapses():
    body = client.post("/checkin", json=checkin_body(pvt_median_rt_ms=200, pvt_lapses=4)).json()
    msg = body["self_report_gap"]["message"]
    assert "4 lapses" in msg and "slower than your baseline" not in msg


def whatif(plan=None, day=412):
    return client.post("/whatif", json={"astronaut_id": "nova-01", "mission_day": day, "plan": plan}).json()


def test_whatif_today_plan_matches_analysis():
    w = whatif()
    a = client.get("/analysis/nova-01/day/412").json()
    assert w["today_plan"] == {"resistance_min": 45, "sleep_h": 4.5, "shield_h": 0}
    assert w["current"] == w["projected"]
    assert w["current"]["radiation"]["limit_day"] == a["forecast"]["radiation_limit_day"]
    assert w["current"]["bone"]["threshold_day"] == a["forecast"]["bone_threshold_day"]


def test_whatif_suggestion_story():
    w = whatif(whatif()["suggested_plan"])
    p = w["projected"]
    assert p["vigilance"]["lapses"] == 0 and p["vigilance"]["status"] == "green"
    assert p["radiation"]["limit_day"] > w["current"]["radiation"]["limit_day"]
    assert p["bone"]["threshold_day"] > w["current"]["bone"]["threshold_day"]


def test_whatif_worse_plan_moves_forecasts_earlier():
    p = whatif({"resistance_min": 0, "sleep_h": 4.0, "shield_h": 0})["projected"]
    assert p["vigilance"]["lapses"] > 5
    assert p["bone"]["threshold_day"] < whatif()["current"]["bone"]["threshold_day"]


def test_whatif_validation():
    r = client.post("/whatif", json={"astronaut_id": "nova-01", "mission_day": 412,
                                     "plan": {"resistance_min": 30, "sleep_h": 20, "shield_h": 0}})
    assert r.status_code == 422


def test_generated_data_storyline():
    days = client.get("/mission/nova-01/days").json()
    by = {d["mission_day"]: d for d in days}
    lapses = [by[n]["cognitive"]["pvt_lapses"] for n in (408, 409, 410, 411)]
    assert lapses == sorted(lapses) and lapses[-1] >= 4  # vigilance drops during the storm
    assert all(by[n]["radiation"]["solar_event"] for n in (409, 410, 411, 412))
    assert all(by[n]["self_report"]["fatigue_1_5"] <= 2 for n in (409, 410, 411, 412))  # "I'm fine"
    assert by[264]["vitals"]["body_temp_c"] > 38.0  # illness episode
    assert by[180]["phase"] == "transit" and by[181]["phase"] == "surface"
    assert abs(by[412]["radiation"]["cumulative_dose_msv"] - 523.2) < 0.2


def test_space_weather():
    sw = client.get("/space-weather?start=400&end=412").json()
    assert [e["mission_day"] for e in sw["events"]] == [409, 410, 411, 412]
    assert sw["replay_anchor"] == {"mission_day": 409, "date": "2024-05-11"}
