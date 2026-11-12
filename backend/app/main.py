"""ORBIT API. Endpoints follow docs/DATA_FORMAT.md.

Run:  .venv/bin/uvicorn app.main:app --reload --port 8010
"""

import copy
from typing import Literal

import json

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import alerts, rag
from .analysis import analyze, baseline, pvt_status
from .mission import get_day, meta, mission_days
from .whatif import defaults as plan_defaults
from .whatif import simulate, suggestion

app = FastAPI(title="ORBIT API", version="0.1.0")

# Live check-ins, kept in memory only: cognitive results are not stored on disk (see README).
CHECKINS: dict[tuple[str, int], dict] = {}


class Cognitive(BaseModel):
    pvt_mode: Literal["demo", "full"]
    pvt_mean_rt_ms: int | None = Field(ge=0)
    pvt_median_rt_ms: int | None = Field(ge=0)
    pvt_lapses: int = Field(ge=0)
    pvt_false_starts: int = Field(ge=0)
    pvt_trials: int = Field(ge=1)


class Sleep(BaseModel):
    quality_1_5: int = Field(ge=1, le=5)


class SelfReport(BaseModel):
    mood_1_5: int = Field(ge=1, le=5)
    fatigue_1_5: int = Field(ge=1, le=5)


class CheckIn(BaseModel):
    astronaut_id: str
    mission_day: int
    cognitive: Cognitive
    sleep: Sleep
    self_report: SelfReport


class Plan(BaseModel):
    resistance_min: int = Field(ge=0, le=120)
    sleep_h: float = Field(ge=3, le=10)
    shield_h: int = Field(ge=0, le=24)


class WhatIf(BaseModel):
    astronaut_id: str
    mission_day: int
    plan: Plan | None = None  # null: just return today's plan and forecasts


def _check_astronaut(astronaut_id: str) -> None:
    if astronaut_id != meta()["astronaut_id"]:
        raise HTTPException(404, f"Unknown astronaut '{astronaut_id}'")


def _record(astronaut_id: str, n: int) -> dict:
    _check_astronaut(astronaut_id)
    rec = get_day(n)
    if rec is None:
        raise HTTPException(404, f"Mission day {n} not available (1-{len(mission_days())})")
    return rec


def _with_checkin(rec: dict, checkin: dict | None) -> dict:
    """The live check-in replaces the simulated PVT and self-report for that day."""
    if checkin is None:
        return rec
    merged = copy.deepcopy(rec)
    merged["cognitive"].update(checkin["cognitive"])
    merged["sleep"]["quality_1_5"] = checkin["sleep"]["quality_1_5"]
    merged["self_report"].update(checkin["self_report"])
    return merged


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "days": len(mission_days())}


@app.get("/mission/{astronaut_id}")
def mission(astronaut_id: str) -> dict:
    _check_astronaut(astronaut_id)
    return {**meta(), "days_available": len(mission_days())}


@app.get("/mission/{astronaut_id}/days")
def days(astronaut_id: str) -> list[dict]:
    _check_astronaut(astronaut_id)
    return list(mission_days())


@app.get("/mission/{astronaut_id}/day/{n}")
def day(astronaut_id: str, n: int) -> dict:
    return _record(astronaut_id, n)


@app.get("/analysis/{astronaut_id}/day/{n}")
def analysis(astronaut_id: str, n: int) -> dict:
    rec = _with_checkin(_record(astronaut_id, n), CHECKINS.get((astronaut_id, n)))
    return analyze(n, rec)


@app.post("/checkin")
def checkin(body: CheckIn) -> dict:
    rec = _record(body.astronaut_id, body.mission_day)
    data = body.model_dump()
    CHECKINS[(body.astronaut_id, body.mission_day)] = data
    result = analyze(body.mission_day, _with_checkin(rec, data))
    c = body.cognitive
    base_rt = baseline(body.mission_day)["pvt_mean_rt_ms"]
    rt = c.pvt_median_rt_ms if c.pvt_median_rt_ms is not None else c.pvt_mean_rt_ms
    result["checkin"] = {
        "pvt_status": pvt_status(c.pvt_lapses, rt, base_rt),
        "baseline_rt_ms": base_rt,
        "vs_baseline_pct": None if rt is None else round((rt - base_rt) / base_rt * 100),
    }
    return result


@app.post("/whatif")
def whatif(body: WhatIf) -> dict:
    """Forecasts with today's plan vs. a new plan (illustrative model, see app/whatif.py)."""
    rec = _with_checkin(_record(body.astronaut_id, body.mission_day), CHECKINS.get((body.astronaut_id, body.mission_day)))
    now = plan_defaults(body.mission_day)
    plan = body.plan.model_dump() if body.plan else now
    return {
        "mission_day": body.mission_day,
        "horizon": {"leave_mars_day": meta()["leave_mars_day"], "end_day": meta()["mission_length_days"]},
        "today_plan": now,
        "suggested_plan": suggestion(now),
        "plan": plan,
        "current": simulate(body.mission_day, rec, now, now),
        "projected": simulate(body.mission_day, rec, plan, now),
        "model": "illustrative",
    }


