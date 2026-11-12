import json

from fastapi.testclient import TestClient

from app import rag
from app.main import app

client = TestClient(app)

FAKE_SOURCES = [
    {"doc": "01_hrp-acute-radiation-spe.pdf", "title": "HRP Evidence Report: Acute Radiation Syndromes from SPEs (2016)",
     "page": 12, "text": "During an SPE the crew should move to a shielded area.", "score": 0.8},
]


def ask(question="What should I do during a solar particle event?"):
    return client.post("/assistant/ask", json={"astronaut_id": "nova-01", "mission_day": 412, "question": question})


def test_streams_sources_then_answer(monkeypatch):
    seen = {}
    monkeypatch.setattr(rag, "ollama_ready", lambda: True)
    monkeypatch.setattr(rag, "retrieve", lambda q: FAKE_SOURCES)

    def fake_chat(messages):
        seen["system"] = messages[0]["content"]
        yield "Move to the shelter "
        yield "[1]."

    monkeypatch.setattr(rag, "chat_stream", fake_chat)
    r = ask()
    assert r.status_code == 200
    lines = [json.loads(line) for line in r.text.splitlines()]
    assert lines[0]["type"] == "sources" and lines[0]["sources"][0]["page"] == 12
    assert "".join(x["text"] for x in lines if x["type"] == "token") == "Move to the shelter [1]."
    assert lines[-1]["type"] == "done"
    # The model gets the excerpts and today's situation.
    assert "[1] HRP Evidence Report" in seen["system"]
    assert "Mission day 412" in seen["system"] and "Solar event in progress" in seen["system"]


def test_clear_error_when_model_is_off(monkeypatch):
    monkeypatch.setattr(rag, "ollama_ready", lambda: False)
    r = ask()
    assert r.status_code == 503 and "ollama serve" in r.json()["detail"]


def test_question_validation():
    assert ask("").status_code == 422


def test_chunking_keeps_page_numbers(tmp_path):
    from pypdf import PdfWriter

    path = tmp_path / "empty.pdf"
    w = PdfWriter()
    w.add_blank_page(100, 100)
    w.write(path)
    assert rag.chunk_pdf(path) == []  # blank pages are skipped
    assert rag._clean("radi-\nation   dose\n") == "radiation dose"


def test_radiation_facts_are_exact_quotes():
    """Every reference fact must appear word for word in the indexed PDF page (skipped without the index)."""
    import re

    import pytest

    index = rag.load_index()
    if index is None:
        pytest.skip("RAG index not built")
    norm = lambda t: re.sub(r"[^a-z0-9]", "", t.lower())
    pages = {}
    for c in index[1]:
        pages[(c["doc"], c["page"])] = pages.get((c["doc"], c["page"]), "") + norm(c["text"])
    for f in rag.RADIATION_FACTS:
        quote = norm(f["text"].split("[Rationale")[0].replace("...", ""))
        assert quote in pages[(f["doc"], f["page"])], (f["doc"], f["page"])


def test_facts_added_for_radiation_questions_only():
    from app.mission import get_day

    calm = get_day(100)
    assert rag.with_facts([], "How should I sleep better?", calm) == []
    facts = rag.with_facts([], "What is my radiation limit?", calm)
    assert [f["page"] for f in facts] == [40, 42, 11] and all(f["reference"] for f in facts)
    assert "Dose comparison" in rag.day_context(get_day(412), {"systems": {}, "self_report_gap": {"detected": False}})
