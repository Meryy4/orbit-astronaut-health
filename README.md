# ORBIT

**AI-powered autonomous health monitoring for astronauts on long-duration missions.**

*NASA International Space Apps Challenge 2026*

---

## The problem

On a mission to Mars, a message to Earth can take up to ~20 minutes one way. There is no doctor on call. Astronauts face radiation, isolation, altered gravity and a hostile closed environment, and they carry much of the responsibility for spotting health changes in themselves. They also tend to under-report symptoms.

## Our solution

ORBIT helps an astronaut **measure, understand and act on** their own health, without needing Earth.

| Feature | What it does |
|---|---|
| **Live cognitive check-in** | A 2-minute Psychomotor Vigilance Test (PVT) and 3 questions. This is real data measured from the user. |
| **Personal baseline** | Every signal is compared to the astronaut's *own* normal, not to population averages. |
| **Explainable anomaly detection** | A per-astronaut Isolation Forest with SHAP explanations flags multi-signal deviations and says *why*. |
| **Self-report gap** | Compares what the astronaut *says* with what their data *shows*. |
| **Digital twin** | A 2D body view with risk levels for 5 systems: cardiovascular, bone, immune, radiation and behavioral. |
| **Mission simulation** | A Mars mission timeline driven by real solar events from NASA's DONKI API. |
| **Onboard AI assistant** | A local, open-source LLM with RAG over NASA documents. It works offline and cites its sources. |
| **Action plan** | What to do now, and when to escalate to the crew or to Earth (with the comm delay shown). |

## Tech stack

- **Frontend:** React
- **Backend:** FastAPI (Python)
- **ML:** scikit-learn, SHAP
- **LLM:** Ollama with an Apache-2.0-licensed open-weight model
- **Data:** NASA DONKI API, with simulated astronaut data calibrated on published NASA figures

## Data disclaimer

Individual astronaut medical data is confidential and not public. ORBIT uses a **fictional astronaut** whose simulated data is calibrated on published NASA figures. Cognitive test results are measured live from the user and are not stored. All sources are listed in [SOURCES.md](SOURCES.md).

## Team

- **Meryeme**: AI/ML & full-stack
- **Oussama**: data science

## License

[Apache 2.0](LICENSE)