@app.get("/space-weather")
def space_weather(start: int = 1, end: int | None = None) -> dict:
    """Replayed solar events per mission day (NASA DONKI, see data_gen/fetch_donki.py)."""
    end = end or len(mission_days())
    return {
        "source": meta()["event_source"],
        "replay_anchor": meta()["replay_anchor"],
        "events": [
            {
                "mission_day": d["mission_day"],
                "replay_date": d["replay_date"],
                "event": d["radiation"]["solar_event"],
                "daily_dose_msv": d["radiation"]["daily_dose_msv"],
            }
            for d in mission_days()
            if start <= d["mission_day"] <= end and d["radiation"]["solar_event"]
        ],
    }


# --- Alerts and action plan -------------------------------------------------------------

class ActionDone(BaseModel):
    done: bool


class PlanIn(BaseModel):
    astronaut_id: str
    mission_day: int
    plan: Plan


def _alert(astronaut_id: str, n: int) -> dict:
    rec = _with_checkin(_record(astronaut_id, n), CHECKINS.get((astronaut_id, n)))
    return alerts.build(astronaut_id, n, rec, analyze(n, rec), meta()["earth_delay_min"])


@app.get("/alert/{astronaut_id}/day/{n}")
def get_alert(astronaut_id: str, n: int) -> dict:
    return _alert(astronaut_id, n)


@app.post("/alert/{astronaut_id}/day/{n}/ack")
def ack_alert(astronaut_id: str, n: int) -> dict:
    _record(astronaut_id, n)
    s = alerts.state(astronaut_id, n)
    s["acked_at"] = s["acked_at"] or alerts.now_utc()
    return _alert(astronaut_id, n)


@app.post("/alert/{astronaut_id}/day/{n}/actions/{action_id}")
def tick_action(astronaut_id: str, n: int, action_id: str, body: ActionDone) -> dict:
    current = _alert(astronaut_id, n)
    ids = {a["id"] for g in current["groups"] for a in g["items"]}
    if action_id not in ids:
        raise HTTPException(404, f"No action '{action_id}' on day {n}")
    done = alerts.state(astronaut_id, n)["done"]
    done.add(action_id) if body.done else done.discard(action_id)
    return _alert(astronaut_id, n)


@app.post("/plan")
def add_plan(body: PlanIn) -> dict:
    """Adds a What-if plan to the day's action plan."""
    _record(body.astronaut_id, body.mission_day)
    alerts.state(body.astronaut_id, body.mission_day)["plan"] = body.plan.model_dump()
    return _alert(body.astronaut_id, body.mission_day)



# --- Onboard assistant (RAG) ------------------------------------------------------------

class Ask(BaseModel):
    astronaut_id: str
    mission_day: int
    question: str = Field(min_length=3, max_length=500)


@app.get("/assistant/status")
def assistant_status() -> dict:
    index = rag.load_index()
    return {
        "ollama": rag.ollama_ready(),
        "index": index is not None,
        "chunks": len(index[1]) if index else 0,
        "model": rag.CHAT_MODEL,
        "embeddings": rag.EMBED_MODEL,
        "documents": list(rag.TITLES.values()),
    }


@app.post("/assistant/ask")
def assistant_ask(body: Ask) -> StreamingResponse:
    """Streams NDJSON lines: {"type": "sources"}, then {"type": "token"}..., then {"type": "done"}."""
    rec = _with_checkin(_record(body.astronaut_id, body.mission_day), CHECKINS.get((body.astronaut_id, body.mission_day)))
    if not rag.ollama_ready():
        raise HTTPException(503, "The local model is not running. Start it with: ollama serve")
    try:
        sources = rag.retrieve(body.question)
    except RuntimeError as err:
        raise HTTPException(503, str(err)) from err
    sources = rag.with_facts(sources, body.question, rec)
    messages = rag.build_messages(body.question, sources, rag.day_context(rec, analyze(body.mission_day, rec)))

    def lines():
        cited = [{"n": i, "title": s["title"], "doc": s["doc"], "page": s["page"], "excerpt": s["text"][:280],
                  "reference": s.get("reference", False)}
                 for i, s in enumerate(sources, start=1)]
        yield json.dumps({"type": "sources", "sources": cited, "model": rag.CHAT_MODEL}) + "\n"
        try:
            for token in rag.chat_stream(messages):
                yield json.dumps({"type": "token", "text": token}) + "\n"
            yield json.dumps({"type": "done"}) + "\n"
        except OSError as err:
            yield json.dumps({"type": "error", "message": f"Local model error: {err}"}) + "\n"

    return StreamingResponse(lines(), media_type="application/x-ndjson")
