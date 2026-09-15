# 🌫️ AQI Vision — Enhanced

### AI-Driven Air Quality Observatory with Forecasting, Comparison, Rankings, a Calendar Heatmap & a Live Assistant

AQI Vision (Enhanced) is a self-contained Flask + Machine Learning web app
that predicts the Air Quality Index (AQI) for Indian cities, forecasts the
coming week, ranks every city, compares two cities side by side, visualises
a full month as a heatmap calendar, and answers questions through a
built-in assistant — all inside one interactive dashboard.

---

## ⚙️ Features

### 🌡️ Live Reading tab
- Instrument-style **gauge dial** with an animated needle and count-up number
- Plain-language **health advisory** for every prediction, plus a specific
  note for sensitive groups (children, elderly, asthma/heart conditions)
- **Pollutant breakdown** cards (PM2.5, PM10, NO2, SO2, CO, O3) with animated bars
- **7-day forecast chart** — the model projects the week ahead
- **30-day history chart** for the selected city
- An **ambient particle background** that reacts live to the current AQI —
  the haze gets denser and changes colour as air quality worsens

### ⚖️ Compare Cities tab
- Pick any two cities and a date to see AQI, category and pollutant levels
  side by side, including a comparison bar chart

### 🏆 City Rankings tab
- Every city ranked from worst to best AQI for any date you choose
- Live **search filter**, animated ranking bars, and medal-style badges for
  the top 3 worst-affected cities
- Click any row to jump straight into the Live Reading tab with that city preselected

### 📅 Monthly Calendar tab
- A full month rendered as a **colour-coded heatmap**, one cell per day
- Hover a day for an exact AQI tooltip; click a day to load it into Live Reading
- Month navigation (◀ ▶) to browse forward/backward in time

### 💬 Station Assistant (chatbot)
- Rule-based assistant that explains pollutants, AQI categories, and
  precautions, and can answer "AQI in `<city>`"
- Typing indicator, quick-reply suggestion chips, and message animations

### Other interactive touches
- Live **scrolling ticker** across the top showing every city's current AQI
- **Toast notifications** for key actions
- Smooth tab transitions, hover states, and animated chart transitions throughout

### 🕸️ Pollutant radar ("pollution fingerprint")
- Every reading also renders a radar/spider chart of all six pollutants,
  scaled relative to their typical range — an at-a-glance shape for "what
  kind" of pollution a city is facing that day

### 🗺️ Map View tab
- All 12 cities plotted on an illustrative map of India, colour-coded and
  pulsing by current AQI severity for the chosen date
- Click any marker to jump straight into a full reading for that city

### 🧪 What-If Lab tab
- Interactive sliders for all six pollutants
- Recomputes the overall AQI live using the same **sub-index method India's
  real AQI standard uses** — the single worst pollutant determines the
  category, not an average
- A bar chart shows every pollutant's sub-index so you can see exactly
  which one is "driving" the number

### 📆 Seasonal Patterns tab
- **Weekday pattern** bar chart — average AQI by day of week for any city
- **Monthly seasonal pattern** as a polar-area chart — visualises winter
  spikes vs. monsoon relief across the whole year in one circular view

### 📷 Downloadable report card
- One click captures the current reading (gauge, category, advisory) as a
  shareable PNG image — handy for presentations or WhatsApp-ing a friend

### 🔔 Smart threshold alerts
- Toggle on notifications and set an AQI threshold — if a reading crosses
  it, you get a real browser notification (or an in-app toast as a
  fallback) without needing any backend push infrastructure

---

## 📌 Important note about the data

This build ships with a **deterministic synthetic AQI generator** so it runs
completely standalone — no external dataset download required. The generator
encodes realistic patterns (winter pollution spikes, monsoon relief,
weekday/weekend traffic effects) so the demo behaves sensibly for every city
and date.

If you'd like to use **your original historical AQI dataset** instead:

1. Export it as a CSV with at minimum the columns `City`, `Date`, `AQI`
   (extra pollutant columns are fine).
2. Save it as `data/real_aqi.csv`.
3. In `app.py`, set:
   ```python
   USE_REAL_DATA = True
   ```
4. Restart the app.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python, Flask |
| **Machine Learning** | scikit-learn (Linear Regression, Random Forest, Gradient Boosting) |
| **Data Handling** | Pandas, NumPy |
| **Frontend** | HTML, CSS, vanilla JavaScript, Chart.js, HTML5 Canvas (particles) |

No TensorFlow/Keras — kept intentionally lightweight so `pip install` finishes
in seconds and the app starts instantly.

---

## 🖥️ Installation & Setup

```bash
# 1. Open this folder in VS Code, then in the terminal:
pip install -r requirements.txt

# 2. Run the app
python app.py
```

Then open your browser and visit:

```
http://127.0.0.1:5000
```

---

## 📂 Project Structure

```
AQI-Vision-Enhanced/
├── app.py                 → Flask backend: data, models, all routes, chatbot logic
├── requirements.txt        → Python dependencies
├── data/                    → (optional) place real_aqi.csv here
├── static/
│   ├── css/style.css        → Design system (observatory console theme)
│   └── js/script.js          → Tabs, gauge, particles, charts, chatbot, all interactivity
└── templates/
    └── index.html             → Main dashboard page (4 tabs)
```

---

## 🚀 API Routes (for reference)

| Route | Method | Purpose |
|---|---|---|
| `/` | GET | Renders the dashboard |
| `/predict` | POST | Predicts AQI for a city/date/model |
| `/forecast` | POST | 7-day AQI forecast for a city |
| `/history/<city>` | GET | Last 30 recorded days for a city |
| `/rankings` | POST | All cities ranked by AQI for a date |
| `/compare` | POST | Two cities' AQI & pollutants side by side |
| `/calendar` | POST | A full month of AQI, one value per day |
| `/chat` | POST | Rule-based assistant reply |
| `/seasonal/<city>` | GET | Weekday & monthly average AQI for a city |

---

## 💡 Talking points for your presentation / interview

- "Beyond a single prediction, the system ranks all cities, compares any
  two, and visualises a full month as a heatmap — turning one model into
  several different analytical views."
- "Every prediction is translated into actionable health guidance for
  different risk groups, not just a number."
- "The 7-day forecast demonstrates the model generalising to unseen future
  dates rather than looking up historical records."
- "The assistant is a lightweight rule-based system — a deliberate choice
  to keep the app dependency-free and instant to start, while still
  answering the questions users actually ask."
- "The interface uses count-up animations, an ambient particle layer tied
  to live AQI severity, and smooth tab transitions to make a data-heavy
  dashboard feel alive rather than static."

---

## 👨‍💻 Author

Made with dedication as a final year B.Tech project.

## ⭐ Support

If you found this project useful, consider giving it a ⭐ on GitHub!
