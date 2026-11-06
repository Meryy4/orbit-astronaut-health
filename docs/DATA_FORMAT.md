# Data Format & API Contract

Agree on this **before** coding, so Meryeme (app/API) and Oussama (data/ML) can work in parallel.

## 1. Daily record (one per astronaut per mission day)

```json
{
  "astronaut_id": "nova-01",
  "mission_day": 412,
  "phase": "transit",

  "vitals": {
    "resting_hr_bpm": 64,
    "hrv_rmssd_ms": 42,
    "systolic_bp": 118,
    "diastolic_bp": 76,
    "body_temp_c": 36.8
  },

  "sleep": {
    "duration_min": 372,
    "quality_1_5": 3
  },

  "cognitive": {
    "pvt_mean_rt_ms": 285,
    "pvt_lapses": 2
  },

  "self_report": {
    "mood_1_5": 4,
    "stress_1_5": 2,
    "fatigue_1_5": 2,
    "symptoms": ["headache"]
  },

  "exercise": {
    "resistance_min": 45,
    "aerobic_min": 30
  },

  "radiation": {
    "daily_dose_msv": 1.8,
    "cumulative_dose_msv": 520.4,
    "solar_event": "SEP-2024-05-11"
  },

  "bone": {
    "bmd_change_pct": -6.2
  }
}
```

`phase`: `"transit"` | `"surface"` | `"return"`
`solar_event`: DONKI event ID, or `null`

## 2. Analysis result (returned by the ML layer)

```json
{
  "mission_day": 412,
  "systems": {
    "cardiovascular": { "status": "yellow", "score": 0.62 },
    "bone":           { "status": "yellow", "score": 0.55 },
    "immune":         { "status": "green",  "score": 0.20 },
    "radiation":      { "status": "red",    "score": 0.85 },
    "behavioral":     { "status": "yellow", "score": 0.58 }
  },
  "anomaly": {
    "is_anomaly": true,
    "score": -0.21,
    "top_factors": [
      { "feature": "hrv_rmssd_ms", "shap": -0.12, "vs_baseline_pct": -25 },
      { "feature": "sleep.duration_min", "shap": -0.08, "vs_baseline_pct": -14 }
    ]
  },
  "self_report_gap": {
    "detected": true,
    "message": "You report low fatigue, but your reaction time is 18% slower than your baseline."
  },
  "forecast": {
    "bone_threshold_day": 540,
    "radiation_limit_day": 455
  },
  "actions": [
    { "priority": "now", "text": "Move to the shielded area during the solar event." },
    { "priority": "today", "text": "Sleep: target 7h tonight." },
    { "priority": "escalate", "text": "Inform crew medical officer if HRV stays low for 2 more days." }
  ]
}
```

`status`: `"green"` | `"yellow"` | `"red"`

## 3. API endpoints (FastAPI)

| Method | Endpoint | Owner | Description |
|---|---|---|---|
| GET | `/mission/{astronaut_id}/days` | Oussama | All daily records (simulated mission) |
| GET | `/mission/{astronaut_id}/day/{n}` | Oussama | One day's record |
| POST | `/checkin` | Meryeme | Submit live PVT + self-report, returns analysis |
| GET | `/analysis/{astronaut_id}/day/{n}` | Oussama | Analysis result for a day |
| GET | `/space-weather?start=&end=` | Oussama | DONKI events (cached) |
| POST | `/assistant/ask` | Meryeme | RAG question → answer + cited sources |

## 4. Open questions to decide together

- [ ] Mission length: 900 days?
- [ ] Which DONKI date range to replay?
- [ ] Thresholds for green / yellow / red per system
- [ ] Baseline window: 7 or 14 days?
- [ ] Demo storyline day (e.g. day 412: solar event + sleep drop)
