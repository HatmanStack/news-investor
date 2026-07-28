# System Architecture

## Overview

Server-side prediction model fed by a three-signal sentiment pipeline. No model
is trained in the browser: the frontend gathers and renders data and asks the
backend for a forecast.

```text
Frontend (Browser)                        Backend (Lambda)
┌────────────────────────────┐            ┌───────────────────────────────┐
│ useSentimentData()         │            │ Article Processing:           │
│  ├─ Fetch & align data     │◀─DynamoDB──│  1. Event Classification      │
│  ├─ Extract 3 signals      │   cache    │  2. Signal Score              │
│  └─ POST /predict ─────────┼──────────▶ │  3. Aspect Analysis           │
│                            │            │  4. ML Sentiment (API)        │
│ PredictionSummaryCard      │            │  5. Daily Aggregation         │
│  ├─ Renders the horizons   │            ├───────────────────────────────┤
│  │   the backend served    │◀───────────│ Prediction pipeline:          │
│  └─ PredictionDisclaimer   │ predictions│  1. Forward-looking labels    │
└────────────────────────────┘            │  2. Scale-free feature vector │
                                          │  3. Train logistic regression │
                                          │  4. Walk-forward CV / horizon │
                                          │  5. Serve, suppress, cache    │
                                          └───────────────────────────────┘
```

## Sentiment Pipeline (Backend)

### Three Signals

Each article produces three independent sentiment signals:

| Signal       | Source                                                         | Range        | Scope                |
| ------------ | -------------------------------------------------------------- | ------------ | -------------------- |
| Event Type   | Rule-based keyword classifier                                  | 6 categories | All articles         |
| Aspect Score | Keyword detection across 6 financial aspects                   | -1 to +1     | All articles         |
| ML Score     | External DistilRoBERTa model (neutral dampening + temperature) | -1 to +1     | Material events only |

**Material events**: EARNINGS, M&A, GUIDANCE, ANALYST_RATING, PRODUCT_LAUNCH.
Non-material (GENERAL) articles get `mlScore = null`.

### Event Classification

Rule-based keyword matching with contextual validation.

| Event Type     | Impact Score | Priority |
| -------------- | ------------ | -------- |
| GENERAL        | 0.0          | 1        |
| PRODUCT_LAUNCH | 0.2          | 2        |
| ANALYST_RATING | 0.4          | 3        |
| GUIDANCE       | 0.6          | 4        |
| M&A            | 0.8          | 5        |
| EARNINGS       | 1.0          | 6        |

File: `backend/src/services/eventClassification.service.ts`

### Aspect Analysis

Detects sentiment across 6 financial aspects with event-dependent weighting.

| Aspect   | Weight |
| -------- | ------ |
| EARNINGS | 30%    |
| REVENUE  | 25%    |
| GUIDANCE | 20%    |
| MARGINS  | 15%    |
| GROWTH   | 5%     |
| DEBT     | 5%     |

Polarity formula: `Math.tanh((positiveScore - negativeScore) / SENSITIVITY)` where SENSITIVITY=2.

File: `backend/src/services/aspectAnalysis.service.ts`

### ML Sentiment (External Model)

Calls an ONNX-served DistilRoBERTa model fine-tuned on financial news.

Post-processing applied to raw softmax output:

1. **Neutral dampening**: If `neut_prob >= 0.003`, reduce directional score by `min((neut - 0.003) * 200, 0.9)`
2. **Temperature scaling**: `tanh(arctanh(dampened) / 3.0)` — spreads compressed scores for better nuance

File: `backend/services/ml/model_onnx.py` (separate from `backend/python/` — standalone ML service)

### Signal Score (Reliability Weight)

Not a prediction feature. Used to weight article contributions during daily aggregation.

```text
signalScore = publisher(50%) + headline(30%) + depth(20%)
```

- **Publisher**: Tier-based (Reuters 1.0, WSJ 0.95, CNBC 0.85, default 0.4)
- **Headline**: Quality heuristics (+0.15 numbers, -0.15 questions, -0.2 ALL CAPS)
- **Depth**: Body length tiers (0.2 to 1.0)

File: `backend/src/services/signalScore.service.ts`

### Daily Aggregation

Groups articles by date, computes signal-weighted averages:

```typescript
avgAspectScore = sum(aspectScore * signalScore) / sum(signalScore); // excludes 0
avgMlScore = sum(mlScore * signalScore) / sum(signalScore); // material events only
```

Guards against zero total weight (falls back to `undefined`).

File: `backend/src/utils/sentiment.util.ts`

## Prediction Model (Backend)

