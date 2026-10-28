"""
CivicAI - YOLOv8 Computer Vision Microservice
Detects civic infrastructure issues and computes explainable severity scores.

Label handling:
- Fine-tuned civic weights use models/classes.txt (pothole first).
- Stock yolov8n.pt is COCO-pretrained (no pothole class). COCO labels are
  remapped via models/label_map.json, then road-damage post-processing
  corrects false "garbage" labels on asphalt / water-filled pothole scenes.
"""

from __future__ import annotations

import io
import json
import logging
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("civicai-ai-service")

MODELS_DIR = Path(__file__).resolve().parent / "models"
CLASSES_FILE = MODELS_DIR / "classes.txt"
LABEL_MAP_FILE = MODELS_DIR / "label_map.json"

app = FastAPI(
    title="CivicAI Detection Service",
    description="YOLOv8-based civic infrastructure issue detection",
    version="1.0.1",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_civic_classes() -> list[str]:
    if CLASSES_FILE.exists():
        labels = [
            line.strip()
            for line in CLASSES_FILE.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]
        if labels:
            return labels
    return [
        "pothole",
        "garbage",
        "water_leakage",
        "drainage_blockage",
        "broken_streetlight",
    ]


def _load_label_map() -> dict[str, Any]:
    if LABEL_MAP_FILE.exists():
        return json.loads(LABEL_MAP_FILE.read_text(encoding="utf-8"))
    return {}


CIVIC_CATEGORIES = _load_civic_classes()
_LABEL_MAP = _load_label_map()

# Exact aliases (civic / custom model names) → civic category
CIVIC_ALIASES: dict[str, str] = {
    str(k).lower(): str(v)
    for k, v in (_LABEL_MAP.get("civic_aliases") or {}).items()
}
# Safe COCO → civic remaps (litter / infrastructure only)
COCO_TO_CIVIC: dict[str, str] = {
    str(k).lower(): str(v)
    for k, v in (_LABEL_MAP.get("coco_to_civic") or {}).items()
}
# COCO classes that must NEVER become civic issues (vehicles, people, furniture…)
DO_NOT_MAP: set[str] = {
    str(x).lower() for x in (_LABEL_MAP.get("do_not_map") or [])
}

# Fallback defaults if JSON missing
if not CIVIC_ALIASES:
    CIVIC_ALIASES = {
        "pothole": "pothole",
        "hole": "pothole",
        "crack": "pothole",
        "road_damage": "pothole",
        "road damage": "pothole",
        "asphalt_damage": "pothole",
        "garbage": "garbage",
        "trash": "garbage",
        "litter": "garbage",
        "waste": "garbage",
        "water_leakage": "water_leakage",
        "leak": "water_leakage",
        "drainage_blockage": "drainage_blockage",
        "broken_streetlight": "broken_streetlight",
        "streetlight": "broken_streetlight",
        "traffic light": "broken_streetlight",
    }
if not COCO_TO_CIVIC:
    COCO_TO_CIVIC = {
        "bottle": "garbage",
        "cup": "garbage",
        "wine glass": "garbage",
        "fork": "garbage",
        "knife": "garbage",
        "spoon": "garbage",
        "bowl": "garbage",
        "traffic light": "broken_streetlight",
        "fire hydrant": "water_leakage",
    }

ISSUE_RISK: dict[str, float] = {
    "pothole": 7.0,
    "garbage": 4.0,
    "water_leakage": 8.5,
    "drainage_blockage": 7.5,
    "broken_streetlight": 6.0,
}

SEVERITY_LEVELS = [
    (3.5, "Low"),
    (6.0, "Medium"),
    (8.0, "High"),
    (float("inf"), "Critical"),
]

YOLO = None  # type: ignore
try:
    from ultralytics import YOLO as _YOLO

    YOLO = _YOLO
except ImportError:
    logger.warning(
        "ultralytics not installed – using road-damage heuristic detector. "
        "Install full requirements.txt when disk/GPU allows."
    )

model: Any = None
USE_HEURISTIC = YOLO is None
MODEL_NAMES: dict[int, str] = {}  # index → label from loaded weights


@app.on_event("startup")
async def load_model() -> None:
    global model, USE_HEURISTIC, MODEL_NAMES
    if YOLO is None:
        USE_HEURISTIC = True
        logger.info("Road-damage heuristic detector active (no YOLOv8)")
        return

    # Prefer a fine-tuned civic checkpoint if present
    civic_weights = MODELS_DIR / "civicai-yolov8n.pt"
    weights = str(civic_weights if civic_weights.exists() else "yolov8n.pt")
    try:
        logger.info("Loading YOLO weights: %s", weights)
        model = YOLO(weights)
        MODEL_NAMES = dict(getattr(model, "names", {}) or {})
        USE_HEURISTIC = False
        logger.info(
            "YOLO loaded (%d classes). Sample labels: %s",
            len(MODEL_NAMES),
            list(MODEL_NAMES.values())[:8],
        )
        # If weights already use civic class names, index alignment is fine
        civic_in_model = {
            n.lower() for n in MODEL_NAMES.values()
        } & set(CIVIC_CATEGORIES)
        if civic_in_model:
            logger.info("Civic labels present in model: %s", sorted(civic_in_model))
        else:
            logger.warning(
                "Loaded weights look COCO-like (no civic labels). "
                "Road-damage post-processing will correct pothole vs garbage."
            )
    except Exception as exc:
        USE_HEURISTIC = True
        logger.warning("YOLO load failed (%s) – using heuristic detector", exc)


def map_class_to_civic(class_name: str) -> str | None:
    """
    Map a model class label to a civic category.
    Exact matches only for COCO litter/infra; no fuzzy matching that
    accidentally turns backpacks/benches into garbage/drainage.
    """
    key = class_name.strip().lower()
    if key in DO_NOT_MAP:
        return None
    if key in CIVIC_ALIASES:
        return CIVIC_ALIASES[key]
    if key in COCO_TO_CIVIC:
        return COCO_TO_CIVIC[key]
    if key in CIVIC_CATEGORIES:
        return key
    return None


def map_class_index_to_civic(cls_id: int, names: dict[Any, str] | None) -> tuple[str | None, str]:
    """Resolve class index → (civic_category | None, raw_label)."""
    name_map = names or MODEL_NAMES or {}
    raw = name_map.get(cls_id, name_map.get(str(cls_id), str(cls_id)))
    raw_label = str(raw)
    return map_class_to_civic(raw_label), raw_label


def severity_level_from_score(score: float) -> str:
    for threshold, level in SEVERITY_LEVELS:
        if score < threshold:
            return level
    return "Critical"


def clamp(value: float, low: float = 0.0, high: float = 10.0) -> float:
    return max(low, min(high, value))


def compute_severity(
    issue_type: str,
    boxes: list[dict[str, Any]],
    image_area: float,
    recurrence_count: int,
    unresolved_days: float,
) -> dict[str, Any]:
    issue_risk = ISSUE_RISK.get(issue_type, 5.0)

    issue_boxes = [b for b in boxes if b["civic_class"] == issue_type]
    covered = sum(
        max(0.0, (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])) for b in issue_boxes
    )
    coverage_ratio = min(1.0, covered / image_area) if image_area > 0 else 0.0
    count_factor = min(1.0, len(issue_boxes) / 5.0)
    extent = clamp(10.0 * (0.7 * coverage_ratio + 0.3 * count_factor))

    recurrence = clamp(float(recurrence_count))
    unresolved_duration = clamp((unresolved_days / 30.0) * 10.0)

    severity = round(
        clamp(
            0.4 * issue_risk
            + 0.3 * extent
            + 0.2 * recurrence
            + 0.1 * unresolved_duration
        ),
        2,
    )

    return {
        "severity_score": severity,
        "severity_level": severity_level_from_score(severity),
        "explainable_factors": {
            "issue_risk": round(issue_risk, 2),
            "extent": round(extent, 2),
            "recurrence": round(recurrence, 2),
            "unresolved_duration": round(unresolved_duration, 2),
            "weights": {
                "issue_risk": 0.4,
                "extent": 0.3,
                "recurrence": 0.2,
                "unresolved_duration": 0.1,
            },
            "formula": (
                "Severity = 0.4*Issue_Risk + 0.3*Extent + "
                "0.2*Recurrence + 0.1*Unresolved_Duration"
            ),
        },
    }


