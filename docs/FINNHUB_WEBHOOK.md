# Finnhub Webhook Ingestion

How `POST /webhooks/finnhub` works, what we believe Finnhub sends, and how to
confirm it once live deliveries start.

**Status: the payload schema below is an INFERENCE, not a verified contract.**
No live delivery has been observed. Everything in "Expected payload" is derived
from adjacent evidence, documented below so it can be checked rather than
trusted.

## Endpoint

|            |                                                         |
| ---------- | ------------------------------------------------------- |
| Route      | `POST /webhooks/finnhub`                                |
| Auth       | `X-Finnhub-Secret` header, constant-time compared       |
| Authorizer | **None** — Finnhub cannot present a Cognito JWT         |
| Handler    | `backend/src/handlers/finnhubWebhook.handler.ts`        |
| Secret     | `FINNHUB_WEBHOOK_SECRET` (template parameter, `NoEcho`) |

Registration is done in the [Finnhub dashboard](https://finnhub.io/dashboard/webhook),
not via the API — see "What we probed" below. The URL to register is printed at
the end of `scripts/deploy.sh`.

## Behaviour

Finnhub requires a 2xx **before** any real processing, and disables endpoints
that fail to acknowledge over consecutive days. So the handler does only:

1. Verify `X-Finnhub-Secret`.
2. Extract every ticker in the payload.
3. Create a job + enqueue to `SentimentQueue`.
4. Return 200.

All actual work happens in `SentimentWorkerFunction`. The SQS message reuses the
exact contract `POST /sentiment` already produces — `{ jobId, ticker, startDate,
endDate }` — so the worker required no changes.

### Status codes

These are deliberate, because the wrong choice gets the endpoint disabled:

| Situation                      | Code    | Why                                                                |
| ------------------------------ | ------- | ------------------------------------------------------------------ |
| Valid event                    | 200     | Normal path                                                        |
| Secret missing/wrong           | 401     | Fail loud — misconfiguration should be obvious                     |
| `FINNHUB_WEBHOOK_SECRET` unset | 503     | Fail closed; an open ingestion endpoint lets anyone inject tickers |
| Unparseable body               | **200** | Retrying a body that can never parse risks disablement             |
| No ticker found                | **200** | Same reasoning; payload preview logged (capped at 500 chars)       |
| SQS / DynamoDB failure         | 500     | Genuine transient fault — we _want_ the retry                      |

### Deduplication

Job ID is `TICKER_YYYY-MM-DD_YYYY-MM-DD` using today's UTC date, so the many
events Finnhub pushes per ticker per day collapse into one sentiment job.

**Known gap:** a completed job is not re-enqueued, so events arriving after that
day's job finishes are not reflected until tomorrow, and tickers with no news
events never get a job at all. The webhook narrows the scheduled end-of-day
sweep's job — it does not replace it.

## Expected payload (inferred)

Finnhub's `company-news` API items are shaped like this (verified live against
the REST API on 2026-07-25):

```json
{
  "category": "company",
  "datetime": 1785006500,
  "headline": "Apple (AAPL) Readies Foldable iPhone As Samsung Launches New Rival Phones",
  "id": 141018582,
  "image": "https://s.yimg.com/rz/stage/p/yahoo_finance_en-US_h_p_finance_2.png",
  "related": "AAPL",
  "source": "Yahoo",
  "summary": "Samsung has launched new foldable phones as Apple…",
  "url": "https://finnhub.io/api/news?id=…"
}
```

**The ticker lives in `related`, not `symbol`.** This is the single most
important detail — a handler that only looked for `symbol` would silently
extract nothing from every news delivery. `related` may be comma-separated
(`"AAPL,MSFT"`) when a story references several companies.

`extractTickers()` therefore reads the union of, in order:

`related`, `symbol`, `ticker`, `data.related`, `data.symbol`, `data.ticker`

splitting each on commas, validating through `validateTicker`, and deduping. A
job is enqueued per distinct valid ticker, so multi-company stories do not lose
data.

### Confidence

| Claim                                         | Confidence  | Basis                                                                                |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| News items use `related` for ticker           | **High**    | Observed live from `company-news`                                                    |
| `related` can be comma-separated              | Medium      | Finnhub docs describe it as a related-symbols field; not yet observed with multiples |
| Webhook wraps the item directly (no envelope) | **Low**     | Unverified — hence the `data.*` fallbacks                                            |
| Registration is dashboard-only                | Medium-High | Every API attempt failed; see below                                                  |

## What we probed (2026-07-25)

Against the live API with a free-tier key:

- `webhook/list` → `200 []`. Webhooks are **not** paywalled.
- `webhook/add` → `{"err":"event type not supported"}` for _every_ attempt:
  `earnings`, `news`, `press-release`, `pressRelease`, `filing`, `split`,
  `dividend`, `ipo`, `quote`, `trade`, `sentiment` — via both GET query params
  and POST JSON body, and with an empty body. Nothing was ever created
  (`webhook/list` stayed `[]`).

Conclusion: webhook registration is not driveable from the API on this key, so
the event-type enum could not be enumerated. Configure in the dashboard.

## Confirming the real schema

The handler logs payload **field names only** — never values:

```json
{
  "message": "Finnhub webhook received",
  "tickers": ["AAPL"],
  "payloadKeys": ["category", "datetime", "headline", "id", "related", "source", "summary", "url"]
}
```

This is deliberate. Logging whole payloads would push every article's headline
and summary through CloudWatch ingestion at $0.50/GB, which at S&P 500 volume
(~5,000 articles/day) would exceed the cost of the rest of the stack. The key
list is sufficient to confirm the envelope shape.

The ticker-less path additionally logs a payload preview capped at 500
characters, so a pathological body cannot become an unbounded bill. That path
should be rare — if it is not, the schema above is wrong.

After the first live deliveries:

```bash
aws logs filter-log-events \
  --region us-west-2 \
  --log-group-name /aws/lambda/news-investor-prod-api \
  --filter-pattern '"Finnhub webhook received"' \
  --max-items 20
```

Then:

1. Replace "Expected payload" above with the observed envelope.
2. Narrow `extractTickers()` to the real field(s) and drop the speculative
   `data.*` fallbacks.
3. Add a zod schema, matching `sentimentWorker.entry.ts`.
4. Once confirmed, drop the `payloadKeys` field from the success log entirely —
   it has no ongoing diagnostic value.

## Operational risk

Finnhub **disables endpoints that fail to acknowledge over consecutive days**,
and it does so silently — the first symptom is a gap in the training data,
noticed weeks later.

An alarm on 5xx for this route is required before relying on it as the primary
ingestion path. Not yet implemented.
