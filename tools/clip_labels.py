"""CLIP zero-shot label sets for 鄂多蘭 cataloging.

Every label is an ensemble of paraphrases; the per-prompt softmax
probabilities are averaged, which is markedly more stable than a single prompt.
Prompts are English (CLIP's training language) but map onto the Chinese
taxonomy required by docs/p1.md.
"""
from __future__ import annotations

SHOT_TYPE_PROMPTS: dict[str, list[str]] = {
    "full_garment": [
        "a studio product photo of a complete garment hanging on a wooden hanger",
        "a full view of one clothing item on a hanger against a plain backdrop",
        "a whole sweater or shirt photographed on a hanger for an online shop",
    ],
    "closeup_fabric": [
        "an extreme close-up macro photo of fabric texture and weave",
        "a photo showing only soft folds of cloth, no whole garment visible",
        "a macro shot of wool or knit material surface",
    ],
    "partial_garment": [
        "a cropped close-up of only part of a garment, like a shoulder or a sleeve",
        "a detail photo of a collar, buttons or hem of a shirt",
        "a zoomed-in shot of a neckline and shoulder area",
    ],
    "model_worn": [
        "a fashion photo of a woman model wearing the outfit",
        "a full body photograph of a person modelling clothes",
        "a model posing in a knit sweater",
    ],
    "flatlay": [
        "a flat lay photo of clothing neatly laid flat on a surface seen from above",
        "clothes arranged flat on a plain background from a top-down view",
    ],
    "size_chart": [
        "a size chart table listing garment measurements",
        "an infographic with clothing size numbers and measurement lines",
    ],
    "styled_scene": [
        "a styled studio scene with a vase of flowers and props next to the garment",
        "a garment displayed on a pedestal in a decorated room",
    ],
}

CATEGORY_PROMPTS: dict[str, list[str]] = {
    "shirts": [
        "a button-up collared shirt",
        "a polo shirt with buttons",
        "a woven shirt with a pointed collar",
    ],
    "knitwear": [
        "a knitted sweater",
        "a knitted cardigan with buttons",
        "a rib knitted pullover or tank top",
        "a wool knit hooded sweater",
    ],
    "scarves": [
        "a silk scarf with a printed pattern",
        "a long soft draped scarf",
        "a patterned shawl",
    ],
    "skirt": [
        "a pleated or checkered mini skirt",
    ],
    "trousers": [
        "a pair of trousers or pants",
    ],
    "coat": [
        "a coat or jacket",
    ],
    "hoodie": [
        "a hoodie sweatshirt with a hood",
    ],
    "dress": [
        "a one piece dress",
    ],
    "accessories": [
        "a fashion accessory such as a hat, belt, bag or gloves",
    ],
}

VIEW_PROMPTS: dict[str, list[str]] = {
    "front": [
        "the front of a garment on a hanger, showing the chest and buttons",
        "the front view of a shirt with the collar facing the camera",
    ],
    "back": [
        "the back of a garment on a hanger",
        "the rear view of a shirt, the back yoke and shoulders visible",
    ],
    "side": [
        "the side view of a garment on a hanger",
    ],
}

# product-category label -> taxonomy used in docs/p1.md
CATEGORY_TAXONOMY = {
    "shirts": "shirts",
    "knitwear": "knitwear",
    "scarves": "scarves",
    "skirt": "clothing",
    "trousers": "clothing",
    "coat": "clothing",
    "hoodie": "clothing",
    "dress": "clothing",
    "accessories": "accessories",
}

ROLE_FROM_SHOT = {
    "full_garment": "front",
    "closeup_fabric": "fabric",
    "partial_garment": "detail",
    "model_worn": "model",
    "flatlay": "flatlay",
    "size_chart": "size_chart",
    "styled_scene": "other",
}

# colour naming from RGB (dominant palette colour)
COLOR_NAMES = [
    ((0, 0, 0), (55, 55, 60), "黑色"),
    ((55, 55, 60), (105, 105, 110), "深灰"),
    ((105, 105, 110), (165, 165, 168), "灰色"),
    ((165, 165, 168), (215, 215, 215), "浅灰"),
    ((215, 215, 215), (255, 255, 255), "白色"),
    ((185, 165, 130), (240, 225, 195), "米白色"),
    ((140, 115, 80), (200, 175, 140), "卡其色"),
    ((70, 45, 30), (140, 100, 70), "棕色"),
    ((30, 35, 60), (85, 95, 135), "藏青色"),
    ((60, 100, 160), (130, 170, 215), "蓝色"),
    ((170, 195, 225), (225, 240, 250), "浅蓝色"),
    ((190, 130, 140), (235, 190, 195), "粉色"),
    ((120, 85, 150), (185, 150, 205), "紫色"),
    ((110, 30, 40), (175, 60, 70), "酒红色"),
    ((60, 110, 70), (130, 175, 130), "绿色"),
    ((160, 140, 70), (225, 205, 120), "黄色"),
    ((170, 100, 50), (225, 160, 95), "橙色"),
]


def name_color(rgb) -> str:
    r, g, b = [float(v) for v in rgb[:3]]
    mx, mn = max(r, g, b), min(r, g, b)
    sat = 0 if mx == 0 else (mx - mn) / mx
    lum = (r + g + b) / 3.0

    # neutral band -> greys / white / black
    if sat < 0.14:
        if lum < 55:
            return "黑色"
        if lum < 105:
            return "深灰"
        if lum < 165:
            return "灰色"
        if lum < 218:
            return "浅灰"
        return "白色"

    # hue
    import colorsys

    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    deg = h * 360
    if deg < 20 or deg >= 340:
        name = "红色"
    elif deg < 45:
        name = "橙色"
    elif deg < 70:
        name = "黄色"
    elif deg < 165:
        name = "绿色"
    elif deg < 200:
        name = "青色"
    elif deg < 255:
        name = "蓝色"
    elif deg < 290:
        name = "紫色"
    elif deg < 340:
        name = "粉色"
    else:
        name = "红色"

    if l < 0.30:
        name = "深" + name if name in ("蓝色", "绿色", "紫色", "红色", "粉色") else name
    elif l > 0.80 and s < 0.45:
        name = "浅" + name
    if name == "黄色" and l > 0.85:
        name = "米白色"
    return name