# ---------------------------------------------------------------------------
# Road-damage analysis (fixes water-filled potholes / debris mislabeled garbage)
# ---------------------------------------------------------------------------

def _to_gray(img: np.ndarray) -> np.ndarray:
    return (
        0.299 * img[:, :, 0].astype(np.float32)
        + 0.587 * img[:, :, 1].astype(np.float32)
        + 0.114 * img[:, :, 2].astype(np.float32)
    )


def analyze_road_scene(img_array: np.ndarray) -> dict[str, Any]:
    """
    Score asphalt / depression / standing-water cues typical of potholes.
    Returns scores in ~0–1 and a suggested bounding box for the darkest patch.
    """
    height, width = img_array.shape[:2]
    rgb = img_array.astype(np.float32)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    gray = _to_gray(img_array)

    mean_r, mean_g, mean_b = float(r.mean()), float(g.mean()), float(b.mean())
    brightness = float(gray.mean())
    std = float(gray.std())

    # Asphalt / concrete: low chroma, mid-low brightness
    chroma = float(np.mean(np.abs(r - g) + np.abs(g - b) + np.abs(r - b)) / 2.0)
    asphalt_score = clamp(
        (1.0 - min(1.0, chroma / 45.0)) * 0.55
        + (1.0 - abs(brightness - 95.0) / 95.0) * 0.45,
        0.0,
        1.0,
    )

    # Local dark depressions (pothole cavities)
    block_h, block_w = max(8, height // 12), max(8, width // 12)
    dark_ratio = float((gray < (brightness - 22)).mean()) if brightness > 1 else 0.0
    wet_mask = (b > r + 8) & (b > g + 5) & (gray < brightness + 10)
    wet_ratio = float(wet_mask.mean())

    # Scan grid for darkest substantial patch → pothole box
    best = {"score": 0.0, "box": None}
    for y0 in range(0, height - block_h, block_h // 2 or 1):
        for x0 in range(0, width - block_w, block_w // 2 or 1):
            patch = gray[y0 : y0 + block_h, x0 : x0 + block_w]
            pr = rgb[y0 : y0 + block_h, x0 : x0 + block_w]
            patch_mean = float(patch.mean())
            patch_std = float(patch.std())
            local_wet = float(
                ((pr[:, :, 2] > pr[:, :, 0] + 8) & (pr[:, :, 2] > pr[:, :, 1] + 5)).mean()
            )
            # Darker + textured + optional standing water → road damage
            score = (
                max(0.0, (brightness - patch_mean) / max(brightness, 1.0)) * 0.55
                + min(1.0, patch_std / 40.0) * 0.25
                + local_wet * 0.20
            )
            if score > best["score"]:
                # Expand box slightly around the patch
                pad_x, pad_y = int(block_w * 0.35), int(block_h * 0.35)
                best = {
                    "score": score,
                    "box": {
                        "x1": float(max(0, x0 - pad_x)),
                        "y1": float(max(0, y0 - pad_y)),
                        "x2": float(min(width, x0 + block_w + pad_x)),
                        "y2": float(min(height, y0 + block_h + pad_y)),
                    },
                    "local_wet": local_wet,
                }

    depression_score = float(best["score"])
    # Combined pothole likelihood
    pothole_score = clamp(
        asphalt_score * 0.35
        + depression_score * 0.40
        + dark_ratio * 0.15
        + wet_ratio * 0.10,
        0.0,
        1.0,
    )

    # Standing water on asphalt is pothole (road damage), NOT water_leakage
    # (water_leakage prefers strong blue without asphalt/depression context)
    water_leak_score = clamp(
        max(0.0, (mean_b - mean_r) / 80.0) * 0.6
        + max(0.0, (mean_b - mean_g) / 100.0) * 0.4
        - asphalt_score * 0.5,
        0.0,
        1.0,
    )

    garbage_score = clamp(
        (1.0 - asphalt_score) * 0.5
        + min(1.0, chroma / 60.0) * 0.3
        + (0.2 if brightness > 140 else 0.0),
        0.0,
        1.0,
    )

    drainage_score = clamp(
        max(0.0, (mean_g - mean_b) / 90.0) * 0.5
        + max(0.0, (70 - brightness) / 70) * 0.3
        + (1.0 - asphalt_score) * 0.2,
        0.0,
        1.0,
    )

    streetlight_score = clamp(
        max(0.0, (brightness - 160) / 95.0) * 0.7
        + max(0.0, (mean_r - mean_b) / 120.0) * 0.3,
        0.0,
        1.0,
    )

    return {
        "asphalt_score": round(asphalt_score, 4),
        "pothole_score": round(pothole_score, 4),
        "water_leakage_score": round(water_leak_score, 4),
        "garbage_score": round(garbage_score, 4),
        "drainage_blockage_score": round(drainage_score, 4),
        "broken_streetlight_score": round(streetlight_score, 4),
        "dark_ratio": round(dark_ratio, 4),
        "wet_ratio": round(wet_ratio, 4),
        "suggested_box": best.get("box"),
        "brightness": round(brightness, 2),
        "std": round(std, 2),
    }


def road_damage_boxes(
    img_array: np.ndarray, scene: dict[str, Any]
) -> list[dict[str, Any]]:
    """Build a pothole detection box from the darkest/wettest road patch."""
    height, width = img_array.shape[:2]
    box = scene.get("suggested_box")
    if not box:
        bw, bh = width * 0.4, height * 0.35
        box = {
            "x1": (width - bw) / 2,
            "y1": (height - bh) / 2,
            "x2": (width + bw) / 2,
            "y2": (height + bh) / 2,
        }
    conf = round(min(0.92, 0.45 + float(scene["pothole_score"]) * 0.5), 4)
    return [
        {
            "x1": round(float(box["x1"]), 2),
            "y1": round(float(box["y1"]), 2),
            "x2": round(float(box["x2"]), 2),
            "y2": round(float(box["y2"]), 2),
            "class": "pothole",
            "civic_class": "pothole",
            "confidence": conf,
        }
    ]


def heuristic_detect(
    img_array: np.ndarray,
) -> tuple[list[dict[str, Any]], str, float, dict[str, Any]]:
    """Scene-aware heuristic: prefers pothole on asphalt / wet depressions."""
    scene = analyze_road_scene(img_array)
    scores = {
        "pothole": scene["pothole_score"],
        "garbage": scene["garbage_score"] * 0.65,  # down-weight vs road damage
        "water_leakage": scene["water_leakage_score"],
        "drainage_blockage": scene["drainage_blockage_score"],
        "broken_streetlight": scene["broken_streetlight_score"],
    }
    # Tie-break: on asphalt, pothole wins over garbage / weak water_leakage
    if scene["asphalt_score"] >= 0.45 and scene["pothole_score"] >= 0.28:
        scores["pothole"] = max(scores["pothole"], 0.55)
        scores["garbage"] *= 0.4

    primary = max(scores, key=scores.get)
    confidence = round(min(0.9, 0.4 + float(scores[primary]) * 0.5), 4)

    if primary == "pothole":
        boxes = road_damage_boxes(img_array, scene)
        boxes[0]["confidence"] = confidence
    else:
        height, width = img_array.shape[:2]
        bw, bh = width * 0.35, height * 0.35
        x1, y1 = (width - bw) / 2, (height - bh) / 2
        boxes = [
            {
                "x1": round(x1, 2),
                "y1": round(y1, 2),
                "x2": round(x1 + bw, 2),
                "y2": round(y1 + bh, 2),
                "class": primary,
                "civic_class": primary,
                "confidence": confidence,
            }
        ]
    return boxes, primary, confidence, scene


def correct_garbage_as_road_damage(
    boxes: list[dict[str, Any]],
    img_array: np.ndarray,
    scene: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], str | None, str | None]:
    """
    Post-process: if detections are 'garbage' but the scene looks like
    asphalt + depression / standing water / debris-in-hole → remapped to pothole.
    """
    scene = scene or analyze_road_scene(img_array)
    note = None

    looks_like_road_damage = (
        scene["asphalt_score"] >= 0.4
        and scene["pothole_score"] >= 0.32
    ) or (
        scene["asphalt_score"] >= 0.35
        and scene["wet_ratio"] >= 0.04
        and scene["pothole_score"] >= 0.25
    )

    if not looks_like_road_damage:
        return boxes, None, None

    if not boxes:
        boxes = road_damage_boxes(img_array, scene)
        note = (
            "No civic COCO objects found; road-damage analysis labeled scene as pothole."
        )
        return boxes, "pothole", note

    remapped = 0
    for b in boxes:
        if b.get("civic_class") == "garbage":
            b["civic_class"] = "pothole"
            b["class"] = "pothole"
            b["confidence"] = round(
                max(float(b.get("confidence", 0.4)), 0.45 + scene["pothole_score"] * 0.4),
                4,
            )
            remapped += 1
        # Water blobs on asphalt → pothole (filled cavity), not water_leakage
        elif (
            b.get("civic_class") == "water_leakage"
            and scene["asphalt_score"] >= 0.4
            and scene["pothole_score"] >= scene["water_leakage_score"]
        ):
            b["civic_class"] = "pothole"
            b["class"] = "pothole"
            remapped += 1

    if remapped:
        note = (
            f"Remapped {remapped} detection(s) from garbage/water_leakage → pothole "
            f"(asphalt={scene['asphalt_score']}, pothole={scene['pothole_score']}, "
            f"wet={scene['wet_ratio']})."
        )
        return boxes, "pothole", note

    # YOLO boxes exist but none are garbage; still prefer pothole as primary
    # when road damage dominates and current primary would be weak garbage score
    return boxes, "pothole" if scene["pothole_score"] >= 0.45 else None, note


def yolo_detect(img_array: np.ndarray) -> tuple[list[dict[str, Any]], dict[str, float]]:
    results = model.predict(source=img_array, conf=0.25, verbose=False)
    result = results[0]
    boxes: list[dict[str, Any]] = []
    civic_scores: dict[str, float] = {c: 0.0 for c in CIVIC_CATEGORIES}
    names = result.names or MODEL_NAMES or {}

    if result.boxes is not None and len(result.boxes) > 0:
        for box in result.boxes:
            xyxy = box.xyxy[0].tolist()
            conf = float(box.conf[0].item())
            cls_id = int(box.cls[0].item())
            civic, class_name = map_class_index_to_civic(cls_id, names)
            if civic is None:
                continue
            entry = {
                "x1": round(xyxy[0], 2),
                "y1": round(xyxy[1], 2),
                "x2": round(xyxy[2], 2),
                "y2": round(xyxy[3], 2),
                "class": class_name,
                "civic_class": civic,
                "confidence": round(conf, 4),
                "class_id": cls_id,
            }
            boxes.append(entry)
            civic_scores[civic] = max(civic_scores[civic], conf)

    return boxes, civic_scores


def pick_primary(
    boxes: list[dict[str, Any]],
    civic_scores: dict[str, float] | None = None,
    force_primary: str | None = None,
) -> tuple[str, float]:
    if force_primary:
        confs = [
            float(b["confidence"])
            for b in boxes
            if b.get("civic_class") == force_primary
        ]
        return force_primary, round(max(confs) if confs else 0.5, 4)

    if civic_scores and any(civic_scores.values()):
        primary = max(civic_scores, key=civic_scores.get)
        return primary, round(float(civic_scores[primary]), 4)

    if boxes:
        best = max(boxes, key=lambda b: float(b.get("confidence", 0)))
        return str(best["civic_class"]), round(float(best["confidence"]), 4)

    return "pothole", 0.2


@app.get("/")
async def root() -> dict[str, Any]:
    return {
        "service": "CivicAI Detection Service",
        "status": "running",
        "model": "heuristic" if USE_HEURISTIC else "yolov8",
        "classes": CIVIC_CATEGORIES,
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "model_loaded": (not USE_HEURISTIC and model is not None) or USE_HEURISTIC,
        "mode": "heuristic" if USE_HEURISTIC else "yolov8",
        "categories": CIVIC_CATEGORIES,
        "label_map": str(LABEL_MAP_FILE.name),
        "classes_file": str(CLASSES_FILE.name),
    }


@app.post("/detect")
async def detect(
    image: UploadFile = File(..., description="Image file to analyze"),
    recurrence_count: int = Form(0, description="Prior reports of same issue nearby"),
    unresolved_days: float = Form(
        0.0, description="Days the issue has remained unresolved"
    ),
) -> dict[str, Any]:
    if not USE_HEURISTIC and model is None:
        raise HTTPException(status_code=503, detail="YOLO model is not loaded")

    content_type = image.content_type or ""
    if content_type and not content_type.startswith("image/"):
        if not content_type.startswith("application/octet-stream"):
            raise HTTPException(status_code=400, detail="Uploaded file must be an image")

    try:
        raw = await image.read()
        if not raw:
            raise HTTPException(status_code=400, detail="Empty image file")

        pil_image = Image.open(io.BytesIO(raw)).convert("RGB")
        img_array = np.array(pil_image)
        height, width = img_array.shape[:2]
        image_area = float(width * height)

        notes: list[str] = []
        scene = analyze_road_scene(img_array)

        if USE_HEURISTIC:
            boxes, primary_issue, confidence, scene = heuristic_detect(img_array)
            notes.append(
                "Heuristic/road-damage mode (YOLOv8 unavailable). "
                "Place fine-tuned weights at models/civicai-yolov8n.pt for production."
            )
        else:
            boxes, civic_scores = yolo_detect(img_array)
            boxes, forced, remap_note = correct_garbage_as_road_damage(
                boxes, img_array, scene
            )
            if remap_note:
                notes.append(remap_note)

            # Rebuild scores after remapping
            civic_scores = {c: 0.0 for c in CIVIC_CATEGORIES}
            for b in boxes:
                c = b["civic_class"]
                civic_scores[c] = max(civic_scores[c], float(b["confidence"]))

            if not boxes:
                # Scene-aware fallback (never blind-default to garbage OR pothole)
                boxes, primary_issue, confidence, scene = heuristic_detect(img_array)
                notes.append(
                    f"No mappable COCO detections; scene-aware fallback → {primary_issue} "
                    f"(asphalt={scene['asphalt_score']}, pothole={scene['pothole_score']}, "
                    f"garbage={scene['garbage_score']})."
                )
            else:
                primary_issue, confidence = pick_primary(
                    boxes, civic_scores, force_primary=forced
                )
                # Final safeguard: never keep garbage as primary on strong road damage
                if (
                    primary_issue == "garbage"
                    and scene["asphalt_score"] >= 0.4
                    and scene["pothole_score"] >= 0.3
                ):
                    boxes, _, extra = correct_garbage_as_road_damage(
                        boxes, img_array, scene
                    )
                    if extra:
                        notes.append(extra)
                    primary_issue, confidence = "pothole", round(
                        max(float(b["confidence"]) for b in boxes), 4
                    )
                    notes.append(
                        "Primary issue overridden garbage → pothole (road-damage cues)."
                    )

        severity_payload = compute_severity(
            primary_issue,
            boxes,
            image_area,
            recurrence_count,
            unresolved_days,
        )

        payload: dict[str, Any] = {
            "success": True,
            "detections": boxes,
            "primary_issue": primary_issue,
            "confidence": confidence,
            "severity_score": severity_payload["severity_score"],
            "severity_level": severity_payload["severity_level"],
            "explainable_factors": severity_payload["explainable_factors"],
            "image_size": {"width": width, "height": height},
            "detection_count": len(boxes),
            "mode": "heuristic" if USE_HEURISTIC else "yolov8",
            "scene_scores": {
                "asphalt": scene["asphalt_score"],
                "pothole": scene["pothole_score"],
                "garbage": scene["garbage_score"],
                "wet_ratio": scene["wet_ratio"],
            },
        }
        if notes:
            payload["note"] = " ".join(notes)
        return payload

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Detection failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Detection failed: {exc}") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
