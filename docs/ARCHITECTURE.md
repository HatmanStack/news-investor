# System Architecture

## Overview

Browser-based ensemble prediction model fed by a three-signal sentiment pipeline.

```text
Backend (Lambda)                          Frontend (Browser)
┌──────────────────────────┐              ┌─────────────────────────────┐
│ Article Processing:      │              │ useSentimentData()          │
│  1. Event Classification │──DynamoDB──▶ │  ├─ Fetch & align data      │
│  2. Signal Score         │   cache      │  ├─ Extract 3 signals       │
│  3. Aspect Analysis      │              │  └─ Call prediction engine  │
│  4. ML Sentiment (API)   │              │                             │
│  5. Daily Aggregation    │              │ generateBrowserPredictions()│
└──────────────────────────┘              │  ├─ Build feature matrices  │
                                          │  ├─ Train logistic reg + CV │
                                          │  ├─ Ensemble blend          │
                                          │  └─ Return predictions      │
                                          └─────────────────────────────┘
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

## Prediction Model (Frontend)

### Ensemble Architecture

| Horizon         | Model                      | Features | Min Data               | Strategy                       |
| --------------- | -------------------------- | -------- | ---------------------- | ------------------------------ |
| NEXT (1 day)    | Full + Price-only ensemble | 8 + 4    | 25 labels              | Blend by sentimentAvailability |
| WEEK (10 days)  | Price-only                 | 4        | 10 independent samples | Subsampled every 10th          |
| MONTH (21 days) | Price-only                 | 4        | 10 independent samples | Subsampled every 21st          |

WEEK/MONTH use price-only because too few independent samples exist for sentiment features (overfit risk).

### Feature Matrices

**Full model (8 features):**

| Index | Feature                | Source                            |
| ----- | ---------------------- | --------------------------------- |
| 0     | price_ratio_5d         | close[i] / close[i-5]             |
| 1     | price_ratio_10d        | close[i] / close[i-10]            |
| 2     | volume                 | Normalized volume                 |
| 3     | event_impact           | Ordinal 0-1 from event type       |
| 4     | aspect_score           | Daily avg aspect score            |
| 5     | ml_score               | Daily avg ML score (0 if null)    |
| 6     | sentiment_availability | % of days with ML data            |
| 7     | volatility             | Rolling 10-day std dev of returns |

**Price-only model (4 features):**

| Index | Feature         |
| ----- | --------------- |
| 0     | price_ratio_5d  |
| 1     | price_ratio_10d |
| 2     | volume          |
| 3     | volatility      |

File: `frontend/src/ml/prediction/preprocessing.ts`

### Labels (Abnormal Returns)

Binary labels based on trend-relative performance, not raw direction:

```text
For each day i (starting from TREND_WINDOW=20):
  expectedReturn = avgDailyReturn(trailing 20 days) * horizon
  actualReturn = (close[i+horizon] - close[i]) / close[i]
  label = 1 if actualReturn < expectedReturn else 0
```

- 0 = outperformed recent trend
- 1 = underperformed recent trend

### Logistic Regression

Custom implementation matching scikit-learn behavior.

| Parameter          | Value                                       |
| ------------------ | ------------------------------------------- |
| Max iterations     | 2000                                        |
| Learning rate      | 0.005                                       |
| Regularization (C) | 1.0                                         |
| Class weight       | balanced                                    |
| Sample weights     | Exponential decay (halfLife = max(10, n/4)) |
| Cross-validation   | k-fold, k = min(8, len(y))                  |

File: `frontend/src/ml/prediction/model.ts`

### Ensemble Blend (NEXT Horizon)

```text
prediction = fullModel * sentimentAvailability + priceModel * (1 - sentimentAvailability)
```

`sentimentAvailability` = fraction of days where `mlScore !== null` (0 to 1).
When no ML data exists, price-only model gets 100% weight.

### F-Test Diagnostics

ANOVA F-statistics logged for each feature vs binary labels (NEXT horizon only).
Handles edge cases: `msw=0 && msb>0` → F=Infinity, p=0 (perfect separation).

File: `frontend/src/ml/prediction/prediction.service.ts`

## Data Requirements

| Constant                | Value   | Reason                                         |
| ----------------------- | ------- | ---------------------------------------------- |
| MIN_STOCK_DATA          | 46 days | TREND_WINDOW(20) + horizon(1) + MIN_LABELS(25) |
| MIN_SENTIMENT_DATA      | 25 days | Minimum for model training                     |
| MIN_LABELS_NEXT         | 25      | Minimum label count for 1-day horizon          |
| MIN_INDEPENDENT_SAMPLES | 10      | For WEEK/MONTH subsampled horizons             |
| TREND_WINDOW            | 20 days | Rolling baseline for abnormal return           |

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

**Data flow**: yfinance `ticker.info['sector']` → Python metadata response (`sector`, `industry`, `sectorEtf` fields) → `useSymbolDetails` → `useSectorBenchmark` → `SectorBenchmarkCard`.

**Metrics**:

- Relative return: `stockReturn - sectorReturn` (% over period)
- Sentiment differential: `stockSentiment - sectorSentiment`

Sector data stored in SQLite `symbol_details` table. ETFs flow through the same price/sentiment pipelines as regular stocks.

Files: `backend/python/constants/sector_etf_map.py`, `frontend/src/constants/sectorEtf.constants.ts`, `frontend/src/hooks/useSectorBenchmark.ts`, `frontend/src/components/sector/SectorBenchmarkCard.tsx`

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

- **Model Diagnostics** — ML prediction feature importance percentages per horizon
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
├── constants/sectorEtf.constants.ts   # GICS sector to SPDR ETF mapping
├── services/api/backendClient.ts      # Shared axios client
├── ml/prediction/
│   ├── prediction.service.ts          # Ensemble orchestration, F-test diagnostics
│   ├── preprocessing.ts               # Feature matrices (8-feat, 4-feat), labels
│   ├── model.ts                       # Logistic regression + gradient descent
│   ├── cross-validation.ts            # K-fold CV
│   ├── scaler.ts                      # StandardScaler (z-score normalization)
│   └── types.ts                       # PredictionInput, PredictionOutput, etc.
└── ml/sentiment/
    ├── analyzer.ts                    # Browser-side AFINN sentiment (offline)
    └── lexicon.ts                     # Financial domain terms

backend/src/
├── handlers/prediction.handler.ts     # Prediction endpoint
├── services/
│   ├── sentimentProcessing.service.ts # Article pipeline orchestration
│   ├── eventClassification.service.ts # Event type classifier
│   ├── aspectAnalysis.service.ts      # Aspect detection + scoring
│   ├── mlSentiment.service.ts         # External ML model API client
│   └── signalScore.service.ts         # Reliability weight calculation
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