Predictions are produced by `POST /predict` and nowhere else. The pipeline trains
one logistic regression per ticker, validates it **per horizon** with
walk-forward cross-validation, and serves only the horizons that clear the
validation floor. Trained weights are cached in DynamoDB so the cost amortises
across callers.

Hyperparameters are deliberately not restated here — read `MODEL_CONFIG` in
`backend/src/types/prediction.types.ts`, which carries the current values and the
reasoning for each.

### Labels

`backend/src/services/featureEngineering.ts` labels day _i_ for horizon _h_ by
comparing `close[i+h]` against `close[i]` against a ±`labelThreshold` band:
`1` (up), `0` (down), or `null` — inside the noise band, or the outcome is not
known yet. Labels are **per horizon**, so the three horizons carry different
information.

The last _h_ rows of any series necessarily carry `null` for horizon _h_.
`prepare_training_data` (`backend/src/services/preprocessing.ts`) drops
unlabelled rows per horizon, so each horizon trains on a different row count.

### Feature Vector

`buildBaseFeatureVector` in `backend/src/services/preprocessing.ts` is the single
source of truth for feature order. Training and inference both go through it, so
they cannot silently disagree about the layout.

| Group                  | Features                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| Price / volume (5)     | `intraday_range`, `overnight_gap`, `return_1d`, `return_5d`, `volume_ratio`                       |
| Availability (1)       | `lookback_available`                                                                              |
| Event one-hot (6)      | `event_earnings`, `event_ma`, `event_guidance`, `event_analyst`, `event_product`, `event_general` |
| Sentiment (2)          | `aspect_score`, `ml_score`                                                                        |
| Sentiment availability | `aspect_available`, `ml_available`                                                                |

The horizon is appended as one further feature at both training and inference,
giving `MODEL_CONFIG.inputDim`.

No absolute `open` / `high` / `low` / `close` / `volume` level appears, by design:
keeping same-day open and close lets a linear model reconstruct the same-day
return, and absolute levels are not comparable across a window in which the price
drifts. The raw OHLCV values are still carried on `DailyFeatures` because the
derived features are computed from them, and `mlSemantics.test.ts` enforces their
exclusion from the vector structurally rather than by comment.

The availability flags are load-bearing rather than cosmetic: `0` is a valid
neutral sentiment score, so without them a no-coverage day is indistinguishable
from a heavily covered but neutral one.

### Training

`backend/src/services/mlModel.ts` runs full-batch gradient descent on a
class-weighted binary cross-entropy objective. It is not Adam — there is no
momentum, no per-parameter scaling and no optimiser state.

Weight initialisation is seeded from the ticker (`hashStringToSeed`), not from
the clock, so retraining a ticker on the same data produces the same model. The
resulting direction is cached for 24 hours, so two trainings on the same data
must not disagree.

`trainModel` returns `trainingAccuracy`, named to make clear it is a fit
statistic and not a generalization estimate. It applies **no** accuracy gate.

### Validation and Suppression

`walkForwardValidate` runs an expanding-window CV per horizon on the
**unnormalized** matrix — the scaler is fitted inside each fold on that fold's
training slice, so no test-fold statistics leak into training. An embargo of
`h - 1` rows separates the training slice from the test slice, because two rows
whose label windows overlap share price movement.

`backend/src/services/pipeline.ts` holds the only accuracy gate in the pipeline.
A horizon is **suppressed** when its mean walk-forward accuracy falls below
`MIN_CV_ACCURACY`, or when it had too few rows to validate at all. A suppressed
horizon is absent from the response — not filled in with a placeholder. If no
horizon clears the floor, the pipeline returns nothing and the handler reports
insufficient data.

A figure the model cannot stand behind is withheld rather than rendered, so
seeing fewer than three horizons is normal rather than a fault. On a 90-day
history window the 30-day horizon is suppressed by arithmetic rather than by
luck: its embargo is 29 rows, so a fold needs 20 + 29 + 5 = 54 rows and that
window yields roughly 30.

### Model Cache

Trained weights, the scaler, and the per-horizon CV accuracies are stored at
`MODEL#{ticker}` / `WEIGHTS#d{days}` and reused for 24 hours. The training window
is part of the sort key, so a model trained on one window is never served for
another.

Three guards reject a cached model rather than serving it: it is older than the
cache TTL; its weight-vector length does not match `MODEL_CONFIG.inputDim`,
meaning the feature layout changed and the weights would misalign; or it carries
no per-horizon CV accuracies, meaning it predates the per-horizon gate.

