from fastapi.testclient import TestClient

from app import alerts
from app.analysis import analyze
from app.main import CHECKINS, app
from app.mission import get_day

client = TestClient(app)


def setup_function():
    alerts.STATE.clear()
    CHECKINS.clear()


def test_report_summary_and_trends():
    r = client.get("/report/nova-01/day/412").json()
    assert "Solar event in progress" in r["summary"] and "career limit forecast on day 532" in r["summary"]
    assert "Self-rated fatigue 2/5" in r["summary"]
    assert len(r["trends"]["behavioral"]["values"]) == 14 and r["trends"]["behavioral"]["days"][-1] == 412
    assert {q["id"] for q in r["suggested_questions"]} >= {"eva", "sleep-aid", "plan"}
    assert r["sent"] is None and r["actions_taken"] == []


def test_ticked_actions_appear_with_time():
    client.post("/alert/nova-01/day/412/actions/shelter", json={"done": True})
    taken = client.get("/report/nova-01/day/412").json()["actions_taken"]
    assert taken[0]["text"].startswith("Move to the radiation shelter") and taken[0]["at"]


def test_send_gives_round_trip():
    body = {"priority": "urgent", "questions": ["eva"], "note": "Mild headache", "attachments": ["trends"], "packet_bytes": 1500}
    sent = client.post("/report/nova-01/day/412/send", json=body).json()["sent"]
    assert [s["minutes"] for s in sent["steps"]] == [0, 19, 24, 43]  # 19 min each way + 5 min urgent review
    assert sent["note"] == "Mild headache"
    bad = {**body, "priority": "whenever"}
    assert client.post("/report/nova-01/day/412/send", json=bad).status_code == 422


def test_quiet_day_summary():
    assert client.get("/report/nova-01/day/100").json()["summary"].startswith("All systems green")


def test_forecast_follows_mission_phases():
    # On day 100 (transit), the forecast must account for the lower dose on Mars after day 180.
    f = analyze(100, get_day(100))["forecast"]
    assert f["radiation_limit_day"] > 500 and f["bone_threshold_day"] > 412
