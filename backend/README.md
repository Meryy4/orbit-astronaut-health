# ORBIT backend (FastAPI)

Endpoints follow [docs/DATA_FORMAT.md](../docs/DATA_FORMAT.md).

```bash
cd backend
uv venv .venv && uv pip install -p .venv -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8010   # API docs: http://localhost:8010/docs
.venv/bin/python -m pytest -q
```

The frontend dev server forwards `/api/*` to port 8010.

| File | Role |
|---|---|
| `app/main.py` | Routes: `/mission/{id}`, `/mission/{id}/days`, `/mission/{id}/day/{n}`, `/analysis/{id}/day/{n}`, `POST /checkin`, `POST /whatif`, `/space-weather`, `/alert/...`, `POST /plan`, `POST /assistant/ask` (streamed), `/assistant/status` |
| `app/alerts.py` | Alert title, reasons and action plan for a day; ticks, acknowledgement and What-if plan kept in memory. |
| `app/ml.py` | Personal anomaly detection: Isolation Forest trained on the astronaut's previous 90 days (retrained weekly), SHAP explains the top factors. A system green by the rules turns amber if the model finds it unusual for this astronaut. |
| `app/rag.py` | Onboard assistant: the 7 NASA PDFs in `rag_docs/` are chunked (with page numbers) and embedded with `nomic-embed-text`; `POST /assistant/ask` retrieves the 5 closest excerpts and streams an answer from `qwen3.5:4b` (Ollama, `think: false`) that cites them. Build the index once: `.venv/bin/python -m app.rag build` (stored in `data/rag_index/`, not committed). |
| `app/whatif.py` | What-if model (illustrative coefficients at the top of the file). |
| `app/mission.py` | Loads `data/mission_days.json`, made by [`data_gen/generate.py`](../data_gen/generate.py). |
| `app/analysis.py` | Rule-based safety net from `data/thresholds.json`, 14-day personal baseline (solar event days left out), forecasts, self-report gap, actions. `anomaly` comes from `app/ml.py` (null during the first 30 days). |

Live check-ins are kept in memory only, never written to disk.