Files: `backend/src/handlers/prediction.handler.ts`,
`backend/src/services/pipeline.ts`, `backend/src/services/featureEngineering.ts`,
`backend/src/services/preprocessing.ts`, `backend/src/services/mlModel.ts`,
`backend/src/types/prediction.types.ts`,
`frontend/src/components/sentiment/PredictionSummaryCard.tsx`,
`frontend/src/components/common/PredictionDisclaimer.tsx`

## Data Requirements

| Constant                   | Value   | Defined in                               | Reason                                                                |
| -------------------------- | ------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `MIN_SENTIMENT_DATA`       | 25 days | `frontend/src/constants/ml.constants.ts` | Below this the frontend does not spend a round trip asking to predict |
| `MIN_DAYS_FOR_PREDICTIONS` | 29 days | `backend/src/constants/ml.constants.ts`  | News-cache backfill target before predictions are worth attempting    |
| `MIN_CV_ACCURACY`          | 0.45    | `backend/src/services/pipeline.ts`       | Walk-forward CV floor a horizon must clear to be served               |
| `CV_DEFAULTS.minTrainSize` | 20 rows | `backend/src/services/mlModel.ts`        | Rows the first fold trains on after the embargo is deducted           |
| `CV_DEFAULTS.stepSize`     | 5 rows  | `backend/src/services/mlModel.ts`        | Fold step for the expanding window                                    |

## Sentiment Velocity

Frontend-computed rate of change in daily sentiment scores.

```text
Daily Sentiment Scores → velocityCalculator → useSentimentVelocity → SentimentVelocityIndicator
```

**Computation**:

1. Sort daily records by date ascending
2. Velocity: `score[i] - score[i-1]` for consecutive days
3. Acceleration: compare consecutive velocities (threshold ±0.01) → accelerating / decelerating / stable
4. Trend: latest velocity direction → improving / worsening / flat

Uses `avgSignalScore` with fallback to `sentimentNumber`. Requires 2 data points for velocity, 3 for acceleration.

Displayed as a color-coded pill on the sentiment screen and compact badge on portfolio cards.

Files: `frontend/src/utils/sentiment/velocityCalculator.ts`, `frontend/src/hooks/useSentimentVelocity.ts`, `frontend/src/components/sentiment/SentimentVelocityIndicator.tsx`

## Sector ETF Benchmarking

Compares stock performance against corresponding GICS sector SPDR ETF.

| Sector                 | ETF  |
| ---------------------- | ---- |
| Technology             | XLK  |
| Financial Services     | XLF  |
| Energy                 | XLE  |
| Healthcare             | XLV  |
| Industrials            | XLI  |
| Communication Services | XLC  |
| Consumer Cyclical      | XLY  |
| Consumer Defensive     | XLP  |
| Utilities              | XLU  |
| Real Estate            | XLRE |
| Basic Materials        | XLB  |

**Data flow**: yfinance `ticker.info['sector']` → Python metadata response (`sector`, `industry`, `sectorEtf` fields) → `useSymbolDetails` (from `useSymbolSearch.ts`) → `useSectorBenchmark` → `SectorBenchmarkCard`.

**Metrics**:

- Relative return: `stockReturn - sectorReturn` (% over period)
- Sentiment differential: `stockSentiment - sectorSentiment`

Sector data stored in SQLite `symbol_details` table (migration v6). ETFs flow through the same price/sentiment pipelines as regular stocks.

Files: `backend/python/constants/sector_etf_map.py`, `frontend/src/hooks/useSectorBenchmark.ts`, `frontend/src/components/sector/SectorBenchmarkCard.tsx`

## Earnings Calendar

Upcoming earnings dates fetched from yfinance with DynamoDB cache.

**Backend (Python)**:

- `GET /earnings?ticker=X` — cache-first, fetches from yfinance `ticker.calendar` on miss
- `POST /batch/earnings` — bulk fetch for portfolio
- Cache: `EARN#ticker` / `DATE#YYYY-MM-DD`, 24-hour TTL
- BMO/AMC determination from time component (before 12:00 = BMO, after = AMC)

**Frontend**:

- `useEarningsCalendar` hook with 30-minute stale time
- `EarningsBadge` on portfolio cards (shows within 7 days of earnings)
- `EarningsCard` on stock detail with date, timing, countdown, EPS/revenue estimates

Files: `backend/python/services/earnings_service.py`, `backend/python/handlers/earnings.py`, `backend/python/repositories/earnings_cache.py`, `frontend/src/hooks/useEarningsCalendar.ts`, `frontend/src/components/earnings/`

## Materiality Heatmap

