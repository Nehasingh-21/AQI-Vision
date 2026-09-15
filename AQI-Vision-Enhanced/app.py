"""
AQI Vision — Enhanced
A self-contained Flask application that predicts Air Quality Index (AQI),
gives a 7-day forecast, ranks cities, compares two cities side by side,
renders a monthly calendar heatmap, translates predictions into
plain-language health guidance, and answers questions through a
lightweight rule-based assistant.

NOTE ON DATA
------------
This build ships with a deterministic *synthetic* AQI generator so the whole
project runs standalone with zero external downloads. The generator encodes
realistic patterns (winter spikes from temperature inversion & stubble
burning, monsoon-season lows, weekday/weekend traffic effects) so the demo
behaves sensibly. If you have a real historical AQI CSV (city, date, AQI,
pollutant columns), drop it in `data/real_aqi.csv` and set
USE_REAL_DATA = True below — the app will use it instead.
"""

import math
import random
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
from flask import Flask, jsonify, render_template, request
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import LabelEncoder

app = Flask(__name__)

# ----------------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------------
USE_REAL_DATA = False  # flip to True if you supply data/real_aqi.csv
RANDOM_SEED = 42

CITIES = [
    "Delhi", "Mumbai", "Bengaluru", "Kolkata", "Chennai",
    "Hyderabad", "Ahmedabad", "Pune", "Jaipur", "Lucknow",
    "Patna", "Kanpur",
]

CITY_BASELINE = {
    "Delhi": 210, "Kanpur": 190, "Lucknow": 175, "Patna": 180,
    "Jaipur": 150, "Ahmedabad": 140, "Kolkata": 155, "Mumbai": 120,
    "Hyderabad": 110, "Pune": 105, "Chennai": 95, "Bengaluru": 85,
}

AQI_CATEGORIES = [
    (0, 50, "Good", "#4CAF50",
     "Air quality is satisfactory. Enjoy usual outdoor activities."),
    (51, 100, "Satisfactory", "#8BC34A",
     "Air quality is acceptable. Unusually sensitive people should consider "
     "reducing prolonged outdoor exertion."),
    (101, 200, "Moderate", "#FFC107",
     "Breathing discomfort possible for people with lung disease, children "
     "and older adults. Limit prolonged outdoor exertion."),
    (201, 300, "Poor", "#FF7043",
     "Breathing discomfort likely for most people on prolonged exposure. "
     "Sensitive groups should avoid outdoor exertion."),
    (301, 400, "Very Poor", "#E53935",
     "Health warning: everyone may experience health effects. Avoid "
     "outdoor activity; sensitive groups should stay indoors."),
    (401, 500, "Severe", "#7B1FA2",
     "Health alert: serious risk for everyone. Avoid all outdoor "
     "exertion; keep windows closed and use an air purifier if possible."),
]


def categorize_aqi(value: float):
    value = max(0, min(500, value))
    for low, high, label, color, advice in AQI_CATEGORIES:
        if low <= value <= high:
            return {"label": label, "color": color, "advice": advice,
                     "range": f"{low}-{high}"}
    return {"label": "Severe", "color": "#7B1FA2",
            "advice": AQI_CATEGORIES[-1][4], "range": "401-500"}


def sensitive_group_note(category_label: str):
    notes = {
        "Good": "No precautions needed for anyone, including children, "
                "the elderly, and people with asthma or heart conditions.",
        "Satisfactory": "People with respiratory conditions may notice mild "
                         "symptoms during heavy exertion outdoors.",
        "Moderate": "Children, elderly people, and those with asthma or "
                    "heart disease should reduce heavy outdoor exertion.",
        "Poor": "People with lung or heart disease, children, and older "
                "adults should avoid prolonged outdoor exertion; consider "
                "an N95 mask outdoors.",
        "Very Poor": "Sensitive groups should stay indoors and keep "
                     "activity levels low. Others should minimise time "
                     "outdoors and wear a mask if going out.",
        "Severe": "Everyone should avoid outdoor physical activity. "
                  "Sensitive groups should remain indoors with air "
                  "purification where possible.",
    }
    return notes.get(category_label, notes["Moderate"])


