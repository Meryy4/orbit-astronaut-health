# Sources & References

The Space Apps rules require citing **every** source used, including open-source ones. Missing citations can cost a nomination or award.

Status:
- ⬜ = to verify
- 📄 = reference exists (DOI checked on Crossref), figures not yet re-read in the paper
- ✅ = figure checked in the source text

## Scientific publications

| Status | Reference | Used for | DOI / Link |
|---|---|---|---|
| 📄 | Zeitlin C. et al. (2013). Measurements of Energetic Particle Radiation in Transit to Mars on the Mars Science Laboratory. *Science*. | Transit dose ~1.84 mSv/day | https://doi.org/10.1126/science.1235989 |
| 📄 | Hassler D.M. et al. (2014). Mars' Surface Radiation Environment Measured with the Mars Science Laboratory's Curiosity Rover. *Science*. | Surface dose ~0.64 mSv/day | https://doi.org/10.1126/science.1244797 |
| 📄 | Basner M., Mollicone D., Dinges D.F. (2011). Validity and sensitivity of a brief psychomotor vigilance test (PVT-B) to total and partial sleep deprivation. *Acta Astronautica*. | PVT-B design: 3 min, ISI 2–10 s, lapse > 355 ms | https://doi.org/10.1016/j.actaastro.2011.07.015 |
| 📄 | Barger L.K. et al. (2014). Prevalence of sleep deficiency and use of hypnotic drugs in astronauts before, during, and after spaceflight: an observational study. *The Lancet Neurology*. | In-flight sleep ~6.09 h/night | https://doi.org/10.1016/S1474-4422(14)70122-X |
| 📄 | Stahn A.C. et al. (2017). Increased core body temperature in astronauts during long-duration space missions. *Scientific Reports*. | Core temperature +~1 °C ("space fever") | https://doi.org/10.1038/s41598-017-15560-w |
| ⬜ | Crucian B. et al.: immune dysregulation / latent viral reactivation (EBV, VZV, CMV) in astronauts | Immune risk | Exact paper to confirm. A Crucian 2015 paper exists in *npj Microgravity* (https://doi.org/10.1038/npjmgrav.2015.13), not *Frontiers in Microbiology*. |

## NASA standards & reports (also used as RAG documents)

| Status | Document | Used for | Link |
|---|---|---|---|
| ⬜ | NASA-STD-3001 Vol. 1: Crew Health (check revision: Rev B 2022 or Rev C 2023) | 600 mSv career limit, cardiovascular limits, short-term radiation limits | _URL to add_ |
| ⬜ | NASA-STD-3001 Vol. 2 (Rev D): Human Factors, Habitability, and Environmental Health | RAG corpus | _URL to add_ |
| ⬜ | HRP Evidence Report: Risk of Bone Fracture Due to Spaceflight-induced Changes to Bone | Bone loss 1–1.5%/month | _NTRS URL to add_ |
| ⬜ | HRP Evidence Report: Risk of Acute Radiation Syndromes Due to Solar Particle Events | SPE dose thresholds | _NTRS URL to add_ |
| ⬜ | HRP Evidence Report: Risk of Performance Decrements… Sleep Loss, Circadian Desynchronization, and Work Overload | Sleep, PVT | _NTRS URL to add_ |
| ⬜ | HRP Risk Record: Risk of Adverse Cognitive or Behavioral Conditions and Psychiatric Disorders | Mood, third-quarter phenomenon | _URL to add_ |
| ⬜ | HRP Evidence Report: Risk of Adverse Health Event Due to Altered Immune Response | Immune risk | _NTRS URL to add_ |

## NASA data & APIs

| Status | Source | Used for | Link |
|---|---|---|---|
| ⬜ | NASA DONKI: Solar Flares (FLR) | Real flares in the mission simulation | https://api.nasa.gov/DONKI/FLR?startDate=2024-05-10&endDate=2024-05-14&api_key=DEMO_KEY |
| ⬜ | NASA DONKI: Solar Energetic Particles (SEP) | Real SEP events | https://api.nasa.gov/DONKI/SEP?startDate=2024-05-10&endDate=2024-05-14&api_key=DEMO_KEY |
| ⬜ | NASA Open Science Data Repository (OSDR) | Background | https://osdr.nasa.gov/ |

Demo event: **May 2024 solar superstorm** (NOAA AR3664), flares X5.8 (May 11) and X8.7 (May 14). Check the SEP level (S2 or S3) in the DONKI response.

## ORBIT assumptions (no direct source, stated as such)

| Item | Value | Basis |
|---|---|---|
| HRV (RMSSD) red threshold | < 15 ms sustained 48 h | Operational assumption, autonomic stress proxy |
| Mood/stress red threshold | Distress score > 2 SD above personal baseline | Operational assumption |
| Mission dose orange/red | 400 / 500 mSv | Safety margin below the 600 mSv career limit |

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
