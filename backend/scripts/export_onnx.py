#!/usr/bin/env python3
"""
Export DistilRoBERTa financial sentiment model to ONNX format.

Run this script locally to create the ONNX model, then upload to S3.

Usage:
    python scripts/export_onnx.py

Output:
    models/distilroberta-financial.onnx
"""

import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from pathlib import Path

MODEL_NAME = "mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis"
OUTPUT_DIR = Path(__file__).parent.parent / "models"
ONNX_PATH = OUTPUT_DIR / "distilroberta-financial.onnx"


def export_to_onnx():
    print(f"Loading model: {MODEL_NAME}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
    model.eval()

    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Save tokenizer files (needed for inference)
    tokenizer.save_pretrained(OUTPUT_DIR / "tokenizer")
    print(f"Tokenizer saved to: {OUTPUT_DIR / 'tokenizer'}")

    # Create dummy input for ONNX export
    dummy_text = "Stock prices rose significantly today"
    inputs = tokenizer(
        dummy_text,
        return_tensors="pt",
        padding="max_length",
        truncation=True,
        max_length=512
    )

    # Export to ONNX (use dynamo=False to avoid external data files)
    print(f"Exporting to ONNX: {ONNX_PATH}")
    torch.onnx.export(
        model,
        (inputs["input_ids"], inputs["attention_mask"]),
        ONNX_PATH,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size"}
        },
        dynamo=False  # Use legacy exporter to keep weights in single file
    )

    # Get file size
    onnx_size_mb = ONNX_PATH.stat().st_size / 1024 / 1024
    print(f"ONNX model exported: {onnx_size_mb:.1f} MB")

    # Verify the model
    print("Verifying ONNX model...")
    import onnx
    onnx_model = onnx.load(str(ONNX_PATH))
    onnx.checker.check_model(onnx_model)
    print("ONNX model verification passed!")

    # Test inference with ONNX Runtime
    print("Testing ONNX Runtime inference...")
    import onnxruntime as ort
    session = ort.InferenceSession(str(ONNX_PATH))

    test_text = "Company reports record earnings, stock surges 15%"
    test_inputs = tokenizer(
        test_text,
        return_tensors="np",
        padding="max_length",
        truncation=True,
        max_length=512
    )

    outputs = session.run(
        None,
        {
            "input_ids": test_inputs["input_ids"],
            "attention_mask": test_inputs["attention_mask"]
        }
    )

    import numpy as np
    logits = outputs[0][0]
    probs = np.exp(logits) / np.sum(np.exp(logits))
    labels = ["negative", "neutral", "positive"]

    print(f"Test text: {test_text}")
    print(f"Predictions: {dict(zip(labels, probs.round(4)))}")
    print(f"Predicted: {labels[np.argmax(probs)]}")

    print("\n" + "="*50)
    print("Export complete!")
    print(f"ONNX model: {ONNX_PATH}")
    print(f"Tokenizer: {OUTPUT_DIR / 'tokenizer'}")
    print("="*50)
    print("\nNext steps:")
    print("1. Upload ONNX model to S3:")
    print(f"   aws s3 cp {ONNX_PATH} s3://YOUR_BUCKET/models/distilroberta-financial.onnx")
    print("2. Upload tokenizer files:")
    print(f"   aws s3 cp {OUTPUT_DIR / 'tokenizer'} s3://YOUR_BUCKET/models/tokenizer/ --recursive")


if __name__ == "__main__":
    export_to_onnx()
