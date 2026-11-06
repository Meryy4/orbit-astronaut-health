# Sources & References

The Space Apps rules require citing **every** source used, including open-source ones. Missing citations can cost a nomination or award.

Status: ⬜ = to verify · ✅ = verified (link opened, figure checked)

## NASA data & APIs

| Status | Source | Used for | Link |
|---|---|---|---|
| ⬜ | NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information) | Real solar flares / SEP events in the mission simulation | https://api.nasa.gov/ |
| ⬜ | NASA Open Science Data Repository (OSDR / GeneLab) | Background on spaceflight biology | https://osdr.nasa.gov/ |
| ⬜ | NASA Human Research Program: Human System Risks | The 5 risk categories and their descriptions | https://humanresearchroadmap.nasa.gov/ |
| ⬜ | NASA "5 Hazards of Human Spaceflight" | Framing of the problem | https://www.nasa.gov/hrp/hazards |

## Figures used in the model (verify each before using it)

| Status | Figure | Value (from memory, to check) | Reference |
|---|---|---|---|
| ⬜ | Radiation dose in Mars transit | ~1.8 mSv/day | Zeitlin et al., 2013, *Science*. MSL RAD measurements in transit to Mars |
| ⬜ | Radiation dose on Mars surface | ~0.6–0.7 mSv/day | Hassler et al., 2014, *Science*. Curiosity RAD surface measurements |
| ⬜ | Career radiation exposure limit | 600 mSv | NASA-STD-3001 Vol. 1 |
| ⬜ | Bone mineral density loss in microgravity | ~1–1.5% per month (hip/spine) | NASA Human Research Program |
| ⬜ | Cognition test battery for spaceflight (incl. PVT) | Test design | Basner et al., 2015, *Aerospace Medicine and Human Performance* |
| ⬜ | NASA Twins Study | Physiological/cognitive changes over a 1-year mission | Garrett-Bakelman et al., 2019, *Science* |
| ⬜ | Earth–Mars one-way communication delay | ~3 to ~22 minutes | NASA |

## Documents used by the RAG assistant

| Status | Document | License / public status | Link |
|---|---|---|---|
| ⬜ | | | |

## Software & libraries

| Library | License | Link |
|---|---|---|
| React | MIT | https://react.dev/ |
| FastAPI | MIT | https://fastapi.tiangolo.com/ |
| scikit-learn | BSD-3-Clause | https://scikit-learn.org/ |
| SHAP | MIT | https://github.com/shap/shap |
| Ollama | MIT | https://ollama.com/ |
| LLM model: _to choose_ | Must be Apache 2.0 (check the model card) | |

## AI usage disclosure

- An AI assistant (Claude) was used for planning, documentation and coding help.
- ORBIT itself uses a local open-source LLM (see above) for the onboard assistant.
