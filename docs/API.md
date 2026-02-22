# Backend API Reference

## Endpoints

All endpoints served via API Gateway v2 (HTTP API). Base URL stored in `frontend/.env` as `EXPO_PUBLIC_BACKEND_URL`.

### Python Lambda (yfinance)

| Method | Path              | Description                          |
| ------ | ----------------- | ------------------------------------ |
| GET    | `/stocks`         | Historical OHLCV price data          |
| GET    | `/search`         | Symbol search                        |
| GET    | `/earnings`       | Upcoming earnings dates              |
| POST   | `/batch/stocks`   | Bulk price data for multiple tickers |
| POST   | `/batch/earnings` | Bulk earnings for multiple tickers   |

**GET /stocks** query params: `ticker`, `startDate`, `endDate`

**GET /search** query params: `query`

**GET /earnings** query params: `ticker` — Returns upcoming earnings date, BMO/AMC timing, EPS/revenue estimates. Cache-first with 24-hour DynamoDB TTL.

**POST /batch/earnings** body: `{ tickers: ["AAPL", "MSFT"] }` — Bulk fetch for portfolio.

### Node.js Lambda (Finnhub + Sentiment)

| Method | Path                     | Description                         |
| ------ | ------------------------ | ----------------------------------- |
| GET    | `/news`                  | Financial news articles             |
| POST   | `/sentiment`             | Trigger sentiment analysis job      |
| GET    | `/sentiment`             | Get cached sentiment results        |
| GET    | `/sentiment/job/{jobId}` | Poll job status                     |
| GET    | `/sentiment/articles`    | Get analyzed articles               |
| POST   | `/predict`               | Server-side prediction (legacy)     |
| POST   | `/batch/news`            | Bulk news for multiple tickers      |
| POST   | `/batch/sentiment`       | Bulk sentiment for multiple tickers |

All endpoints are public. No authentication required.

Additional endpoints for stock notes, prediction track record, and user tiers are available in [NewsInvestor Pro](https://github.com/HatmanStack/news-investor-pro).

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

| Entity           | PK                | SK                    | TTL       | Purpose                 |
| ---------------- | ----------------- | --------------------- | --------- | ----------------------- |
| Stock Cache      | `STOCK#ticker`    | `DATE#YYYY-MM-DD`     | 7-90 days | Price data cache        |
| News Cache       | `NEWS#ticker`     | `HASH#articleHash`    | 7 days    | News article cache      |
| Sentiment Cache  | `SENT#ticker`     | `HASH#articleHash`    | 30 days   | Per-article sentiment   |
| Sentiment Job    | `JOB#jobId`       | `META`                | 1 day     | Async job tracking      |
| Historical Data  | `HIST#ticker`     | `DATE#YYYY-MM-DD`     | None      | ML training data        |
| Article Analysis | `ARTICLE#ticker`  | `HASH#hash#DATE#date` | None      | Article analysis        |
| Daily Aggregate  | `DAILY#ticker`    | `DATE#YYYY-MM-DD`     | None      | Aggregated signals      |
| Circuit Breaker  | `CIRCUIT#service` | `STATE`               | None      | ML service health       |
| Earnings Cache   | `EARN#ticker`     | `DATE#YYYY-MM-DD`     | 24 hours  | Earnings calendar cache |

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
  ttl: number,                 // DynamoDB TTL
  createdAt: string,
  updatedAt: string
}
```

## Environment Variables

### Backend (Lambda)

| Variable              | Required | Source                     |
| --------------------- | -------- | -------------------------- |
| FINNHUB_API_KEY       | Yes      | Finnhub API                |
| ALPHA_VANTAGE_API_KEY | No       | Alpha Vantage API          |
| DISTILFINBERT_API_URL | No       | ML sentiment endpoint      |
| ALLOWED_ORIGINS       | No       | CORS origins (default: \*) |

### Frontend

| Variable                         | Required | Source                          |
| -------------------------------- | -------- | ------------------------------- |
| EXPO_PUBLIC_BACKEND_URL          | Yes      | API Gateway URL (set by deploy) |
| EXPO_PUBLIC_BROWSER_SENTIMENT    | No       | Enable browser sentiment        |
| EXPO_PUBLIC_BROWSER_PREDICTION   | No       | Enable browser predictions      |
| EXPO_PUBLIC_USE_LAMBDA_SENTIMENT | No       | Use Lambda for sentiment        |

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
