"""Stage: assign per-image role / category labels.

Two sources, in priority order:
  1. `authored_overrides.json` - visual review results (category / role per image)
     produced by reviewing the per-product contact sheets. These always win.
  2. CLIP zero-shot labels when the local CLIP model is available.
  3. Otherwise a classical CV heuristic (subject size, edge density, ...).

The result is written to catalog/.cache/labels.json and is consumed by every
downstream stage, so the pipeline behaves identically in all three modes.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C
import clip_labels as L


def cv_labels(feat: dict) -> dict:
    """Classical-CV fallback labelling (no CLIP)."""
    height_ratio = feat.get("subject_height_ratio")
    area = feat.get("subject_area_ratio")
    edge = feat.get("edge_density", 0.0)
    stroke = feat.get("stroke_density", 0.0)
    uniform = feat.get("bg_uniform", True)
    touches = feat.get("touches_border", 0)

    if height_ratio is None:
        return {"shot_type": "unknown", "role": "other", "role_tags": [], "confidence": 0.25}

    if uniform and height_ratio >= 0.52 and touches < 2:
        shot, role = "full_garment", "front"
        conf = 0.62 if height_ratio > 0.7 else 0.5
        tags = ["full_framing"]
    elif uniform and height_ratio >= 0.40:
        shot, role = "full_garment", "front"
        conf = 0.45
        tags = ["partial_framing"]
    elif height_ratio < 0.30 and edge < 0.075:
        shot, role = "closeup_fabric", "fabric"
        conf = 0.5
        tags = ["soft_folds"]
    elif height_ratio < 0.45 and edge >= 0.075:
        shot, role = "partial_garment", "detail"
        conf = 0.5
        tags = ["crisp_texture"]
    elif stroke > 0.09 and area and area > 0.35:
        shot, role = "size_chart", "size_chart"
        conf = 0.3
        tags = ["text_like"]
    else:
        shot, role = "partial_garment", "detail"
        conf = 0.35
        tags = []
    if touches >= 2:
        tags.append("cropped_at_border")
        conf -= 0.05
    return {"shot_type": shot, "role": role, "role_tags": tags, "confidence": round(max(0.1, conf), 3)}


def main() -> int:
    with C.Stage("04b_label") as stage:
        C.ensure_dirs()
        inv = C.load_cache("inventory.json")
        feats = C.load_cache("features.json")

        # ---- 1. visual-review overrides (highest priority) ----
        # catalog/review/authored_overrides.json
        #   { "ED-0001": { "category": "knitwear", "color": "深灰色",
        #                  "note": "…", "images": {"DSC02830.jpg": "front", …} } }
        overrides_path = C.CATALOG_DIR / "review" / "authored_overrides.json"
        overrides: dict[str, dict] = {}
        prod_overrides: dict[str, dict] = {}
        prod_of: dict[str, str] = {}
        prods_cache = C.load_cache("products.json")
        for p in prods_cache.get("products", []):
            for m in p["members"]:
                prod_of[m] = p["product_id"]
        name_to_path = {Path(k).name: k for k in inv}

        if overrides_path.exists():
            raw = json.loads(overrides_path.read_text("utf-8"))
            for pid, entry in raw.items():
                if not isinstance(entry, dict):
                    continue
                if "images" in entry:
                    prod_overrides[pid] = entry
                    for fname, role in entry["images"].items():
                        path = name_to_path.get(fname)
                        if path:
                            rec = {"role": role}
                            if role in ("front", "back", "side", "cover"):
                                rec["shot_type"] = "full_garment"
                            elif role == "fabric":
                                rec["shot_type"] = "closeup_fabric"
                            elif role == "detail":
                                rec["shot_type"] = "partial_garment"
                            overrides[path] = rec
                else:  # flat per-image map keyed by file name
                    for fname, val in entry.items():
                        path = name_to_path.get(fname)
                        if path:
                            overrides[path] = val if isinstance(val, dict) else {"role": val}
            stage.log(
                f"visual review overrides loaded: {len(overrides)} images "
                f"across {len(prod_overrides)} products"
            )

        # ---- 2. CLIP labels (if the local model is present) ----
        clip_labels: dict[str, dict] = {}
        emb = C.CACHE_DIR / "embeddings.npz"
        model_dir = C.PROJECT_ROOT / ".cache" / "clip-vit-base-patch32"
        if emb.exists() and (model_dir / "config.json").exists() and (model_dir / "pytorch_model.bin").exists():
            try:
                import numpy as np
                import torch
                from transformers import CLIPModel, CLIPProcessor

                z = np.load(emb, allow_pickle=True)
                paths = [str(p) for p in z["paths"]]
                vecs = z["vecs"].astype("float32")
                model = CLIPModel.from_pretrained(str(model_dir)).eval()
                processor = CLIPProcessor.from_pretrained(str(model_dir))
                for key, vec in zip(paths, vecs):
                    shot_p = ens(vec, model, processor, L.SHOT_TYPE_PROMPTS)
                    cat_p = ens(vec, model, processor, L.CATEGORY_PROMPTS)
                    view_p = ens(vec, model, processor, L.VIEW_PROMPTS)
                    shot = max(shot_p, key=shot_p.get)
                    cat = max(cat_p, key=cat_p.get)
                    view = max(view_p, key=view_p.get)
                    clip_labels[key] = {
                        "shot_type": shot,
                        "shot_probs": {k: round(v, 4) for k, v in shot_p.items()},
                        "category_raw": cat,
                        "category_probs": {k: round(v, 4) for k, v in cat_p.items()},
                        "view": view,
                        "view_probs": {k: round(v, 4) for k, v in view_p.items()},
                    }
                stage.log(f"CLIP labels computed for {len(clip_labels)} images")
            except Exception as exc:  # noqa: BLE001
                stage.log(f"CLIP labelling failed, using CV fallback: {exc}")
        else:
            stage.log("CLIP model not available - using classical CV labelling")

        # ---- 3. merge ----
        out: dict[str, dict] = {}
        for key, rec in sorted(inv.items()):
            feat = feats.get(key, {})
            base = dict(cv_labels(feat))
            if key in clip_labels:
                c = clip_labels[key]
                base.update({"shot_type": c["shot_type"], "shot_probs": c["shot_probs"],
                             "category_raw": c["category_raw"], "category_probs": c["category_probs"],
                             "view": c["view"], "view_probs": c["view_probs"]})
                base["confidence"] = round(min(1.0, c["shot_probs"][c["shot_type"]] + 0.1), 3)
                if c["shot_type"] == "full_garment":
                    role = "front"
                    if c["view"] == "back" and c["view_probs"]["back"] > 0.33:
                        role = "back"
                    elif c["view"] == "side" and c["view_probs"]["side"] > 0.33:
                        role = "side"
                    base["role"] = role
                    base["role_tags"] = ["full_framing"]
                elif c["shot_type"] == "closeup_fabric":
                    base["role"], base["role_tags"] = "fabric", ["soft_folds"]
                elif c["shot_type"] == "partial_garment":
                    base["role"], base["role_tags"] = "detail", ["closeup"]
                elif c["shot_type"] == "model_worn":
                    base["role"] = "model"
                elif c["shot_type"] == "flatlay":
                    base["role"] = "flatlay"
                elif c["shot_type"] == "size_chart":
                    base["role"] = "size_chart"
                elif c["shot_type"] == "styled_scene":
                    base["role"], base["role_tags"] = "other", ["styled_scene"]
                else:
                    base["role"], base["role_tags"] = "other", []

            # category
            if "category_probs" in base:
                cat = base.get("category_raw", "unknown")
                taxonomy = L.CATEGORY_TAXONOMY.get(cat, "unknown")
                if cat in ("shirts", "knitwear", "scarves") and base["category_probs"].get(cat, 0) < 0.30:
                    taxonomy = "unknown"
                base["category"] = taxonomy
            else:
                base["category"] = "unknown"

            base["visual_color"] = L.name_color(feat.get("dominant_rgb", [128, 128, 128]))
            base.setdefault("confidence", 0.4)

            # ---- product level override (applies to the whole group) ----
            pov = prod_overrides.get(prod_of.get(key, ""))
            if pov:
                if pov.get("category"):
                    base["category"] = pov["category"]
                if pov.get("color") or pov.get("visual_color"):
                    base["visual_color"] = pov.get("color") or pov.get("visual_color")
                base["product_reviewed"] = True
                base["confidence"] = max(base.get("confidence", 0.4), float(pov.get("confidence", 0.9)))

            # ---- visual review override wins ----
            ov = overrides.get(key)
            if ov:
                for field in ("shot_type", "role", "category", "visual_color", "view"):
                    if ov.get(field):
                        base[field] = ov[field]
                if ov.get("role_tags"):
                    base["role_tags"] = ov["role_tags"]
                base["confidence"] = float(ov.get("confidence", 0.95))
                base["reviewed"] = True
                base["review_note"] = ov.get("note", "")
            else:
                base["reviewed"] = bool(pov)

            base["needs_review"] = bool(
                (not base["reviewed"])
                and (base.get("confidence", 0) < 0.5 or base.get("category") == "unknown"
                     or base.get("role") in ("other", "size_chart"))
            )
            out[key] = base

        C.save_cache("labels.json", out)
        from collections import Counter

        stage.log(f"roles: {Counter(r['role'] for r in out.values()).most_common()}")
        stage.log(f"categories: {Counter(r['category'] for r in out.values()).most_common()}")
        stage.log(f"reviewed images: {sum(1 for r in out.values() if r.get('reviewed'))}")
        stage.log(f"DONE labels={len(out)}")
    return 0


def ens(vec, model, processor, groups):
    import numpy as np
    import torch

    flat, index = [], {}
    for lab, prompts in groups.items():
        index[lab] = list(range(len(flat), len(flat) + len(prompts)))
        flat.extend(prompts)
    feats = []
    with torch.no_grad():
        for i in range(0, len(flat), 32):
            inp = processor(text=flat[i:i + 32], return_tensors="pt", padding=True, truncation=True)
            t = model.get_text_features(**inp)
            t = t / t.norm(dim=-1, keepdim=True)
            feats.append(t.numpy().astype("float32"))
    txt = np.concatenate(feats, 0)
    logits = txt @ vec
    e = np.exp((logits - logits.max()) * 100.0)
    p = e / e.sum()
    out = {lab: float(p[idx].mean()) for lab, idx in index.items()}
    total = sum(out.values()) or 1.0
    return {k: v / total for k, v in out.items()}


if __name__ == "__main__":
    raise SystemExit(main())
