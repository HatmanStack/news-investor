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

## File Map

```text
frontend/src/
├── hooks/useSentimentData.ts          # Data gathering, alignment, prediction trigger
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
├── services/
│   ├── sentimentProcessing.service.ts # Article pipeline orchestration
│   ├── eventClassification.service.ts # Event type classifier
│   ├── aspectAnalysis.service.ts      # Aspect detection + scoring
│   ├── mlSentiment.service.ts         # External ML model API client
│   └── signalScore.service.ts         # Reliability weight calculation
├── utils/sentiment.util.ts            # Daily aggregation (signal-weighted)
└── ml/sentiment/analyzer.ts           # AFINN + financial lexicon (server-side)

backend/services/ml/
└── model_onnx.py                      # DistilRoBERTa inference + calibration
```

---

_Some features described here are available exclusively in [NewsInvestor Pro](https://github.com/HatmanStack/news-investor-pro)._
