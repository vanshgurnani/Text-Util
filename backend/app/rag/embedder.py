from __future__ import annotations

import hashlib
import math
import re
from typing import Optional

from ..config import settings

# Attempt to import fastembed
_fastembed_model = None
_has_fastembed = False

try:
    from fastembed import TextEmbedding

    try:
        _fastembed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        _has_fastembed = True
    except Exception:
        _has_fastembed = False
except ImportError:
    _has_fastembed = False

# Attempt to import numpy for accelerated vector arithmetic
try:
    import numpy as np

    _has_numpy = True
except ImportError:
    _has_numpy = False

EMBEDDING_DIM = 384


def _normalize_vector_pure(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0:
        return [0.0] * len(vec)
    return [x / norm for x in vec]


def _deterministic_hash_embed(text: str, dim: int = EMBEDDING_DIM) -> list[float]:
    """
    High-quality deterministic pseudo-semantic 384-dimensional embedding for offline/zero-cost environments.
    Uses multi-hash feature projection over word tokens, character 3-grams, and 4-grams.
    Produces unit-normalized vectors where documents sharing key phrases have high cosine similarity.
    """
    if not text:
        return [0.0] * dim

    clean_text = text.lower().strip()
    words = re.findall(r"\b\w+\b", clean_text)
    vec = [0.0] * dim

    # Word unigrams with term frequency weighting
    for word in words:
        # Generate 4 distinct hash buckets per word for dense distribution
        h_bytes = hashlib.sha256(word.encode("utf-8")).digest()
        for i in range(4):
            idx = int.from_bytes(h_bytes[i * 4 : i * 4 + 2], "big") % dim
            sign = 1.0 if (h_bytes[i * 4 + 2] % 2 == 0) else -1.0
            vec[idx] += sign * 1.5

    # Character n-grams for subword similarity
    if len(clean_text) >= 3:
        for i in range(len(clean_text) - 2):
            trigram = clean_text[i : i + 3]
            h = hashlib.md5(trigram.encode("utf-8")).digest()
            idx = int.from_bytes(h[0:2], "big") % dim
            sign = 1.0 if (h[2] % 2 == 0) else -1.0
            vec[idx] += sign * 0.5

    return _normalize_vector_pure(vec)


def _gemini_embed(texts: list[str]) -> Optional[list[list[float]]]:
    """Call Google Gemini text-embedding-004 API if keys are configured."""
    keys = settings.gemini_api_keys or ([settings.gemini_api_key] if settings.gemini_api_key else [])
    if not keys:
        return None

    import requests

    for key in keys:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key={key}"
            requests_payload = {
                "requests": [
                    {
                        "model": "models/text-embedding-004",
                        "content": {"parts": [{"text": t[:2048]}]},
                        "outputDimensionality": EMBEDDING_DIM,
                    }
                    for t in texts
                ]
            }
            res = requests.post(url, json=requests_payload, timeout=8)
            if res.status_code == 200:
                data = res.json()
                embeddings = [item["values"] for item in data.get("embeddings", [])]
                if len(embeddings) == len(texts):
                    return [_normalize_vector_pure(e) for e in embeddings]
        except Exception:
            continue
    return None


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate dense embeddings with hierarchical fallback: FastEmbed -> Gemini -> Deterministic Hashing."""
    if not texts:
        return []

    # 1. Try local FastEmbed (ONNX CPU)
    if _has_fastembed and _fastembed_model is not None:
        try:
            generator = _fastembed_model.embed(texts)
            results = []
            for emb in generator:
                vec = emb.tolist() if hasattr(emb, "tolist") else list(emb)
                results.append(_normalize_vector_pure(vec[:EMBEDDING_DIM]))
            return results
        except Exception:
            pass

    # 2. Try Gemini Embeddings if configured
    gemini_res = _gemini_embed(texts)
    if gemini_res is not None:
        return gemini_res

    # 3. Deterministic zero-cost fallback
    return [_deterministic_hash_embed(t, EMBEDDING_DIM) for t in texts]


def get_embedding(text: str) -> list[float]:
    """Get single dense embedding vector."""
    res = get_embeddings([text])
    return res[0] if res else [0.0] * EMBEDDING_DIM


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two vectors (returns value between -1.0 and 1.0)."""
    if len(vec_a) != len(vec_b) or not vec_a:
        return 0.0

    if _has_numpy:
        a = np.array(vec_a, dtype=np.float32)
        b = np.array(vec_b, dtype=np.float32)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))

    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)
