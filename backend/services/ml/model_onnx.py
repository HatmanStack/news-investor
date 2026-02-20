"""
ONNX Model Loading and Inference Module

Loads DistilRoBERTa financial sentiment model from S3 and runs inference
using ONNX Runtime. Designed for AWS Lambda with minimal cold start.
"""

import os
import logging
import tempfile
from typing import Dict, Optional
from pathlib import Path

import boto3
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global cache (survives Lambda warm starts)
_session: Optional[ort.InferenceSession] = None
_tokenizer: Optional[Tokenizer] = None

# Configuration
S3_BUCKET = os.getenv("ML_MODEL_BUCKET", "react-stocks-ml-models")
ONNX_MODEL_KEY = os.getenv("ONNX_MODEL_KEY", "models/distilroberta-financial.onnx")
TOKENIZER_KEY = os.getenv("TOKENIZER_KEY", "models/tokenizer/tokenizer.json")
MAX_LENGTH = 512
LABELS = ["negative", "neutral", "positive"]


def _download_from_s3(bucket: str, key: str, local_path: Path) -> None:
    """Download file from S3 to local path."""
    logger.info(f"Downloading s3://{bucket}/{key} to {local_path}")
    s3 = boto3.client("s3")
    local_path.parent.mkdir(parents=True, exist_ok=True)
    s3.download_file(bucket, key, str(local_path))
    logger.info(f"Downloaded {local_path.stat().st_size / 1024 / 1024:.1f} MB")


def load_model() -> tuple[ort.InferenceSession, Tokenizer]:
    """
    Load ONNX model and tokenizer from S3.

    Downloads on first call, uses cache on subsequent calls.
    Files are stored in /tmp for Lambda compatibility.

    Returns:
        Tuple of (ONNX session, tokenizer)
    """
    global _session, _tokenizer

    if _session is not None and _tokenizer is not None:
        logger.info("Using cached model and tokenizer")
        return _session, _tokenizer

    try:
        cache_dir = Path(tempfile.gettempdir()) / "ml_models"
        onnx_path = cache_dir / "model.onnx"
        tokenizer_path = cache_dir / "tokenizer.json"

        # Download model if not cached
        if not onnx_path.exists():
            _download_from_s3(S3_BUCKET, ONNX_MODEL_KEY, onnx_path)

        # Download tokenizer if not cached
        if not tokenizer_path.exists():
            _download_from_s3(S3_BUCKET, TOKENIZER_KEY, tokenizer_path)

        # Load ONNX session
        logger.info("Loading ONNX Runtime session...")
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.intra_op_num_threads = 2  # Lambda has limited CPUs
        _session = ort.InferenceSession(str(onnx_path), sess_options)

        # Load tokenizer
        logger.info("Loading tokenizer...")
        _tokenizer = Tokenizer.from_file(str(tokenizer_path))
        _tokenizer.enable_padding(length=MAX_LENGTH)
        _tokenizer.enable_truncation(max_length=MAX_LENGTH)

        logger.info("Model loaded successfully")
        return _session, _tokenizer

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        raise RuntimeError(f"Model loading failed: {e}")


def analyze_sentiment(text: str) -> Dict:
    """
    Analyze sentiment of financial text.

    Args:
        text: Financial news text to analyze

    Returns:
        Dictionary with:
        - sentiment: Score from -1 (negative) to +1 (positive)
        - confidence: Max probability (0 to 1)
        - label: Classification label (positive/negative/neutral)
        - probabilities: Dict of {negative, neutral, positive} probabilities
    """
    if not text or not text.strip():
        raise ValueError("Text cannot be empty")

    session, tokenizer = load_model()

    # Tokenize
    encoded = tokenizer.encode(text)
    input_ids = np.array([encoded.ids], dtype=np.int64)
    attention_mask = np.array([encoded.attention_mask], dtype=np.int64)

    # Run inference
    outputs = session.run(
        None,
        {"input_ids": input_ids, "attention_mask": attention_mask}
    )

    # Softmax
    logits = outputs[0][0]
    exp_logits = np.exp(logits - np.max(logits))  # Numerical stability
    probs = exp_logits / np.sum(exp_logits)

    neg_prob, neut_prob, pos_prob = probs
    raw_score = float(pos_prob - neg_prob)

    # Neutral dampening: if model shows neutral hesitation, reduce directional score
    NEUTRAL_THRESHOLD = 0.003
    NEUTRAL_SCALE = 200
    NEUTRAL_CAP = 0.9
    if neut_prob >= NEUTRAL_THRESHOLD:
        dampen = min((neut_prob - NEUTRAL_THRESHOLD) * NEUTRAL_SCALE, NEUTRAL_CAP)
        dampened_score = raw_score * (1 - dampen)
    else:
        dampened_score = raw_score

    # Temperature scaling: spread scores away from ±1 via logit-space transform
    TEMPERATURE = 3.0
    clamped = np.clip(dampened_score, -0.9999, 0.9999)
    sentiment_score = float(np.tanh(np.arctanh(clamped) / TEMPERATURE))

    confidence = float(np.max(probs))
    label = LABELS[int(np.argmax(probs))]

    return {
        "sentiment": round(sentiment_score, 4),
        "confidence": round(confidence, 4),
        "label": label,
        "probabilities": {
            "negative": round(float(neg_prob), 4),
            "neutral": round(float(neut_prob), 4),
            "positive": round(float(pos_prob), 4)
        }
    }


def get_model_info() -> Dict[str, str]:
    """Get information about the model configuration."""
    return {
        "model_type": "onnx",
        "model_name": "distilroberta-finetuned-financial-news-sentiment-analysis",
        "s3_bucket": S3_BUCKET,
        "onnx_key": ONNX_MODEL_KEY,
        "max_length": str(MAX_LENGTH),
        "loaded": _session is not None
    }
