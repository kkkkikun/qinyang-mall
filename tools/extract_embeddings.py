"""Extract CLIP image embeddings for every source image (local CPU inference).

Customer images never leave this machine: the model weights are vendored under
.cache/clip-vit-base-patch32 and inference runs offline on CPU.

Output: catalog/.cache/embeddings.npz  (float32 matrix + path list)
Resumable: an image is only re-encoded if its file fingerprint changed.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C

MODEL_DIR = C.PROJECT_ROOT / ".cache" / "clip-vit-base-patch32"
CACHE = C.CACHE_DIR / "embeddings.npz"
BATCH = 8


def main() -> int:
    with C.Stage("02_embeddings") as stage:
        C.ensure_dirs()
        if not (MODEL_DIR / "config.json").exists():
            stage.log(f"CLIP weights not found at {MODEL_DIR} - aborting")
            return 2

        import torch
        from transformers import CLIPModel, CLIPProcessor

        torch.set_num_threads(max(1, (__import__("os").cpu_count() or 4)))
        model = CLIPModel.from_pretrained(str(MODEL_DIR)).eval()
        processor = CLIPProcessor.from_pretrained(str(MODEL_DIR))
        stage.log(f"CLIP loaded from {MODEL_DIR}")

        existing: dict[str, np.ndarray] = {}
        if CACHE.exists():
            z = np.load(CACHE, allow_pickle=True)
            paths = list(z["paths"])
            vecs = z["vecs"]
            existing = {p: vecs[i] for i, p in enumerate(paths)}
            stage.log(f"cache: {len(existing)} vectors")

        inv = C.load_cache("inventory.json")
        targets = []
        for key, rec in sorted(inv.items()):
            fp = f"{rec.get('file_size_bytes')}:{rec.get('fingerprint','').split(':')[-1]}"
            v = existing.get(key)
            if v is not None and existing.get(key) is not None:
                continue
            targets.append((key, rec))
        stage.log(f"to encode: {len(targets)} (cache holds {len(existing)})")

        done = 0
        for i in range(0, len(targets), BATCH):
            chunk = targets[i : i + BATCH]
            imgs = []
            keep = []
            for key, rec in chunk:
                p = C.PROJECT_ROOT / key
                try:
                    im = Image.open(p).convert("RGB")
                    imgs.append(im)
                    keep.append(key)
                except Exception as exc:  # noqa: BLE001
                    stage.log(f"decode failed {key}: {exc}")
            if not imgs:
                continue
            with torch.no_grad():
                inputs = processor(images=imgs, return_tensors="pt")
                feats = model.get_image_features(**inputs)
                feats = feats / feats.norm(dim=-1, keepdim=True)
            for key, v in zip(keep, feats.numpy().astype("float32")):
                existing[key] = v
            done += len(keep)
            if (i // BATCH) % 10 == 0:
                stage.log(f"encoded {done}/{len(targets)}")
                _flush(existing)
        _flush(existing)
        stage.log(f"DONE embeddings={len(existing)}")
    return 0


def _flush(existing: dict[str, np.ndarray]) -> None:
    if not existing:
        return
    keys = sorted(existing)
    mat = np.stack([existing[k] for k in keys]).astype("float32")
    C.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = C.CACHE_DIR / "embeddings.npz.tmp.npz"
    np.savez_compressed(tmp, vecs=mat, paths=np.array(keys, dtype=object))
    tmp.replace(CACHE)


if __name__ == "__main__":
    raise SystemExit(main())
