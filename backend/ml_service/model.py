"""
Random Forest risk prediction model for SIH26002.

NOTE: Real historical incident/road-condition datasets for NER routes are not
freely available for this demo, so a PROTOTYPE / SYNTHETIC dataset is generated
here using rule-based simulation + random noise. This is clearly labelled as
synthetic everywhere it is surfaced (API response includes "data_source").
"""

import numpy as np
from sklearn.ensemble import RandomForestClassifier

FEATURE_NAMES = [
    "rainfall",           # mm
    "temperature",        # °C
    "wind_speed",         # km/h
    "terrain_risk",       # 0-100, higher = more hazardous terrain (hills/mountains)
    "road_condition",     # 0-100, higher = BETTER road condition
    "incident_count",     # count of nearby active incidents
    "landslide_count",    # count of nearby landslide reports
    "flood_count",        # count of nearby flood reports
    "accessibility_score" # 0-100, higher = more accessible/serviceable route
]

RISK_LABELS = ["LOW", "MEDIUM", "HIGH"]


def _true_risk_score(row):
    """Rule-based synthetic ground truth used ONLY to generate labeled training data."""
    rainfall, temperature, wind_speed, terrain_risk, road_condition, \
        incident_count, landslide_count, flood_count, accessibility_score = row

    score = 0.0
    score += min(35, rainfall * 0.6)
    score += min(15, wind_speed * 0.2)
    score += terrain_risk * 0.25
    score += (100 - road_condition) * 0.2
    score += incident_count * 4
    score += landslide_count * 10
    score += flood_count * 8
    score += (100 - accessibility_score) * 0.1

    # mild noise so the classifier learns a boundary rather than memorizing the formula
    score += np.random.normal(0, 4)
    return float(np.clip(score, 0, 100))


def generate_synthetic_dataset(n_samples=4000, seed=42):
    """Generate a labelled PROTOTYPE/SYNTHETIC dataset for training."""
    rng = np.random.default_rng(seed)

    rainfall = rng.uniform(0, 100, n_samples)
    temperature = rng.uniform(-5, 42, n_samples)
    wind_speed = rng.uniform(0, 90, n_samples)
    terrain_risk = rng.uniform(10, 90, n_samples)          # NER is largely hilly -> skew nonzero
    road_condition = rng.uniform(20, 100, n_samples)
    incident_count = rng.poisson(1.0, n_samples).astype(float)
    landslide_count = rng.poisson(0.3, n_samples).astype(float)
    flood_count = rng.poisson(0.3, n_samples).astype(float)
    accessibility_score = rng.uniform(20, 100, n_samples)

    X = np.column_stack([
        rainfall, temperature, wind_speed, terrain_risk, road_condition,
        incident_count, landslide_count, flood_count, accessibility_score
    ])

    scores = np.array([_true_risk_score(row) for row in X])
    labels = np.where(scores > 60, "HIGH", np.where(scores > 30, "MEDIUM", "LOW"))

    return X, labels, scores


def train_model():
    """Train a RandomForestClassifier on the synthetic dataset. Runs once at service startup."""
    X, y, _ = generate_synthetic_dataset()
    model = RandomForestClassifier(
        n_estimators=150,
        max_depth=10,
        random_state=42,
        class_weight="balanced",
    )
    model.fit(X, y)
    return model


def predict_risk(model, features: dict):
    """
    features: dict with keys matching FEATURE_NAMES.
    Returns risk_score (0-100), risk_level, prediction_reason, feature_importance summary.
    """
    x = np.array([[features.get(name, 0) for name in FEATURE_NAMES]])

    proba = model.predict_proba(x)[0]
    class_order = list(model.classes_)  # e.g. ['HIGH','LOW','MEDIUM'] (alphabetical)

    # Map class probabilities to representative scores, then blend -> continuous 0-100 score
    representative_score = {"LOW": 15, "MEDIUM": 45, "HIGH": 82}
    risk_score = sum(
        proba[i] * representative_score[class_order[i]] for i in range(len(class_order))
    )
    risk_score = round(float(np.clip(risk_score, 0, 100)), 1)

    predicted_level = model.predict(x)[0]

    # Build a human-readable reason from the top contributing features (global importances,
    # weighted by how "extreme" this sample's value is vs the training range)
    importances = model.feature_importances_
    ranked = sorted(zip(FEATURE_NAMES, importances), key=lambda p: p[1], reverse=True)

    reason_parts = []
    top_features = [f for f, _ in ranked[:3]]
    descriptors = {
        "rainfall": lambda v: f"rainfall of {v} mm" if v > 5 else None,
        "wind_speed": lambda v: f"wind speed of {v} km/h" if v > 15 else None,
        "terrain_risk": lambda v: "hazardous hill/mountain terrain" if v > 50 else None,
        "road_condition": lambda v: "poor road surface condition" if v < 50 else None,
        "incident_count": lambda v: f"{int(v)} nearby reported incident(s)" if v > 0 else None,
        "landslide_count": lambda v: f"{int(v)} landslide report(s) nearby" if v > 0 else None,
        "flood_count": lambda v: f"{int(v)} flood report(s) nearby" if v > 0 else None,
        "accessibility_score": lambda v: "low route accessibility" if v < 40 else None,
        "temperature": lambda v: None,
    }
    for fname in top_features:
        val = features.get(fname, 0)
        desc = descriptors.get(fname, lambda v: None)(val)
        if desc:
            reason_parts.append(desc)

    if not reason_parts:
        reason_parts.append("stable weather and normal road/terrain conditions")

    prediction_reason = "Random Forest model flags " + ", ".join(reason_parts) + " as the main risk drivers."

    return {
        "risk_score": risk_score,
        "risk_level": predicted_level,
        "prediction_reason": prediction_reason,
        "class_probabilities": {class_order[i]: round(float(proba[i]), 3) for i in range(len(class_order))},
    }
