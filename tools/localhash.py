"""Dependency-free perceptual hashing (pHash / dHash / aHash) built on numpy+Pillow.

The PyPI `imagehash` package could not be installed reliably in this environment,
so the standard DCT-based pHash is implemented here (algorithm identical to
imagehash.phash with hash_size=8, highfreq_factor=4).
"""
from __future__ import annotations

import numpy as np
from PIL import Image

DCT_MAT_CACHE: dict[int, np.ndarray] = {}


def _dct_matrix(n: int) -> np.ndarray:
    if n not in DCT_MAT_CACHE:
        k = np.arange(n).reshape(-1, 1)
        x = np.arange(n).reshape(1, -1)
        m = np.cos(np.pi * (2 * x + 1) * k / (2 * n))
        m[0] *= 1 / np.sqrt(2)
        DCT_MAT_CACHE[n] = m * np.sqrt(2.0 / n)
    return DCT_MAT_CACHE[n]


def _dct2(a: np.ndarray) -> np.ndarray:
    """2-D DCT-II via two matrix multiplies (fast enough for 32x32 inputs)."""
    n = a.shape[0]
    m = _dct_matrix(n)
    return m @ a @ m.T


def _gray(img: Image.Image, size: int) -> np.ndarray:
    im = img.convert("L").resize((size, size), Image.LANCZOS)
    return np.asarray(im, dtype=np.float64)


def phash(img: Image.Image, hash_size: int = 8, highfreq_factor: int = 4) -> str:
    """DCT perceptual hash -> 64-bit hex string."""
    size = hash_size * highfreq_factor
    d = _dct2(_gray(img, size))
    dct_low = d[:hash_size, :hash_size]
    med = np.median(dct_low[1:, 1:].flatten() if hash_size > 1 else dct_low.flatten())
    diff = dct_low > med
    bits = diff.flatten()
    val = 0
    for b in bits:
        val = (val << 1) | int(b)
    return f"{val:0{hash_size * hash_size // 4}x}"


def dhash(img: Image.Image, hash_size: int = 8) -> str:
    im = img.convert("L").resize((hash_size + 1, hash_size), Image.LANCZOS)
    arr = np.asarray(im, dtype=np.int16)
    diff = arr[:, 1:] > arr[:, :-1]
    val = 0
    for b in diff.flatten():
        val = (val << 1) | int(b)
    return f"{val:0{hash_size * hash_size // 4}x}"


def ahash(img: Image.Image, hash_size: int = 8) -> str:
    arr = _gray(img, hash_size)
    bits = arr > arr.mean()
    val = 0
    for b in bits.flatten():
        val = (val << 1) | int(b)
    return f"{val:0{hash_size * hash_size // 4}x}"


def hamming(a: str, b: str) -> int:
    if not a or not b or len(a) != len(b):
        return 64
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def all_hashes(img: Image.Image) -> dict[str, str]:
    return {"phash": phash(img), "dhash": dhash(img), "ahash": ahash(img)}
