from fastapi.testclient import TestClient

from app import alerts
from app.main import CHECKINS, app

client = TestClient(app)


def setup_function():
    alerts.STATE.clear()
    CHECKINS.clear()


def test_quiet_day_is_all_clear():
    a = client.get("/alert/nova-01/day/100").json()
    assert a["level"] == "green" and a["title"] == "All clear" and a["groups"] == []


def test_storm_alert():
    a = client.get("/alert/nova-01/day/412").json()
    assert a["level"] == "red"
    assert a["title"] == "Solar storm while your vigilance is low"
    assert [r["label"] for r in a["raised"]][:2] == ["Radiation", "Vigilance"]
    assert a["groups"][0]["label"] == "Now"
    assert a["earth_round_trip_min"] == 38
    assert a["anomaly"]["is_anomaly"]
    assert not any(r["text"].endswith("(ML)") for r in a["rule_reasons"])


def test_fever_alert():
    a = client.get("/alert/nova-01/day/264").json()
    assert a["title"] == "Fever: possible infection"
    ids = {i["id"] for g in a["groups"] for i in g["items"]}
    assert {"isolate", "fever-escalate"} <= ids


def test_tick_and_acknowledge():
    a = client.post("/alert/nova-01/day/412/actions/shelter", json={"done": True}).json()
    assert a["done_count"] == 1 and a["groups"][0]["items"][0]["done"]
    a = client.post("/alert/nova-01/day/412/actions/shelter", json={"done": False}).json()
    assert a["done_count"] == 0
    assert client.post("/alert/nova-01/day/412/actions/nope", json={"done": True}).status_code == 404
    first = client.post("/alert/nova-01/day/412/ack").json()["acknowledged_at"]
    assert first and client.post("/alert/nova-01/day/412/ack").json()["acknowledged_at"] == first


def test_whatif_plan_joins_the_action_plan():
    plan = {"resistance_min": 60, "sleep_h": 7.0, "shield_h": 8}
    a = client.post("/plan", json={"astronaut_id": "nova-01", "mission_day": 412, "plan": plan}).json()
    today = next(g for g in a["groups"] if g["priority"] == "today")
    assert any(i["id"] == "whatif-plan" and "7.0 h of sleep" in i["text"] for i in today["items"])
