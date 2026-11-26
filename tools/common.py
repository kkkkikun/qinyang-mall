"""Shared helpers for the 鄂多蘭 (ED) catalog pipeline.

Design rules enforced here:
  * `images/` is READ-ONLY. We never write, move, rename or delete inside it.
  * Every derived artifact lives under `catalog/`.
  * All steps are resumable: each stage caches its work in `catalog/.cache/*.json`.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

PROJECT_ROOT = Path(__file__).resolve().parent.parent
IMAGES_DIR = PROJECT_ROOT / "images"
CATALOG_DIR = PROJECT_ROOT / "catalog"
CACHE_DIR = CATALOG_DIR / ".cache"
REPORTS_DIR = CATALOG_DIR / "reports"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff", ".heic"}
SKIP_NAMES = {"thumbs.db", "desktop.ini"}


def ensure_dirs() -> None:
    for d in (CATALOG_DIR, CACHE_DIR, REPORTS_DIR):
        d.mkdir(parents=True, exist_ok=True)


def is_image(path: Path) -> bool:
    if path.name.lower() in SKIP_NAMES:
        return False
    if path.suffix.lower() not in IMAGE_EXTS:
        return False
    # skip in-flight netdisk artefacts
    if ".downloading" in path.name or path.suffix.lower() == ".db":
        return False
    return True


def iter_source_images(images_dir: Path = IMAGES_DIR) -> Iterable[Path]:
    """Yield every candidate image under images/ in a stable order."""
    out: list[Path] = []
    for p in sorted(images_dir.rglob("*"), key=lambda x: str(x)):
        if p.is_file() and is_image(p):
            out.append(p)
    return out


def rel(path: Path | str) -> str:
    """Path relative to the project root, POSIX style (used in every report)."""
    p = Path(path)
    try:
        return p.resolve().relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return p.as_posix()


def sha256_file(path: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            block = fh.read(chunk)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def load_cache(name: str) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    p = CACHE_DIR / name
    if p.exists():
        try:
            return json.loads(p.read_text("utf-8"))
        except Exception:
            return {}
    return {}


def save_cache(name: str, data: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CACHE_DIR / (name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), "utf-8")
    tmp.replace(CACHE_DIR / name)


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


class Stage:
    """Tiny resumable stage runner: logs to catalog/reports/logs/<stage>.log."""

    def __init__(self, name: str):
        self.name = name
        ensure_dirs()
        self.log_path = REPORTS_DIR / "logs" / f"{name}.log"
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = open(self.log_path, "a", encoding="utf-8")

    def log(self, msg: str) -> None:
        line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
        print(line, flush=True)
        self._fh.write(line + "\n")
        self._fh.flush()

    def close(self) -> None:
        try:
            self._fh.close()
        except Exception:
            pass

    def __enter__(self):
        self.log(f"=== stage {self.name} start ===")
        return self

    def __exit__(self, *exc):
        self.log(f"=== stage {self.name} end (ok={exc[0] is None}) ===")
        self.close()
        return False
