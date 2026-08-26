# Backend API Reference

## Endpoints

All endpoints served via API Gateway v2 (HTTP API). Base URL stored in `frontend/.env` as `EXPO_PUBLIC_BACKEND_URL`.

### Python Lambda (yfinance)

| Method | Path              | Description                          |
| ------ | ----------------- | ------------------------------------ |
| GET    | `/stocks`         | Historical OHLCV price data          |
| GET    | `/search`         | Symbol search                        |
| GET    | `/earnings`       | Upcoming earnings dates              |
| GET    | `/etf-holdings`   | Top 10 ETF holdings                  |
| POST   | `/batch/stocks`   | Bulk price data for multiple tickers |
| POST   | `/batch/earnings` | Bulk earnings for multiple tickers   |

**GET /stocks** query params: `ticker`, `startDate`, `endDate`

**GET /search** query params: `query`

**GET /earnings** query params: `ticker` — Returns upcoming earnings date, BMO/AMC timing, EPS/revenue estimates. Cache-first with 24-hour DynamoDB TTL.

**POST /batch/earnings** body: `{ tickers: ["AAPL", "MSFT"] }` — Bulk fetch for portfolio.

**GET /etf-holdings** query params: `etf` — Returns top 10 holdings for a SPDR sector ETF. Three-level fallback: DynamoDB cache (7-day TTL) → yfinance → static map.

### Node.js Lambda (Finnhub + Sentiment)

| Method | Path                       | Description                            |
| ------ | -------------------------- | -------------------------------------- |
| GET    | `/news`                    | Financial news articles                |
| POST   | `/sentiment`               | Trigger sentiment analysis job         |
| GET    | `/sentiment`               | Get cached sentiment results           |
| GET    | `/sentiment/job/{jobId}`   | Poll job status                        |
| GET    | `/sentiment/articles`      | Get analyzed articles                  |
| POST   | `/predict`                 | Server-side prediction — the only one  |
| POST   | `/batch/news`              | Bulk news for multiple tickers         |
| POST   | `/batch/sentiment`         | Bulk sentiment for multiple tickers    |
| GET    | `/sentiment/daily-history` | Daily sentiment aggregates for heatmap |

All endpoints are public. No authentication required. Every response body is wrapped in a `data` envelope: `successResponse` (`backend/src/utils/response.util.ts`) and the Python `success_response` (`backend/python/utils/response.py`) both emit `{ "data": ... }` unconditionally.

**GET /sentiment/daily-history** query params: `ticker`, `startDate`, `endDate` — Returns pre-aggregated daily sentiment data. Reads `DAILY#` entities directly. Response includes date, sentimentScore, materialEventCount, eventCounts, avgSignalScore.