Calendar grid on the portfolio page showing daily sentiment intensity with material event markers. Tapping a stock card expands an inline heatmap below it.

**Backend**: `GET /sentiment/daily-history` queries pre-aggregated `DAILY#` entities. Returns date, sentimentScore, materialEventCount, eventCounts. Paginated by 30-day chunks.

**Frontend**: 7-column calendar grid (Mon-Sun). Days colored by sentiment intensity (green=positive, red=negative, gray=neutral). Dot marker for material events. Backwards pagination via `useInfiniteQuery`.

Files: `frontend/src/hooks/useDailyHistory.ts`, `frontend/src/components/heatmap/`

## Additional Pro Features

The following features are available in [NewsInvestor Pro](https://github.com/HatmanStack/news-investor-pro):

- **Comparative Sentiment** — Stock sentiment percentile ranking vs sector ETF top 10 holdings
- **Email Reports** — Personalized HTML email digests via SES (on-demand + weekly scheduled)
- **Stock Notes** — Per-stock notes with cloud sync (DynamoDB primary, local SQLite fallback)
- **Prediction Track Record** — Immutable prediction snapshots with on-demand resolution and per-horizon accuracy tracking

## File Map

```text
frontend/src/
├── hooks/
│   ├── useSentimentData.ts            # Data gathering, alignment, prediction trigger
│   ├── useSentimentVelocity.ts        # Velocity from sentiment data
│   ├── useSectorBenchmark.ts          # Stock vs sector ETF comparison
│   ├── useEarningsCalendar.ts         # Upcoming earnings dates
│   └── useDailyHistory.ts            # Paginated daily sentiment for heatmap
├── utils/sentiment/
│   └── velocityCalculator.ts          # Sentiment rate of change computation
├── components/
│   ├── sentiment/
│   │   └── SentimentVelocityIndicator.tsx  # Velocity pill/badge
│   ├── sector/
│   │   └── SectorBenchmarkCard.tsx    # Relative performance card
│   ├── earnings/
│   │   ├── EarningsBadge.tsx          # Portfolio card badge (< 7 days)
│   │   └── EarningsCard.tsx           # Full earnings detail card
│   └── heatmap/
│       ├── MaterialityHeatmap.tsx     # Calendar grid with sentiment colors
│       ├── HeatmapCell.tsx            # Individual day cell with color/dot
│       └── HeatmapLegend.tsx          # Color band legend
├── services/api/backendClient.ts      # Shared axios client
├── ml/prediction/
│   └── types.ts                       # Diagnostics view types only — no browser model
└── ml/sentiment/
    ├── analyzer.ts                    # Browser-side AFINN sentiment (offline)
    └── lexicon.ts                     # Financial domain terms

backend/src/
├── handlers/prediction.handler.ts     # POST /predict — the only predictor
├── services/
│   ├── sentimentProcessing.service.ts # Article pipeline orchestration
│   ├── eventClassification.service.ts # Event type classifier
│   ├── aspectAnalysis.service.ts      # Aspect detection + scoring
│   ├── mlSentiment.service.ts         # External ML model API client
│   ├── signalScore.service.ts         # Reliability weight calculation
│   ├── pipeline.ts                    # Prediction pipeline: cache, CV gate, suppression
│   ├── featureEngineering.ts          # Daily aggregation + forward-looking per-horizon labels
│   ├── preprocessing.ts               # Feature vector, training matrix, scaler
│   └── mlModel.ts                     # Logistic regression + walk-forward CV
├── utils/sentiment.util.ts            # Daily aggregation (signal-weighted)
└── ml/sentiment/analyzer.ts           # AFINN + financial lexicon (server-side)

backend/python/
├── handlers/
│   ├── earnings.py                    # GET /earnings, POST /batch/earnings
│   └── etf_holdings.py               # GET /etf-holdings
├── services/
│   ├── earnings_service.py            # yfinance calendar fetch + parsing
│   └── etf_holdings_service.py        # ETF holdings with 3-level cache fallback
├── repositories/earnings_cache.py     # EARN# DynamoDB cache (24h TTL)
├── constants/
│   ├── sector_etf_map.py              # GICS sector to SPDR ETF mapping
│   └── etf_holdings.py               # Static top 10 ETF holdings fallback
└── utils/transform.py                 # Metadata enrichment (sector, industry, sectorEtf)

backend/services/ml/
└── model_onnx.py                      # DistilRoBERTa inference + calibration
```

---

_Some features are available exclusively in [NewsInvestor Pro](https://github.com/HatmanStack/news-investor-pro)._
