"""Onboard assistant: RAG over public NASA documents, with a local LLM (no Earth link needed).

Index:   PDFs in rag_docs/ -> chunks (with page numbers) -> nomic-embed-text embeddings
Answer:  question -> top-k chunks (cosine) -> qwen3.5:4b, told to use only those chunks and cite [n]

Build the index once (takes a few minutes):
    .venv/bin/python -m app.rag build
"""

import json
import re
import sys
import urllib.request
from collections.abc import Iterator
from functools import lru_cache
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DOCS_DIR = ROOT / "rag_docs"
INDEX_DIR = ROOT / "data" / "rag_index"
OLLAMA = "http://localhost:11434"
EMBED_MODEL = "nomic-embed-text"
CHAT_MODEL = "qwen3.5:4b"
CHUNK_CHARS = 1200
OVERLAP_CHARS = 200
TOP_K = 4

# File -> title shown in citations (same documents as SOURCES.md).
TITLES = {
    "01_hrp-acute-radiation-spe.pdf": "HRP Evidence Report: Acute Radiation Syndromes from SPEs (2016)",
    "02_hrp-bone-fracture-2024.pdf": "HRP Evidence Report: Bone Fracture (2024)",
    "03_hrp-sleep-circadian.pdf": "HRP Evidence Report: Sleep Loss, Circadian Desynchronization and Work Overload (2016)",
    "04_hrp-behavioral-health.pdf": "HRP Evidence Report: Cognitive or Behavioral Conditions (2016)",
    "05_hrp-immune.pdf": "HRP Evidence Report: Altered Immune Response (2013)",
    "06_nasa-std-3001-vol2-revE.pdf": "NASA-STD-3001 Vol. 2 Rev E (2025)",
    "07_nasa-std-3001-vol1-revC.pdf": "NASA-STD-3001 Vol. 1 Rev C (2023)",
}

SYSTEM_PROMPT = """You are ORBIT, the onboard health assistant of a crew on a Mars mission. Earth is 19 minutes away one way, so the crew relies on you.
Rules:
- Answer ONLY from the numbered NASA excerpts below and the astronaut's situation. Cite excerpts like [1] or [2][4] right after the sentence they support.
- Before judging a number, compare it with the threshold in the situation or the excerpts. Never call a risk acute, severe or dangerous unless the excerpts say so at today's level. Stay calm and factual: do not exaggerate, do not reassure without evidence.
- Do not invent numbers. Use only numbers from the excerpts or the situation.
- Do not assume an action is already done: actions in the plan are still to do.
- If the excerpts do not answer the question, say so plainly and suggest asking the crew medical officer.
- You support decisions, you do not diagnose or replace the crew medical officer.
- Be short and practical: 3 to 4 sentences, plain English, no headings, no lists."""

# Reference facts, quoted word for word from the indexed NASA documents (text and pages checked in rag_docs/).
# They are always given to the model next to the retrieved excerpts when radiation is involved,
# so it compares today's dose with real thresholds instead of guessing.
RADIATION_FACTS = [
    {"doc": "07_nasa-std-3001-vol1-revC.pdf", "page": 40,
     "text": "An individual crewmember's total career effective radiation dose due to spaceflight radiation exposure shall be less than 600 mSv. This limit is universal for all ages and sexes."},
    {"doc": "07_nasa-std-3001-vol1-revC.pdf", "page": 42,
     "text": "The program shall protect crewmembers from exposure to the design reference Solar Particle Event (SPE) environment proton energy spectrum (sum of the October 1989 events) to less than an effective dose of 250 mSv. [Rationale: The 250 mSv effective dose threshold was chosen to minimize acute effects ...]"},
    {"doc": "01_hrp-acute-radiation-spe.pdf", "page": 11,
     "text": "Doses that are in the range of 0.5 to 1 Gy cause minor acute damage to the hematopoietic system and mild prodromal effects (nausea, vomiting, anorexia, and fatigue) in a small number of irradiated persons (Anno et al. 1989)."},
]
RADIATION_WORDS = ("radiation", "dose", "solar", "spe", "flare", "storm", "shelter", "msv", "sievert")
ACUTE_EFFECTS_MSV = 500  # 0.5 Gy, lower end of mild prodromal effects (HRP ARS report p. 11); ~mSv for low-LET


# --- Ollama ---------------------------------------------------------------------------

def _post(path: str, body: dict, timeout: int = 120):
    req = urllib.request.Request(OLLAMA + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=timeout)


def embed(texts: list[str]) -> np.ndarray:
    with _post("/api/embed", {"model": EMBED_MODEL, "input": texts}) as r:
        vectors = np.array(json.loads(r.read())["embeddings"], dtype=np.float32)
    return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)


def chat_stream(messages: list[dict]) -> Iterator[str]:
    body = {"model": CHAT_MODEL, "messages": messages, "stream": True, "think": False, "options": {"temperature": 0.2}}
    with _post("/api/chat", body, timeout=300) as r:
        for line in r:
            if line.strip():
                part = json.loads(line)
                if text := part.get("message", {}).get("content"):
                    yield text


def ollama_ready() -> bool:
    try:
        with urllib.request.urlopen(OLLAMA + "/api/version", timeout=2):
            return True
    except OSError:
        return False


# --- Index ----------------------------------------------------------------------------

def _clean(text: str) -> str:
    text = re.sub(r"-\n(\w)", r"\1", text)  # re-join hyphenated words
    return re.sub(r"\s+", " ", text).strip()


