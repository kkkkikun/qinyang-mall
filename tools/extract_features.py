"""Stage: classical CV features for every source image (cached, resumable)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C
import features as FE


def main() -> int:
    with C.Stage("03_features") as stage:
        C.ensure_dirs()
        FEATURE_VERSION = 3  # bump to invalidate the cache after a detector change
        inv = C.load_cache("inventory.json")
        cache = C.load_cache("features.json")
        stale = [k for k, v in cache.items() if v.get("fv") != FEATURE_VERSION]
        for k in stale:
            cache.pop(k, None)
        todo = [k for k in sorted(inv) if k not in cache]
        stage.log(f"images={len(inv)} to process={len(todo)} (cached {len(cache)}, invalidated {len(stale)})")
        for i, key in enumerate(todo, 1):
            p = C.PROJECT_ROOT / key
            try:
                rec = FE.features(p)
                rec["fv"] = FEATURE_VERSION
                cache[key] = rec
            except Exception as exc:  # noqa: BLE001
                cache[key] = {"error": f"{type(exc).__name__}:{exc}", "fv": FEATURE_VERSION}
                stage.log(f"feature error {key}: {exc}")
            if i % 50 == 0:
                stage.log(f"features {i}/{len(todo)}")
                C.save_cache("features.json", cache)
        C.save_cache("features.json", cache)
        errs = sum(1 for v in cache.values() if v.get("error"))
        stage.log(f"DONE features={len(cache)} errors={errs}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
