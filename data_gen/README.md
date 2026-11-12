# Mission data generator

Builds the simulated mission of **Cmdr A. Nova** (fictional astronaut): `data/mission_days.json`.

```bash
python3 data_gen/fetch_donki.py   # once: real solar events from NASA DONKI -> data/donki_events.json
python3 data_gen/generate.py      # deterministic (seed 412)
```

Without `data/donki_events.json`, the generator only replays the May 2024 storm (fallback IDs say so).

## Mission

| | Days |
|---|---|
| Transit to Mars | 1–180 |
| Mars surface | 181–680 |
| Return | 681–900 |
| Today | 412 (days 1–412 are generated) |

Mission day 409 replays **2024-05-11** (day 1 = 2023-03-29), so every DONKI event in that range lands on a mission day.

## Calibration

| Signal | Value | Basis |
|---|---|---|
| GCR dose, transit | 1.84 mSv/day | Zeitlin et al. 2013 |
| GCR dose, Mars surface | 0.64 mSv/day | Hassler et al. 2014 |
| Extra dose on an SEP day | +12 mSv transit, +4 mSv surface, half for 2 more days | ORBIT assumption |
| Extra dose on an X-class flare day | +1.5 mSv transit, +0.5 mSv surface | ORBIT assumption |
| Sleep | 7.3 ± 0.25 h | Barger et al. 2014 report ~6.1 h in flight; Nova is assumed to be a good sleeper |
| PVT baseline | 248 ms mean RT, lapse > 355 ms | Basner et al. 2011 (definition); value is an assumption |
| Sleep debt effect | +0.7 lapses and +4.5 % RT per hour of debt (last 3 nights) | ORBIT assumption, in the spirit of the HRP sleep report |
| Core temperature | 36.5 → 37.2 °C over 75 days in transit, 37.0 °C on Mars | Stahn et al. 2017 (+~1 °C); Mars value is an assumption |
| Bone loss | 0.8 %/month transit, 0.4 %/month Mars, −0.016 %/month per extra exercise minute | HRP Bone report (1–1.5 %/month without countermeasures); values are assumptions |

## Storyline

| Days | What happens |
|---|---|
| 263–266 | Fictional illness episode: fever up to 38.2 °C, HR up, HRV down |
| 409 | X5.8 flare and SEP. Nova moves into the storm shelter |
| 410–411 | SEP continues. Short nights in the shelter (4.2–4.5 h), lapses rise |
| 412 | X8.7 flare. Cumulative dose 523.2 mSv (career limit ~day 532). Nova still rates her fatigue 2/5 |

The storm dose is set so the cumulative dose reaches 523.2 mSv on day 412, whatever the earlier events add.
