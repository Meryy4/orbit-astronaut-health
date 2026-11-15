# Space Apps submission text

Copy each section into the matching field of the project page (Project tab → Edit). Everything is in English, as the rules require.

---

## Project name

ORBIT

## High-level summary

ORBIT is an AI health co-pilot for astronauts on missions where Earth is too far to help. A short vigilance test and three questions, combined with simulated vitals calibrated on NASA studies, feed a personal anomaly detector (Isolation Forest + SHAP) that compares each astronaut to her own baseline and explains what changed. ORBIT spots the gap between "I'm fine" and what the data shows, replays real NASA DONKI solar storms, lets the crew test decisions before taking them, gives a clear action plan, and answers questions offline from NASA documents with citations. It covers all five NASA spaceflight hazards in one crew-facing tool.

## Link to project repository

https://github.com/Meryy4/orbit-astronaut-health

## Link to demo

_Paste the 30-second video link here (YouTube or Google Drive, viewable by anyone with the link)._

Try the prototype online: https://meryy4.github.io/orbit-astronaut-health/ (no install; data computed by our backend, What-if and vigilance test run live).

## Project details

**The problem.** On the way to Mars, a message to Earth takes up to 20 minutes one way. There is no doctor on call, and inflight health information already relies heavily on crew self-report. Under stress, astronauts may say "I'm fine" when their reactions, sleep and heart say otherwise.

**What ORBIT does.** ORBIT is crew-facing decision support in the spirit of NASA's Earth-Independent Medical Operations (EIMO). It helps the astronaut measure, understand and act on her own health, and it never replaces the crew medical officer. Our demo follows Cmdr A. Nova, a fictional astronaut on day 412 of a Mars mission, during a replay of the real May 2024 solar superstorm.

- **Check-in:** a live Psychomotor Vigilance Test (PVT-B, Basner et al. 2011) and three questions (sleep, mood, fatigue). This part measures the real user.
- **Digital twin:** five body systems (radiation, brain and sleep, heart, bone, immune) in green, amber or red, with the reason and the action for each. Any mission day can be replayed, and the storm can be played day by day.
- **Personal AI:** an Isolation Forest trained on the astronaut's own previous 90 days flags unusual days, and SHAP explains which signals drove it. On day 412, fixed safety limits call the heart green, but the model sees it is unusual for Nova and raises it to amber.
- **Self-report gap:** "You rated your fatigue 2/5, but your reaction time is 34% slower than your baseline, with 5 lapses."
- **Mission timeline:** cumulative radiation over the 900-day mission with a forecast of the 600 mSv career limit, the real solar events, and the days the AI flagged.
- **What if:** the astronaut tests a plan (sleep, exercise, time in shielded quarters) and sees the forecasts move. ORBIT's suggestion brings vigilance lapses from 5 to 0 and pushes the career dose limit from day 532 to day 545.
- **Alerts and action plan:** why the alert was raised (AI factors and safety limits), then what to do now, today, and when to escalate.
- **Offline assistant:** answers questions from seven NASA documents (NASA-STD-3001 and HRP Evidence Reports) with page citations, using a local open-weight model. Verified NASA thresholds keep it from overstating risks.
- **Earth report:** a compact report for the flight surgeon, about 1 KB compressed, with the 19-minute delay each way shown.

**How we built it.** React frontend, FastAPI backend, scikit-learn and SHAP for the personal model, Ollama with qwen3.5:4b and nomic-embed-text for retrieval-augmented answers, and a Python generator that builds 412 mission days calibrated on published NASA research and replays real DONKI events. The project has 56 automated tests.

**Why it matters.** As missions go farther, crews must detect problems early and decide on their own. ORBIT turns scattered signals into a personal, explained picture and a plan, covering the five NASA hazards: Radiation, Isolation and confinement, Distance from Earth, Gravity fields, and Hostile closed environments.

**Honest limits.** Astronaut medical data is confidential, so Nova's vitals are simulated (calibrated on NASA studies; every assumption is listed in SOURCES.md). The What-if coefficients are illustrative and should be fitted on the HRP evidence. The DONKI flare endpoint was unavailable during our download, so only solar particle events are replayed.

## NASA data

- **NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information), Solar Energetic Particles:** 106 records from 2023-03-29 to 2024-05-31, replayed on 61 mission days, including the May 2024 superstorm. https://api.nasa.gov/
- **NASA-STD-3001 Vol. 1 Rev C (2023) and Vol. 2 Rev E (2025):** career radiation limit (600 mSv), SPE protection target, health standards; indexed for the assistant.
- **NASA Human Research Program Evidence Reports** (acute radiation from SPEs, bone fracture, sleep and circadian, behavioral health, immune response): thresholds, calibration and assistant answers.
- **NASA Human Research Program, "5 Hazards of Human Spaceflight":** the RIDGE framework that structures ORBIT.
- **NASA EIMO overview (NTRS 20230016189):** positioning of ORBIT as decision support for an autonomous crew.
- **Mars Science Laboratory radiation measurements:** Zeitlin et al. 2013 (cruise) and Hassler et al. 2014 (Curiosity RAD, Mars surface).

## Space agency partner and other data

- Published research: Basner et al. 2011 (PVT-B), Barger et al. 2014 (sleep in flight), Stahn et al. 2017 (core temperature), Russell et al. 2023 (clinical decision support for EIMO). Full list with DOIs in SOURCES.md.

## References

Full list with links and licenses: https://github.com/Meryy4/orbit-astronaut-health/blob/main/SOURCES.md

- Zeitlin C. et al. (2013), Science, https://doi.org/10.1126/science.1235989
- Hassler D.M. et al. (2014), Science, https://doi.org/10.1126/science.1244797
- Basner M., Mollicone D., Dinges D.F. (2011), Acta Astronautica, https://doi.org/10.1016/j.actaastro.2011.07.015
- Barger L.K. et al. (2014), The Lancet Neurology, https://doi.org/10.1016/S1474-4422(14)70122-X
- Stahn A.C. et al. (2017), Scientific Reports, https://doi.org/10.1038/s41598-017-15560-w
- Russell B. et al. (2023), npj Microgravity, https://doi.org/10.1038/s41526-023-00284-1
- NASA-STD-3001 Vol. 1 Rev C and Vol. 2 Rev E; NASA HRP Evidence Reports (NTRS 20160003870, 20240005190, 20160003864, 20160004365, 20140002769); NASA EIMO overview (NTRS 20230016189)
- NASA DONKI API, https://api.nasa.gov/
- Software (open source): React, Vite, FastAPI, Uvicorn, Pydantic, scikit-learn, SHAP, NumPy, pypdf, pytest, Ollama, qwen3.5:4b (Apache 2.0), nomic-embed-text (Apache 2.0); fonts Sora, Inter, JetBrains Mono (SIL OFL)
- Video: music "Tension" by paulyudin (Pixabay License); cinematic shots generated with Google Gemini (Veo)

## Use of artificial intelligence

- **Inside ORBIT:** a local open-source language model (qwen3.5:4b via Ollama) answers questions from retrieved NASA document excerpts and cites them; scikit-learn Isolation Forest with SHAP detects and explains anomalies.
- **To build ORBIT:** an AI assistant (Claude) helped with planning, coding, documentation and video editing. Google Gemini (Veo) generated the cinematic shots of the fictional astronaut in the demo video. These shots carry a visible "AI-generated footage" watermark. All app screens in the video are real recordings of our prototype.

## Tags

astronaut health, AI, machine learning, explainable AI, digital twin, NASA DONKI, space weather, RAG, offline AI, EIMO, Mars
