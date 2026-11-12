from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_timeline():
    t = client.get("/timeline/nova-01").json()
    assert t["today"] == 412 and t["length"] == 900
    assert len(t["history"]) == 412 and t["forecast"][0]["day"] == 413 and t["forecast"][-1]["day"] == 900
    assert t["limit_day"] == client.get("/analysis/nova-01/day/412").json()["forecast"]["radiation_limit_day"]
    # The forecast keeps rising from today's cumulative dose.
    assert t["forecast"][0]["cumulative_msv"] > t["history"][-1]["cumulative_msv"]
    assert [e["day"] for e in t["events"]] == [409, 412]  # first day of each event only
    flagged = {a["day"] for a in t["anomalies"]}
    assert {264, 410, 412} <= flagged
    assert [p["name"] for p in t["phases"]] == ["Transit", "Mars surface", "Return"]


def test_timeline_unknown_astronaut():
    assert client.get("/timeline/nobody").status_code == 404