# ----------------------------------------------------------------------
# SYNTHETIC DATA GENERATION  (deterministic — same data every run)
# ----------------------------------------------------------------------
def generate_synthetic_dataset(start_year=2022, days=1095):
    rng = np.random.default_rng(RANDOM_SEED)
    start_date = datetime(start_year, 1, 1)
    rows = []
    for city in CITIES:
        base = CITY_BASELINE[city]
        for d in range(days):
            date = start_date + timedelta(days=d)
            day_of_year = date.timetuple().tm_yday
            seasonal = 70 * math.cos(2 * math.pi * (day_of_year - 15) / 365)
            monsoon_month = date.month in (6, 7, 8, 9)
            monsoon_effect = -35 if monsoon_month else 0
            weekday_effect = -8 if date.weekday() >= 5 else 5
            noise = rng.normal(0, 18)
            aqi = base + seasonal + monsoon_effect + weekday_effect + noise
            aqi = float(np.clip(aqi, 15, 480))
            rows.append({"City": city, "Date": date.strftime("%Y-%m-%d"),
                          "AQI": round(aqi, 1)})
    return pd.DataFrame(rows)


def attach_pollutants(df: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(RANDOM_SEED + 1)
    ratios = {"PM2.5": 0.55, "PM10": 0.85, "NO2": 0.30,
              "SO2": 0.12, "CO": 0.018, "O3": 0.28}
    for pollutant, ratio in ratios.items():
        jitter = rng.normal(1.0, 0.12, size=len(df))
        df[pollutant] = np.round(np.clip(df["AQI"] * ratio * jitter, 1, None), 1)
    return df


if USE_REAL_DATA:
    reference_data = pd.read_csv("data/real_aqi.csv")
    reference_data["Date"] = pd.to_datetime(reference_data["Date"]).dt.strftime("%Y-%m-%d")
else:
    reference_data = attach_pollutants(generate_synthetic_dataset())

reference_data["DateObj"] = pd.to_datetime(reference_data["Date"])
MIN_DATE = reference_data["DateObj"].min().strftime("%Y-%m-%d")
MAX_DATE = reference_data["DateObj"].max().strftime("%Y-%m-%d")

# ----------------------------------------------------------------------
# MODEL TRAINING  (fast, lightweight — trained once at startup)
# ----------------------------------------------------------------------
city_encoder = LabelEncoder()
reference_data["CityCode"] = city_encoder.fit_transform(reference_data["City"])
reference_data["DOY"] = reference_data["DateObj"].dt.dayofyear
reference_data["Month"] = reference_data["DateObj"].dt.month
reference_data["DOW"] = reference_data["DateObj"].dt.dayofweek
reference_data["Year"] = reference_data["DateObj"].dt.year

FEATURES = ["CityCode", "DOY", "Month", "DOW", "Year"]
X = reference_data[FEATURES]
y = reference_data["AQI"]

MODELS = {
    "Linear Regression": LinearRegression().fit(X, y),
    "Random Forest": RandomForestRegressor(
        n_estimators=120, max_depth=10, random_state=RANDOM_SEED, n_jobs=-1
    ).fit(X, y),
    "Gradient Boosting": GradientBoostingRegressor(
        n_estimators=150, max_depth=3, random_state=RANDOM_SEED
    ).fit(X, y),
}


def build_features(city: str, date_str: str) -> pd.DataFrame:
    date = pd.to_datetime(date_str)
    return pd.DataFrame([{
        "CityCode": city_encoder.transform([city])[0],
        "DOY": date.dayofyear, "Month": date.month,
        "DOW": date.dayofweek, "Year": date.year,
    }])


def predict_aqi(city: str, date_str: str, model_name: str) -> float:
    model = MODELS.get(model_name, MODELS["Random Forest"])
    feats = build_features(city, date_str)
    pred = float(model.predict(feats)[0])
    return round(float(np.clip(pred, 5, 500)), 1)


def estimate_pollutants(aqi: float):
    rng = random.Random(int(aqi * 97))
    ratios = {"PM2.5": 0.55, "PM10": 0.85, "NO2": 0.30,
              "SO2": 0.12, "CO": 0.018, "O3": 0.28}
    return {p: round(max(1.0, aqi * r * rng.uniform(0.9, 1.1)), 1)
             for p, r in ratios.items()}


def _batch_predict(rows: pd.DataFrame, model_name: str):
    """rows must contain columns: City, Date. Returns list of AQI floats."""
    model = MODELS.get(model_name, MODELS["Random Forest"])
    dates = pd.to_datetime(rows["Date"])
    feats = pd.DataFrame({
        "CityCode": city_encoder.transform(rows["City"]),
        "DOY": dates.dt.dayofyear, "Month": dates.dt.month,
        "DOW": dates.dt.dayofweek, "Year": dates.dt.year,
    })
    preds = model.predict(feats[FEATURES])
    return np.clip(preds, 5, 500).round(1).tolist()


# ----------------------------------------------------------------------
# ROUTES
# ----------------------------------------------------------------------
@app.route("/")
def index():
    return render_template(
        "index.html", cities=CITIES, models=list(MODELS.keys()),
        min_date=MIN_DATE, max_date=MAX_DATE,
    )


@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(force=True)
    city = data.get("city")
    date_str = data.get("date")
    model_name = data.get("model", "Random Forest")

    if city not in CITIES:
        return jsonify({"error": "Unknown city."}), 400
    try:
        pd.to_datetime(date_str)
    except Exception:
        return jsonify({"error": "Invalid date."}), 400

    aqi = predict_aqi(city, date_str, model_name)
    category = categorize_aqi(aqi)
    pollutants = estimate_pollutants(aqi)

    return jsonify({
        "city": city, "date": date_str, "model": model_name, "aqi": aqi,
        "category": category,
        "sensitiveGroupNote": sensitive_group_note(category["label"]),
        "pollutants": pollutants,
    })


@app.route("/forecast", methods=["POST"])
def forecast():
    data = request.get_json(force=True)
    city = data.get("city")
    start_date = data.get("date")
    model_name = data.get("model", "Random Forest")

    if city not in CITIES:
        return jsonify({"error": "Unknown city."}), 400
    try:
        base_date = pd.to_datetime(start_date)
    except Exception:
        return jsonify({"error": "Invalid date."}), 400

    date_list = [(base_date + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
    rows = pd.DataFrame({"City": [city] * 7, "Date": date_list})
    preds = _batch_predict(rows, model_name)

    days_out = []
    for d, aqi in zip(date_list, preds):
        cat = categorize_aqi(aqi)
        days_out.append({"date": d, "aqi": aqi, "label": cat["label"], "color": cat["color"]})
    return jsonify({"city": city, "forecast": days_out})


@app.route("/history/<city>")
def history(city):
    if city not in CITIES:
        return jsonify({"error": "Unknown city."}), 400
    subset = reference_data[reference_data["City"] == city].sort_values("DateObj")
    tail = subset.tail(30)
    return jsonify({"city": city, "dates": tail["Date"].tolist(),
                     "aqi": tail["AQI"].round(1).tolist()})


@app.route("/seasonal/<city>")
def seasonal(city):
    """Weekday pattern + monthly (seasonal) pattern computed from historical data."""
    if city not in CITIES:
        return jsonify({"error": "Unknown city."}), 400
    subset = reference_data[reference_data["City"] == city]
    weekday_avg = subset.groupby("DOW")["AQI"].mean().reindex(range(7)).round(1).fillna(0).tolist()
    monthly_avg = subset.groupby("Month")["AQI"].mean().reindex(range(1, 13)).round(1).fillna(0).tolist()
    return jsonify({"city": city, "weekdayAvg": weekday_avg, "monthlyAvg": monthly_avg})


@app.route("/rankings", methods=["POST"])
def rankings():
    data = request.get_json(force=True)
    date_str = data.get("date")
    model_name = data.get("model", "Random Forest")
    try:
        pd.to_datetime(date_str)
    except Exception:
        return jsonify({"error": "Invalid date."}), 400

    rows = pd.DataFrame({"City": CITIES, "Date": [date_str] * len(CITIES)})
    preds = _batch_predict(rows, model_name)

    result = []
    for city, aqi in zip(CITIES, preds):
        cat = categorize_aqi(aqi)
        result.append({"city": city, "aqi": aqi, "label": cat["label"], "color": cat["color"]})
    result.sort(key=lambda r: r["aqi"], reverse=True)
    for i, r in enumerate(result, start=1):
        r["rank"] = i
    return jsonify({"date": date_str, "rankings": result})


@app.route("/compare", methods=["POST"])
def compare():
    data = request.get_json(force=True)
    city_a = data.get("cityA")
    city_b = data.get("cityB")
    date_str = data.get("date")
    model_name = data.get("model", "Random Forest")

    if city_a not in CITIES or city_b not in CITIES:
        return jsonify({"error": "Unknown city."}), 400
    try:
        pd.to_datetime(date_str)
    except Exception:
        return jsonify({"error": "Invalid date."}), 400

    def build(city):
        aqi = predict_aqi(city, date_str, model_name)
        cat = categorize_aqi(aqi)
        return {"city": city, "aqi": aqi, "label": cat["label"], "color": cat["color"],
                "pollutants": estimate_pollutants(aqi)}

    return jsonify({"date": date_str, "a": build(city_a), "b": build(city_b)})


@app.route("/calendar", methods=["POST"])
def calendar():
    data = request.get_json(force=True)
    city = data.get("city")
    year = int(data.get("year"))
    month = int(data.get("month"))
    model_name = data.get("model", "Random Forest")

    if city not in CITIES:
        return jsonify({"error": "Unknown city."}), 400

    start = datetime(year, month, 1)
    end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    num_days = (end - start).days

    date_list = [(start + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(num_days)]
    rows = pd.DataFrame({"City": [city] * num_days, "Date": date_list})
    preds = _batch_predict(rows, model_name)

    days = []
    for date_str, aqi in zip(date_list, preds):
        cat = categorize_aqi(aqi)
        days.append({"date": date_str, "aqi": aqi, "label": cat["label"],
                      "color": cat["color"], "weekday": pd.to_datetime(date_str).weekday()})
    return jsonify({"city": city, "year": year, "month": month, "days": days})


# ----------------------------------------------------------------------
# CHATBOT  (lightweight rule/keyword based — no external NLP dependency)
# ----------------------------------------------------------------------
FAQ_RULES = [
    (["hi", "hello", "hey", "namaste"],
     "Hello! I'm the AQI Vision assistant. Ask me about AQI values, "
     "pollutants, or health precautions — or ask 'AQI in <city>'."),
    (["pm2.5", "pm 2.5"],
     "PM2.5 refers to fine particulate matter under 2.5 microns wide — "
     "small enough to enter the bloodstream through the lungs. It's the "
     "pollutant most strongly linked to respiratory and heart disease."),
    (["pm10", "pm 10"],
     "PM10 is coarse particulate matter under 10 microns — dust, pollen "
     "and construction debris. It irritates the eyes, nose and throat."),
    (["no2", "nitrogen"],
     "NO2 (nitrogen dioxide) mainly comes from vehicle exhaust and power "
     "plants. It can inflame the airways and worsen asthma."),
    (["co", "carbon monoxide"],
     "CO (carbon monoxide) is a colourless gas from incomplete combustion "
     "(traffic, fires). It reduces the blood's oxygen-carrying capacity."),
    (["so2", "sulphur", "sulfur"],
     "SO2 (sulphur dioxide) comes largely from burning coal and diesel. "
     "It irritates the respiratory tract and can trigger asthma attacks."),
    (["o3", "ozone"],
     "Ground-level O3 (ozone) forms when sunlight reacts with pollutants "
     "from vehicles and industry. It's highest on hot, sunny afternoons."),
    (["mask", "n95"],
     "An N95 or equivalent mask filters fine particles effectively and is "
     "recommended when AQI crosses 'Poor' (>200), especially outdoors."),
    (["good", "safe", "healthy air"],
     "AQI 0-50 is 'Good' — air quality poses little or no risk."),
    (["severe", "hazardous", "worst"],
     "AQI 401-500 is 'Severe' — a health emergency. Everyone should avoid "
     "outdoor exertion and stay indoors with air purification if possible."),
    (["category", "categories", "scale", "range"],
     "The AQI scale has six categories: Good (0-50), Satisfactory "
     "(51-100), Moderate (101-200), Poor (201-300), Very Poor (301-400) "
     "and Severe (401-500)."),
    (["rank", "ranking", "worst city", "cleanest"],
     "Open the 'City Rankings' tab to see every city sorted from worst to "
     "best AQI for any date you choose."),
    (["compare"],
     "Open the 'Compare Cities' tab to see two cities side by side, "
     "including their pollutant breakdowns."),
    (["thank", "thanks"],
     "Happy to help! Stay safe out there."),
]


def chatbot_reply(message: str) -> str:
    text = message.lower().strip()
    for city in CITIES:
        if city.lower() in text:
            latest_row = (reference_data[reference_data["City"] == city]
                          .sort_values("DateObj").iloc[-1])
            cat = categorize_aqi(latest_row["AQI"])
            return (f"The most recent recorded AQI for {city} is "
                     f"{latest_row['AQI']:.0f} ({cat['label']}). {cat['advice']}")

    for keywords, reply in FAQ_RULES:
        if any(k in text for k in keywords):
            return reply

    return ("I can answer questions about AQI categories, pollutants "
            "(PM2.5, PM10, NO2, SO2, CO, O3), precautions, or the latest "
            "AQI for a specific city — try asking 'AQI in Delhi'.")


@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(force=True)
    message = data.get("message", "")
    return jsonify({"reply": chatbot_reply(message)})


if __name__ == "__main__":
    app.run(debug=True)
