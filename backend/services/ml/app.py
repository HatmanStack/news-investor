"""
FastAPI Application for Financial Sentiment Analysis

Provides HTTP endpoints for sentiment analysis using ONNX Runtime:
- POST /sentiment - Analyze single text
- POST /sentiment/batch - Analyze multiple texts (up to 10)
- GET /health - Health check endpoint

Model: DistilRoBERTa fine-tuned on financial news sentiment
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from typing import List
import logging

from model_onnx import analyze_sentiment, get_model_info

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Financial Sentiment Analysis API",
    description="Financial sentiment analysis using DistilRoBERTa + ONNX Runtime",
    version="2.0.0"
)

# Configure CORS (adjust origins for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict to specific frontend domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response Models

class SentimentRequest(BaseModel):
    """Request model for single sentiment analysis"""
    text: str = Field(..., min_length=1, max_length=10000, description="Text to analyze")

    @field_validator('text')
    @classmethod
    def text_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Text cannot be empty or whitespace only')
        return v


class SentimentResponse(BaseModel):
    """Response model for sentiment analysis"""
    sentiment: float = Field(..., ge=-1, le=1, description="Sentiment score from -1 (negative) to +1 (positive)")
    confidence: float = Field(..., ge=0, le=1, description="Confidence score from 0 to 1")
    label: str = Field(..., description="Classification label: positive, negative, or neutral")
    probabilities: dict = Field(..., description="Probability distribution over classes")


class BatchSentimentRequest(BaseModel):
    """Request model for batch sentiment analysis"""
    texts: List[str] = Field(..., min_items=1, max_items=10, description="List of texts to analyze (max 10)")

    @field_validator('texts')
    @classmethod
    def texts_not_empty(cls, v):
        for text in v:
            if not text or not text.strip():
                raise ValueError('All texts must be non-empty')
        return v


class BatchSentimentResponse(BaseModel):
    """Response model for batch sentiment analysis"""
    results: List[SentimentResponse]
    count: int


class HealthResponse(BaseModel):
    """Response model for health check"""
    status: str
    model_loaded: bool
    model_info: dict


# API Endpoints

@app.post("/sentiment", response_model=SentimentResponse, tags=["Sentiment Analysis"])
async def analyze_text_sentiment(request: SentimentRequest):
    """
    Analyze sentiment of financial text.

    Returns sentiment score from -1 (very negative) to +1 (very positive),
    along with confidence and probability distribution.

    Example:
        ```
        POST /sentiment
        {
            "text": "Apple reports record quarterly earnings, beating analyst estimates"
        }

        Response:
        {
            "sentiment": 0.85,
            "confidence": 0.92,
            "label": "positive",
            "probabilities": {
                "negative": 0.03,
                "neutral": 0.05,
                "positive": 0.92
            }
        }
        ```
    """
    try:
        logger.info(f"Analyzing sentiment for text (length: {len(request.text)})")
        result = analyze_sentiment(request.text)
        logger.info(f"Analysis complete: {result['label']} (score: {result['sentiment']})")
        return SentimentResponse(**result)

    except ValueError as error:
        logger.warning(f"Validation error: {error}")
        raise HTTPException(status_code=400, detail=str(error))

    except Exception as error:
        logger.error(f"Sentiment analysis failed: {error}")
        raise HTTPException(status_code=500, detail="Internal server error during sentiment analysis")


@app.post("/sentiment/batch", response_model=BatchSentimentResponse, tags=["Sentiment Analysis"])
async def analyze_batch_sentiment(request: BatchSentimentRequest):
    """
    Analyze sentiment for multiple texts in batch (max 10 texts).

    Processes texts sequentially (no true parallelism in Lambda).
    For large batches, consider making multiple requests.

    Example:
        ```
        POST /sentiment/batch
        {
            "texts": [
                "Earnings beat expectations",
                "Stock price drops on guidance miss"
            ]
        }

        Response:
        {
            "results": [
                {"sentiment": 0.75, "confidence": 0.88, ...},
                {"sentiment": -0.65, "confidence": 0.82, ...}
            ],
            "count": 2
        }
        ```
    """
    try:
        logger.info(f"Analyzing batch of {len(request.texts)} texts")

        results = []
        for i, text in enumerate(request.texts):
            logger.info(f"Processing text {i+1}/{len(request.texts)}")
            result = analyze_sentiment(text)
            results.append(SentimentResponse(**result))

        logger.info(f"Batch analysis complete: {len(results)} texts processed")

        return BatchSentimentResponse(
            results=results,
            count=len(results)
        )

    except ValueError as error:
        logger.warning(f"Validation error: {error}")
        raise HTTPException(status_code=400, detail=str(error))

    except Exception as error:
        logger.error(f"Batch sentiment analysis failed: {error}")
        raise HTTPException(status_code=500, detail="Internal server error during batch analysis")


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """
    Health check endpoint.

    Returns service status and model information.
    Useful for monitoring and verifying deployment.

    Example:
        ```
        GET /health

        Response:
        {
            "status": "healthy",
            "model_loaded": true,
            "model_info": {
                "model_name": "ProsusAI/finbert",
                "cache_dir": "/tmp/models",
                "max_length": "512",
                "device": "cpu",
                "loaded": "true"
            }
        }
        ```
    """
    try:
        model_info = get_model_info()
        model_loaded = model_info['loaded']

        return HealthResponse(
            status="healthy",
            model_loaded=model_loaded,
            model_info=model_info
        )

    except Exception as error:
        logger.error(f"Health check failed: {error}")
        raise HTTPException(status_code=500, detail="Health check failed")


@app.get("/", tags=["Info"])
async def root():
    """
    Root endpoint with API information.
    """
    return {
        "service": "Financial Sentiment Analysis (ONNX)",
        "version": "2.0.0",
        "model": "distilroberta-finetuned-financial-news-sentiment-analysis",
        "endpoints": {
            "sentiment": "POST /sentiment",
            "batch": "POST /sentiment/batch",
            "health": "GET /health"
        },
        "docs": "/docs"
    }


# Error handlers

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """
    Global exception handler for uncaught errors.
    """
    logger.error(f"Unhandled exception: {exc}")
    return HTTPException(status_code=500, detail="Internal server error")