def chunk_pdf(path: Path) -> list[dict]:
    from pypdf import PdfReader

    chunks = []
    for page_no, page in enumerate(PdfReader(path).pages, start=1):
        text = _clean(page.extract_text() or "")
        if len(text) < 200 or text.count(". . .") > 5 or text.count("....") > 5:
            continue  # empty pages and tables of contents
        start = 0
        while start < len(text):
            piece = text[start:start + CHUNK_CHARS]
            chunks.append({"doc": path.name, "page": page_no, "text": piece})
            start += CHUNK_CHARS - OVERLAP_CHARS
    return chunks


def build_index() -> None:
    chunks = []
    for pdf in sorted(DOCS_DIR.glob("*.pdf")):
        c = chunk_pdf(pdf)
        print(f"{pdf.name}: {len(c)} chunks", flush=True)
        chunks += c
    vectors = []
    for i in range(0, len(chunks), 64):
        batch = chunks[i:i + 64]
        vectors.append(embed([f"search_document: {c['text']}" for c in batch]))
        print(f"embedded {i + len(batch)} / {len(chunks)}", flush=True)
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    np.save(INDEX_DIR / "vectors.npy", np.vstack(vectors))
    (INDEX_DIR / "chunks.json").write_text(json.dumps(chunks))
    print(f"Index saved to {INDEX_DIR}")


def load_index() -> tuple[np.ndarray, list[dict]] | None:
    """The index, or None if it is not built yet (checked again on each call until it exists)."""
    if not (INDEX_DIR / "vectors.npy").exists():
        return None
    return _read_index()


@lru_cache(maxsize=1)
def _read_index() -> tuple[np.ndarray, list[dict]]:
    return np.load(INDEX_DIR / "vectors.npy"), json.loads((INDEX_DIR / "chunks.json").read_text())


def retrieve(question: str, k: int = TOP_K) -> list[dict]:
    index = load_index()
    if index is None:
        raise RuntimeError("RAG index missing. Run: .venv/bin/python -m app.rag build")
    vectors, chunks = index
    q = embed([f"search_query: {question}"])[0]
    scores = vectors @ q
    picked, seen = [], set()
    for i in np.argsort(-scores):
        c = chunks[int(i)]
        key = (c["doc"], c["page"])
        if key in seen:  # one chunk per page, for more varied sources
            continue
        seen.add(key)
        picked.append({**c, "title": TITLES.get(c["doc"], c["doc"]), "score": round(float(scores[i]), 3)})
        if len(picked) == k:
            break
    return picked


# --- Answer ---------------------------------------------------------------------------

def day_context(rec: dict, analysis: dict) -> str:
    """Short description of the astronaut's day, so answers fit the situation."""
    st = ", ".join(f"{k} {v['status']}" for k, v in analysis["systems"].items())
    lines = [
        f"Mission day {rec['mission_day']} ({rec['phase']}). Systems: {st}.",
        f"Sleep {rec['sleep']['duration_min'] / 60:.1f} h, PVT {rec['cognitive']['pvt_lapses']} lapses, "
        f"HRV {rec['vitals']['hrv_rmssd_ms']} ms, temperature {rec['vitals']['body_temp_c']} °C, "
        f"radiation today {rec['radiation']['daily_dose_msv']} mSv, cumulative {rec['radiation']['cumulative_dose_msv']} mSv.",
    ]
    if rec["radiation"]["solar_event"]:
        lines.append(f"Solar event in progress: {rec['radiation']['solar_event']}.")
    r = rec["radiation"]
    lines.append(
        f"Dose comparison: today's {r['daily_dose_msv']} mSv is {r['daily_dose_msv'] / ACUTE_EFFECTS_MSV:.0%} of the ~{ACUTE_EFFECTS_MSV} mSv "
        f"where mild acute effects start in a few people, and {r['daily_dose_msv'] / 250:.0%} of the 250 mSv protection target, "
        f"which applies to ONE solar particle event (not to the career total). "
        f"Separately, the cumulative career dose {r['cumulative_dose_msv']} mSv is {r['cumulative_dose_msv'] / 600:.0%} of the 600 mSv career limit."
    )
    if analysis.get("actions"):
        plan = " ".join(f"({a['priority']}) {a['text']}" for a in analysis["actions"])
        lines.append(f"ORBIT's action plan for today, already shown to the crew: {plan} Recommend these actions first when the crew asks what to do.")
    if analysis["self_report_gap"]["detected"]:
        lines.append(analysis["self_report_gap"]["message"])
    return " ".join(lines)


def needs_radiation_facts(question: str, rec: dict) -> bool:
    """Radiation questions, or open "what should I do" questions on a day with a solar event."""
    q = question.lower()
    generic = "what should i do" in q or "do now" in q
    return any(w in q for w in RADIATION_WORDS) or (generic and bool(rec["radiation"]["solar_event"]))


def with_facts(sources: list[dict], question: str, rec: dict) -> list[dict]:
    """Retrieved excerpts + the radiation reference facts (without duplicating a page already retrieved)."""
    if not needs_radiation_facts(question, rec):
        return sources
    have = {(s["doc"], s["page"]) for s in sources}
    facts = [{**f, "title": TITLES[f["doc"]], "score": None, "reference": True}
             for f in RADIATION_FACTS if (f["doc"], f["page"]) not in have]
    return sources + facts


def build_messages(question: str, sources: list[dict], context: str) -> list[dict]:
    excerpts = "\n\n".join(f"[{i}] {s['title']}, page {s['page']}:\n{s['text']}" for i, s in enumerate(sources, start=1))
    return [
        {"role": "system", "content": f"{SYSTEM_PROMPT}\n\nAstronaut's situation today: {context}\n\nNASA excerpts:\n{excerpts}"},
        {"role": "user", "content": question},
    ]


if __name__ == "__main__":
    if sys.argv[1:] == ["build"]:
        build_index()
    else:
        print(__doc__)
