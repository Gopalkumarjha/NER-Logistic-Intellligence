"""
Flask ML microservice for SIH26002.
Trains a RandomForestClassifier on a PROTOTYPE/SYNTHETIC dataset at startup
and serves predictions at POST /api/risk/predict.

Run: python app.py   (listens on http://localhost:8001)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from model import train_model, predict_risk, FEATURE_NAMES

app = Flask(__name__)
CORS(app)

print("🌲 Training Random Forest model on PROTOTYPE/SYNTHETIC dataset...")
MODEL = train_model()
print("✅ Model trained and ready.")


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model_loaded": MODEL is not None})


@app.route("/api/risk/predict", methods=["POST"])
def predict():
    try:
        body = request.get_json(force=True, silent=True) or {}

        features = {}
        for name in FEATURE_NAMES:
            value = body.get(name, 0)
            try:
                features[name] = float(value)
            except (TypeError, ValueError):
                return jsonify({"error": f"Invalid value for feature '{name}'."}), 400

        result = predict_risk(MODEL, features)
        result["data_source"] = "Prototype/Synthetic Dataset (SIH26002 demo) — not real historical data"
        result["model"] = "RandomForestClassifier (scikit-learn)"

        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": f"ML prediction failed: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8001, debug=False)
