"""Record real answers of the onboard assistant (local RAG + Ollama) for the online demo.

The demo cannot run a language model, so it replays these recorded answers. They come from
the real pipeline: same retrieval, same NASA reference facts, same prompt, same model.

Run from backend/ (needs Ollama and the RAG index):   .venv/bin/python -m scripts.record_assistant
"""

import json
from pathlib import Path

from app import rag
from app.analysis import analyze
from app.mission import get_day, meta

OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "demo" / "assistant.json"
QUESTIONS = [
    "What should I do during a solar particle event?",
    "How does sleep loss affect my performance?",
    "What is the career radiation exposure limit?",
    "How does exercise protect bone during long missions?",
    "Solar storm while your vigilance is low. What should I do now?",
]


def main() -> None:
    day = meta()["current_day"]
    rec = get_day(day)
    context = rag.day_context(rec, analyze(day, rec))
    answers = []
    for q in QUESTIONS:
        sources = rag.with_facts(rag.retrieve(q), q, rec)
        text = "".join(rag.chat_stream(rag.build_messages(q, sources, context)))
        answers.append({
            "question": q,
            "answer": text.strip(),
            "sources": [{"n": i, "title": s["title"], "doc": s["doc"], "page": s["page"], "excerpt": s["text"][:280],
                         "reference": s.get("reference", False)} for i, s in enumerate(sources, start=1)],
        })
        print(f"recorded: {q}", flush=True)
    OUT.write_text(json.dumps({"model": rag.CHAT_MODEL, "mission_day": day, "answers": answers}, indent=1))
    print(f"saved {OUT}")


if __name__ == "__main__":
    main()