Additional endpoints for peer and sector sentiment, email reports, stock notes, prediction track record, watchlist sync, chart annotations, alerts, social sentiment, portfolio risk and export, and user tiers are available in [NewsInvestor Pro](https://github.com/HatmanStack/news-investor-pro).

### Sentiment Job Flow

```text
1. POST /sentiment {ticker, startDate, endDate}
   → Returns {jobId, status: "PENDING"}

2. GET /sentiment/job/{jobId}
   → Returns {status: "IN_PROGRESS"|"COMPLETED"|"FAILED", progress}

3. GET /sentiment?ticker=X&startDate=Y&endDate=Z
   → Returns aggregated daily sentiment array
```

## DynamoDB Table

Single-table design with composite keys. PAY_PER_REQUEST billing.

Table name: `${StackName}-Table`

| Entity           | PK                       | SK                    | TTL       | Purpose                    |
| ---------------- | ------------------------ | --------------------- | --------- | -------------------------- |
| Stock Cache      | `STOCK#ticker`           | `DATE#YYYY-MM-DD`     | 7-90 days | Price data cache           |
| News Cache       | `NEWS#ticker`            | `HASH#articleHash`    | 7 days    | News article cache         |
| Sentiment Cache  | `SENT#ticker`            | `HASH#articleHash`    | 30 days   | Per-article sentiment      |
| Sentiment Job    | `JOB#jobId`              | `META`                | 1 day     | Async job tracking         |
| Historical Data  | `HIST#ticker`            | `DATE#YYYY-MM-DD`     | None      | ML training data           |
| Article Analysis | `ARTICLE#ticker`         | `HASH#hash#DATE#date` | None      | Article analysis           |
| Daily Aggregate  | `DAILY#ticker`           | `DATE#YYYY-MM-DD`     | None      | Aggregated signals         |
| Circuit Breaker  | `CIRCUIT#service`        | `STATE`               | None      | ML service health          |
| Model Cache      | `MODEL#ticker`           | `WEIGHTS#d{days}`     | None      | Trained model weights      |
| Publisher Stats  | `PUBLISHER_STATS#{name}` | `META`                | None      | Publisher accuracy tallies |
| Publisher Score  | `PUBLISHER#{name}`       | `RELIABILITY`         | None      | Dynamic reliability score  |
| Earnings Cache   | `EARN#ticker`            | `DATE#YYYY-MM-DD`     | 24 hours  | Earnings calendar cache    |

### Sentiment Cache Item Schema

```typescript
{
  pk: string,                  // SENT#ticker
  sk: string,                  // HASH#articleHash
  entityType: 'SENTIMENT',
  ticker: string,
  articleHash: string,
  headline: string,
  summary: string,
  publishedAt: string,
  eventType?: string,          // EARNINGS|M&A|GUIDANCE|ANALYST_RATING|PRODUCT_LAUNCH|GENERAL
  eventConfidence?: number,
  aspectScore?: number,        // -1 to +1
  mlScore?: number,            // -1 to +1 (null for non-material)
  signalScore?: number,        // 0 to 1 (reliability weight)
  positive?: number,           // Legacy field, superseded by aspectScore/mlScore
  negative?: number,           // Legacy field
  neutral?: number,            // Legacy field
  ttl?: number,                // DynamoDB TTL, optional on BaseTableItem
  createdAt: string,
  updatedAt: string
}
```

## Environment Variables

### Backend (Lambda)

| Variable              | Required | Source                                                                                                                                                                                                       |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FINNHUB_API_KEY       | Yes      | Finnhub API                                                                                                                                                                                                  |
| EODHD_API_KEY         | No       | EODHD API token. When set, news fetching uses EODHD full article bodies instead of Finnhub summaries; empty keeps Finnhub                                                                                    |
| ALPHA_VANTAGE_API_KEY | No       | Alpha Vantage API                                                                                                                                                                                            |
| DISTILFINBERT_API_URL | No       | ML sentiment endpoint                                                                                                                                                                                        |
| ALLOWED_ORIGINS       | No       | CORS origins (default: \*). A comma-separated production list must name every origin that calls the API; a malformed list fails **closed** — `response.util.ts` omits the header rather than widening to `*` |
| ML_SENTIMENT_API_URL  | No       | Primary ML sentiment API endpoint (falls back to `DISTILFINBERT_API_URL`)                                                                                                                                    |
| LOG_LEVEL             | No       | Logging verbosity: debug, info, warn, error (default: info)                                                                                                                                                  |
| DYNAMODB_TABLE_NAME   | Yes\*    | DynamoDB table name (\*set automatically by SAM template)                                                                                                                                                    |
| DYNAMODB_ENDPOINT     | No       | DynamoDB endpoint override (e.g., `http://localhost:4566` for MiniStack)                                                                                                                                     |
| SENTIMENT_QUEUE_URL   | Yes\*    | SQS queue URL for async sentiment jobs (\*set automatically by SAM)                                                                                                                                          |
| AWS_REGION            | No       | AWS region for DynamoDB client (default: us-east-1)                                                                                                                                                          |

### Frontend

| Variable                         | Required | Source                                                                           |
| -------------------------------- | -------- | -------------------------------------------------------------------------------- |
| EXPO_PUBLIC_BACKEND_URL          | Yes      | API Gateway URL (set by deploy)                                                  |
| EXPO_PUBLIC_BROWSER_SENTIMENT    | No       | Enable browser sentiment                                                         |
| EXPO_PUBLIC_USE_LAMBDA_SENTIMENT | No       | Use Lambda for sentiment                                                         |
| EXPO_PUBLIC_LOG_LEVEL            | No       | Log verbosity: error, warn, info, debug (default: warn in prod, debug otherwise) |

## Monitoring

CloudWatch metrics under `ReactStocks` namespace. Emitted via EMF from both Node.js and Python Lambdas.

### Request Metrics

| Metric          | Unit         | Dimensions                   |
| --------------- | ------------ | ---------------------------- |
| RequestDuration | Milliseconds | Endpoint, StatusCode, Cached |
| RequestCount    | Count        | Endpoint, StatusCode, Cached |
| RequestSuccess  | Count        | Endpoint, StatusCode, Cached |
| RequestError    | Count        | Endpoint, StatusCode, Cached |

### Lambda Lifecycle

| Metric          | Unit  | Dimensions |
| --------------- | ----- | ---------- |
| LambdaColdStart | Count | Endpoint   |
| LambdaWarmStart | Count | Endpoint   |

### ML Sentiment Service (Node.js only)

| Metric                  | Unit         | Dimensions                         |
| ----------------------- | ------------ | ---------------------------------- |
| MlSentimentCalls        | Count        | Ticker, Success, CacheHit, Service |
| MlSentimentDuration     | Milliseconds | Ticker, Success, CacheHit, Service |
| MlSentimentCacheHits    | Count        | Ticker, Service                    |
| MlSentimentCacheMisses  | Count        | Ticker, Service                    |
| MlSentimentCacheHitRate | Percent      | Ticker, Service                    |
| MlSentimentFallbacks    | Count        | Ticker, Service, FallbackReason    |
| MlSentimentFallbackRate | Percent      | Ticker, Service, FallbackReason    |

Source: `backend/src/utils/metrics.util.ts`, `backend/python/utils/metrics.py`

---

_Some features described here are available exclusively in [NewsInvestor Pro](https://github.com/HatmanStack/news-investor-pro)._
