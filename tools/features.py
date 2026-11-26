"""Classical (non-ML) image features used for role + quality detection.

All features are computed on a downscaled copy of the image so that the
process stays CPU-friendly and memory-bounded (the originals are 4000-7000px).
"""
from __future__ import annotations

import numpy as np
from PIL import Image

WORK = 640  # working resolution for feature extraction


def load_small(path, work: int = WORK) -> Image.Image:
    im = Image.open(path)
    im = im.convert("RGB")
    im.thumbnail((work, work), Image.LANCZOS)
    return im


def _lab_colors(im: Image.Image, k: int = 5):
    """k-means dominant colours in LAB space + their pixel share."""
    small = im.copy()
    small.thumbnail((120, 120), Image.LANCZOS)
    arr = np.asarray(small, dtype=np.float32).reshape(-1, 3)
    # simple deterministic k-means (few iterations, fixed seed via k-means++ style init)
    rng = np.random.default_rng(0)
    centers = arr[rng.choice(len(arr), k, replace=False)].copy()
    for _ in range(12):
        d = ((arr[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        labels = d.argmin(1)
        for i in range(k):
            m = labels == i
            if m.any():
                centers[i] = arr[m].mean(0)
    d = ((arr[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
    labels = d.argmin(1)
    share = np.bincount(labels, minlength=k) / len(arr)
    order = np.argsort(-share)
    return centers[order], share[order]


def border_contact(im: Image.Image, bg, tol: float = 60.0) -> int:
    """How many frame borders are crossed by the product.

    A border that is still mostly the backdrop colour means the product stops
    inside the frame. This is measured directly from the pixels, so it stays
    valid for white products on white backdrops (where a colour mask of the
    subject would be meaningless).
    """
    a = np.asarray(im, dtype=np.int16)
    h, w, _ = a.shape
    bgc = np.asarray(bg, dtype=np.int16)
    borders = {"top": a[0], "bottom": a[-1], "left": a[:, 0], "right": a[:, -1]}
    crossed = 0
    for px in borders.values():
        is_bg = np.abs(px - bgc).sum(axis=1) <= tol
        if is_bg.mean() < 0.5:  # border is not backdrop -> the product reaches it
            crossed += 1
    return crossed


def background_bbox(im: Image.Image, tol: int = 26):
    """Estimate the product bounding box.

    Two strategies:
      1. colour distance from the modal border colour (works for a product
         that contrasts with the backdrop, e.g. dark knit on brown paper);
      2. edge/contour based fallback for low-contrast cases such as a white
         garment on a white backdrop (very common in the 09.21 library).

    Returns (bbox, bg_colour, area_ratio, reliable) where `reliable` is False
    for the contour fallback: the contour may include the shadow/table edges,
    so border contact measured from it is not reliable evidence of cropping.
    """
    a = np.asarray(im, dtype=np.int16)
    h, w, _ = a.shape
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]], axis=0)
    bg = np.median(border, axis=0)
    dist = np.abs(a - bg).sum(axis=2)
    mask = dist > tol
    if mask.mean() <= 0.6:
        ys, xs = np.where(mask)
        if len(ys) >= 50:
            x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
            return (x0, y0, x1, y1), bg, float(mask.mean()), True

    # ---- fallback: outline / contour based ----
    try:
        import cv2

        gray = np.asarray(im.convert("L"), dtype=np.uint8)
        edges = cv2.Canny(gray, 50, 150)
        k = np.ones((11, 11), np.uint8)
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, k)
        closed = cv2.dilate(closed, k, iterations=1)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best, best_area = None, 0
        for c in contours:
            area = cv2.contourArea(c)
            if area > best_area:
                x, y, cw, ch = cv2.boundingRect(c)
                if cw > w * 0.12 and ch > h * 0.12 and area < w * h * 0.95:
                    best, best_area = (x, y, x + cw, y + ch), area
        if best:
            return best, bg, round(best_area / float(w * h), 4), False
    except Exception:  # noqa: BLE001
        pass
    return None, bg, float("nan"), False


def features(path) -> dict:
    im = load_small(path)
    a = np.asarray(im, dtype=np.float32)
    g = a.mean(axis=2)
    h, w, _ = a.shape
    f: dict = {}

    # ---- exposure / contrast ----
    f["mean_luma"] = round(float(g.mean()), 2)
    f["p01_luma"], f["p99_luma"] = [round(float(v), 2) for v in np.percentile(g, [1, 99])]
    f["contrast"] = round(float(g.std()), 2)
    f["blown_pct"] = round(float((g > 250).mean() * 100), 3)
    f["crushed_pct"] = round(float((g < 5).mean() * 100), 3)

    # ---- subject / composition ----
    bbox, bg, area_ratio, reliable = background_bbox(im)

    # exposure measured on the *product* only: the white studio backdrop is
    # normally blown out, which says nothing about the product itself.
    a_i = np.asarray(im, dtype=np.int16)
    bgc = np.asarray(bg, dtype=np.int16)
    prod_mask = np.abs(a_i - bgc).sum(axis=2) > 90  # product pixels (loose tol)
    if prod_mask.sum() < 0.02 * prod_mask.size:  # fallback: use the whole frame
        prod_mask = np.ones_like(prod_mask, dtype=bool)
    sub = g[prod_mask]
    if sub.size:
        f["subject_mean_luma"] = round(float(sub.mean()), 2)
        f["subject_blown_pct"] = round(float((sub > 250).mean() * 100), 3)
        f["subject_crushed_pct"] = round(float((sub < 5).mean() * 100), 3)
        f["subject_coverage_pct"] = round(float(prod_mask.mean() * 100), 2)
    else:
        f["subject_mean_luma"] = f["mean_luma"]
        f["subject_blown_pct"] = f["blown_pct"]
        f["subject_crushed_pct"] = f["crushed_pct"]
        f["subject_coverage_pct"] = 100.0
    f["overexposed"] = bool(
        f["subject_blown_pct"] > 12.0 or (f["subject_mean_luma"] > 248 and f["subject_blown_pct"] > 5.0)
    )
    f["underexposed"] = bool(
        f["subject_crushed_pct"] > 8.0 or (f["subject_mean_luma"] < 45 and f["subject_crushed_pct"] > 3.0)
    )

    # ---- sharpness (blur) ----
    try:
        import cv2

        blur = float(cv2.Laplacian(g.astype(np.uint8), cv2.CV_64F).var())
        edges = cv2.Canny(a.astype(np.uint8), 80, 180)
        edge_density = float((edges > 0).mean())
    except Exception:  # noqa: BLE001
        blur, edge_density = 0.0, 0.0
    f["sharpness"] = round(blur, 2)
    f["edge_density"] = round(edge_density, 4)
    f["blurry"] = bool(blur < 60)

    # ---- colour ----
    centers, share = _lab_colors(im)
    f["dominant_rgb"] = [int(v) for v in centers[0]]
    f["dominant_hex"] = "#%02x%02x%02x" % tuple(int(v) for v in centers[0])
    f["dominant_share"] = round(float(share[0]), 3)
    f["palette"] = [
        {"hex": "#%02x%02x%02x" % tuple(int(v) for v in c), "share": round(float(s), 3)}
        for c, s in zip(centers, share)
    ]

    # ---- subject / composition ----
    f["bg_uniform"] = bool(reliable)
    f["bbox_reliable"] = bool(reliable)
    f["subject_area_ratio"] = None if area_ratio != area_ratio else round(area_ratio, 4)
    if bbox:
        x0, y0, x1, y1 = bbox
        f["bbox"] = [x0, y0, x1, y1]
        f["subject_w"] = x1 - x0
        f["subject_h"] = y1 - y0
        f["subject_aspect"] = round((x1 - x0) / max(1, (y1 - y0)), 3)
        f["subject_height_ratio"] = round((y1 - y0) / h, 3)
        f["subject_centered"] = bool(
            abs(((x0 + x1) / 2) - w / 2) < w * 0.12 and abs(((y0 + y1) / 2) - h / 2) < h * 0.15
        )
        # a garment that is cropped crosses the frame border
        touches = border_contact(im, bg)
        f["touches_border"] = touches
        f["touches_border_measured"] = touches
        f["subject_complete"] = bool(touches < 3)
    else:
        f["bbox"] = None
        f["subject_aspect"] = None
        f["subject_height_ratio"] = None
        f["subject_centered"] = False
        f["subject_complete"] = True
        f["touches_border"] = 0
        f["touches_border_measured"] = 0

    # ---- black border detection ----
    edge_px = np.concatenate([g[0], g[-1], g[:, 0], g[:, -1]])
    f["black_border"] = bool((edge_px < 12).mean() > 0.55)

    # ---- rotation anomaly: EXIF orientation not applied ----
    f["exif_rotate_needed"] = False
    try:
        from PIL import Image as PILImage

        with PILImage.open(path) as src:
            exif = src.getexif()
            orient = exif.get(274) if exif else None
            f["exif_orientation"] = orient
            f["exif_rotate_needed"] = bool(orient and orient >= 5)
    except Exception:  # noqa: BLE001
        f["exif_orientation"] = None

    # ---- resolution / aspect ----
    with Image.open(path) as src:
        f["width"], f["height"] = src.size
    f["aspect_ratio"] = round(f["width"] / max(1, f["height"]), 4)
    f["megapixels"] = round(f["width"] * f["height"] / 1e6, 2)

    # ---- text-likeness (size chart / info board detection) ----
    # dense, thin, high-contrast strokes on a mostly uniform background
    if bbox:
        x0, y0, x1, y1 = bbox
        crop = g[max(0, y0) : y1 + 1, max(0, x0) : x1 + 1]
        if crop.size:
            f["stroke_density"] = round(float((np.abs(np.diff(crop, axis=0)) > 28).mean()), 4)
        else:
            f["stroke_density"] = 0.0
    else:
        f["stroke_density"] = 0.0

    return f
