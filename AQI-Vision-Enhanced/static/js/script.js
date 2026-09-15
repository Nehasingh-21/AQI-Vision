// ============================================================
// AQI VISION — frontend logic
// ============================================================

// ---------------- Toasts ----------------
function toast(message) {
  const stack = document.getElementById("toastStack");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ---------------- Category color lookup (mirrors backend) ----------------
const AQI_BANDS = [
  { max: 50, color: "#4CAF50" },
  { max: 100, color: "#8BC34A" },
  { max: 200, color: "#FFC107" },
  { max: 300, color: "#FF7043" },
  { max: 400, color: "#E53935" },
  { max: 500, color: "#7B1FA2" },
];
function colorForAqi(v) {
  for (const b of AQI_BANDS) if (v <= b.max) return b.color;
  return "#7B1FA2";
}

// ---------------- Particle ambient background ----------------
const canvas = document.getElementById("particleCanvas");
const ctx = canvas.getContext("2d");
let particles = [];
let currentSeverityColor = "73,211,200"; // default accent RGB
let particleDensity = 40;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function hexToRgb(hex) {
  const m = hex.replace("#", "");
  const bigint = parseInt(m, 16);
  return `${(bigint >> 16) & 255},${(bigint >> 8) & 255},${bigint & 255}`;
}

function initParticles() {
  particles = Array.from({ length: particleDensity }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 2.4 + 0.6,
    vx: (Math.random() - 0.5) * 0.25,
    vy: Math.random() * 0.25 + 0.05,
    o: Math.random() * 0.5 + 0.15,
  }));
}
initParticles();

function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
    if (p.x < 0) p.x = canvas.width;
    if (p.x > canvas.width) p.x = 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${currentSeverityColor}, ${p.o})`;
    ctx.fill();
  }
  requestAnimationFrame(animateParticles);
}
animateParticles();

function updateAmbience(aqiValue) {
  const color = colorForAqi(aqiValue);
  currentSeverityColor = hexToRgb(color);
  // worse air -> denser, slower-drifting haze
  const targetDensity = Math.round(30 + (aqiValue / 500) * 70);
  if (Math.abs(targetDensity - particles.length) > 5) {
    particleDensity = targetDensity;
    initParticles();
  }
}

// ---------------- Tabs ----------------
const tabButtons = document.querySelectorAll(".tab-btn");
tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");

    if (btn.dataset.tab === "rankings" && !rankingsLoadedOnce) loadRankings();
    if (btn.dataset.tab === "calendar" && !calendarLoadedOnce) loadCalendar();
    if (btn.dataset.tab === "map") loadMap();
    if (btn.dataset.tab === "seasonal" && !seasonalLoadedOnce) loadSeasonal();
  });
});

function switchToTab(tabName) {
  document.querySelector(`.tab-btn[data-tab="${tabName}"]`).click();
}

// ---------------- Count-up animation ----------------
function animateCount(el, target, duration = 800) {
  const start = parseFloat(el.dataset.current || "0");
  const startTime = performance.now();
  function step(now) {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = start + (target - start) * eased;
    el.textContent = Math.round(value);
    if (progress < 1) requestAnimationFrame(step);
    else el.dataset.current = target;
  }
  requestAnimationFrame(step);
}

// ============================================================
// TAB: LIVE READING
// ============================================================
const citySelect = document.getElementById("citySelect");
const dateInput = document.getElementById("dateInput");
const modelSelect = document.getElementById("modelSelect");
const predictBtn = document.getElementById("predictBtn");

const gaugeValue = document.getElementById("gaugeValue");
const gaugeNeedle = document.getElementById("gaugeNeedle");
const categoryBadge = document.getElementById("categoryBadge");
const categoryDot = document.getElementById("categoryDot");
const categoryLabel = document.getElementById("categoryLabel");
const readoutMeta = document.getElementById("readoutMeta");
const adviceBox = document.getElementById("adviceBox");
const adviceText = document.getElementById("adviceText");
const sensitiveText = document.getElementById("sensitiveText");
const pollutantGrid = document.getElementById("pollutantGrid");

let forecastChart, historyChart, compareChart;

function setGauge(value) {
  const pct = Math.max(0, Math.min(1, value / 500));
  const angle = pct * 360;
  gaugeNeedle.style.transform = `translate(-50%, -100%) rotate(${angle}deg)`;
  animateCount(gaugeValue, value);
  updateAmbience(value);
}

function renderCategory(category) {
  categoryDot.style.background = category.color;
  categoryBadge.style.borderColor = category.color;
  categoryLabel.textContent = `${category.label} (${category.range})`;
  categoryLabel.style.color = category.color;
}

function renderPollutants(pollutants) {
  pollutantGrid.innerHTML = "";
  const maxScale = { "PM2.5": 300, "PM10": 430, "NO2": 150, "SO2": 60, "CO": 9, "O3": 140 };
  Object.entries(pollutants).forEach(([name, value]) => {
    const card = document.createElement("div");
    card.className = "pollutant-card";
    const pct = Math.min(100, (value / (maxScale[name] || 100)) * 100);
    card.innerHTML = `
      <div class="name">${name}</div>
      <div class="value">${value}</div>
      <div class="bar-track"><div class="bar-fill" style="width:0%"></div></div>
    `;
    pollutantGrid.appendChild(card);
    requestAnimationFrame(() => { card.querySelector(".bar-fill").style.width = pct + "%"; });
  });
  renderRadar(pollutants);
}

let radarChart;
function renderRadar(pollutants) {
  const maxScale = { "PM2.5": 300, "PM10": 430, "NO2": 150, "SO2": 60, "CO": 9, "O3": 140 };
  const labels = Object.keys(pollutants);
  const values = labels.map(k => Math.min(100, (pollutants[k] / (maxScale[k] || 100)) * 100));
  if (radarChart) radarChart.destroy();
  radarChart = new Chart(document.getElementById("radarChart"), {
    type: "radar",
    data: {
      labels,
      datasets: [{
        label: "Relative level", data: values, borderColor: "#49d3c8",
        backgroundColor: "rgba(73,211,200,0.18)", pointBackgroundColor: "#49d3c8",
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          angleLines: { color: "rgba(255,255,255,0.08)" },
          grid: { color: "rgba(255,255,255,0.08)" },
          pointLabels: { color: "#8ea0c2", font: { size: 11, family: "JetBrains Mono" } },
          ticks: { display: false, backdropColor: "transparent" },
          suggestedMin: 0, suggestedMax: 100,
        },
      },
    },
  });
}

async function takeReading() {
  const city = citySelect.value;
  const date = dateInput.value;
  const model = modelSelect.value;

  predictBtn.disabled = true;
  predictBtn.textContent = "Reading…";

  try {
    const res = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, date, model }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    setGauge(data.aqi);
    renderCategory(data.category);
    readoutMeta.textContent = `${data.city} · ${data.date} · ${data.model}`;
    adviceBox.style.display = "block";
    adviceText.textContent = data.category.advice;
    sensitiveText.textContent = data.sensitiveGroupNote;
    renderPollutants(data.pollutants);

    await loadForecast(city, date, model);
    await loadHistory(city);
    toast(`Reading updated for ${city}`);
    checkAlertThreshold(data.aqi, data.city);
  } catch (err) {
    readoutMeta.textContent = "Something went wrong — try again.";
    toast("Couldn't take a reading — please retry.");
    console.error(err);
  } finally {
    predictBtn.disabled = false;
    predictBtn.textContent = "Take reading";
  }
}

async function loadForecast(city, date, model) {
  const res = await fetch("/forecast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city, date, model }),
  });
  const data = await res.json();
  if (data.error) return;

  const labels = data.forecast.map(d =>
    new Date(d.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric" })
  );
  const values = data.forecast.map(d => d.aqi);
  const colors = data.forecast.map(d => d.color);

  if (forecastChart) forecastChart.destroy();
  forecastChart = new Chart(document.getElementById("forecastChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Predicted AQI", data: values, borderColor: "#49d3c8",
        backgroundColor: "rgba(73,211,200,0.12)", pointBackgroundColor: colors,
        pointRadius: 5, tension: 0.35, fill: true,
      }],
    },
    options: chartOptions(),
  });
}

async function loadHistory(city) {
  const res = await fetch(`/history/${encodeURIComponent(city)}`);
  const data = await res.json();
  if (data.error) return;

  const labels = data.dates.map(d =>
    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  );

  if (historyChart) historyChart.destroy();
  historyChart = new Chart(document.getElementById("historyChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Recorded AQI", data: data.aqi, borderColor: "#7B1FA2",
        backgroundColor: "rgba(123,31,162,0.12)", pointRadius: 0, tension: 0.3, fill: true,
      }],
    },
    options: chartOptions(),
  });
}

function chartOptions() {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: "#8ea0c2", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.04)" } },
      y: { ticks: { color: "#8ea0c2", font: { size: 10 } }, grid: { color: "rgba(255,255,255,0.06)" } },
    },
  };
}

predictBtn.addEventListener("click", takeReading);

// ============================================================
// TAB: COMPARE
// ============================================================
const compareBtn = document.getElementById("compareBtn");

async function runCompare() {
  const cityA = document.getElementById("compareCityA").value;
  const cityB = document.getElementById("compareCityB").value;
  const date = document.getElementById("compareDate").value;

  compareBtn.disabled = true;
  compareBtn.textContent = "Comparing…";
  try {
    const res = await fetch("/compare", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityA, cityB, date, model: "Random Forest" }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    fillCompareCard("A", data.a);
    fillCompareCard("B", data.b);

    const labels = Object.keys(data.a.pollutants);
    if (compareChart) compareChart.destroy();
    compareChart = new Chart(document.getElementById("compareChart"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: data.a.city, data: labels.map(k => data.a.pollutants[k]), backgroundColor: data.a.color },
          { label: data.b.city, data: labels.map(k => data.b.pollutants[k]), backgroundColor: data.b.color },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#8ea0c2" } } },
        scales: {
          x: { ticks: { color: "#8ea0c2" }, grid: { display: false } },
          y: { ticks: { color: "#8ea0c2" }, grid: { color: "rgba(255,255,255,0.06)" } },
        },
      },
    });
    toast(`Comparing ${data.a.city} vs ${data.b.city}`);
  } catch (err) {
    toast("Comparison failed — try again.");
    console.error(err);
  } finally {
    compareBtn.disabled = false;
    compareBtn.textContent = "Compare";
  }
}

function fillCompareCard(letter, info) {
  const card = document.getElementById(`compareCard${letter}`);
  card.style.borderColor = info.color;
  card.querySelector(".city-name").textContent = info.city;
  card.querySelector(".big-aqi").textContent = Math.round(info.aqi);
  card.querySelector(".big-aqi").style.color = info.color;
  const badge = document.getElementById(`compareBadge${letter}`);
  badge.style.borderColor = info.color;
  badge.querySelector(".dot").style.background = info.color;
  badge.querySelector("span:last-child").textContent = info.label;
}

compareBtn.addEventListener("click", runCompare);

// ============================================================
// TAB: RANKINGS
// ============================================================
let rankingsLoadedOnce = false;
let lastRankings = [];

async function loadRankings() {
  const date = document.getElementById("rankDate").value;
  const model = document.getElementById("rankModel").value;
  const tbody = document.getElementById("rankTableBody");
  tbody.innerHTML = `<tr><td>Loading…</td></tr>`;

  try {
    const res = await fetch("/rankings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, model }),
    });
    const data = await res.json();
    lastRankings = data.rankings;
    renderRankings(lastRankings);
    rankingsLoadedOnce = true;
  } catch (err) {
    tbody.innerHTML = `<tr><td>Couldn't load rankings.</td></tr>`;
  }
}

function renderRankings(list) {
  const tbody = document.getElementById("rankTableBody");
  tbody.innerHTML = "";
  const maxAqi = Math.max(...list.map(r => r.aqi), 1);
  list.forEach(r => {
    const tr = document.createElement("tr");
    tr.className = "rank-row";
    const pct = (r.aqi / maxAqi) * 100;
    tr.innerHTML = `
      <td style="width:44px;"><span class="rank-badge">#${r.rank}</span></td>
      <td style="font-family:var(--font-display); font-weight:600;">${r.city}</td>
      <td style="width:160px;">
        <div class="rank-bar-track"><div class="rank-bar-fill" style="width:0%; background:${r.color};"></div></div>
      </td>
      <td style="width:130px;">
        <span class="rank-tag"><span class="dot" style="background:${r.color}"></span>${r.label}</span>
      </td>
      <td style="width:70px; text-align:right;" class="rank-aqi" style="color:${r.color};">${Math.round(r.aqi)}</td>
    `;
    tr.addEventListener("click", () => {
      citySelect.value = r.city;
      dateInput.value = document.getElementById("rankDate").value;
      switchToTab("reading");
      takeReading();
    });
    tbody.appendChild(tr);
    requestAnimationFrame(() => {
      tr.querySelector(".rank-bar-fill").style.width = pct + "%";
    });
  });
}

document.getElementById("rankDate").addEventListener("change", loadRankings);
document.getElementById("rankModel").addEventListener("change", loadRankings);
document.getElementById("rankSearch").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  renderRankings(lastRankings.filter(r => r.city.toLowerCase().includes(q)));
});

// ============================================================
// TAB: CALENDAR
// ============================================================
let calendarLoadedOnce = false;
let calYear, calMonth;
const now = new Date();
calYear = now.getFullYear();
calMonth = now.getMonth() + 1;

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

async function loadCalendar() {
  const city = document.getElementById("calCity").value;
  document.getElementById("calLabel").textContent = `${MONTH_NAMES[calMonth - 1]} ${calYear}`;
  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = `<div class="hint">Loading…</div>`;

  try {
    const res = await fetch("/calendar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, year: calYear, month: calMonth, model: "Random Forest" }),
    });
    const data = await res.json();
    renderCalendar(data.days);
    calendarLoadedOnce = true;
  } catch (err) {
    grid.innerHTML = `<div class="hint">Couldn't load calendar.</div>`;
  }
}

function renderCalendar(days) {
  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";
  ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach(d => {
    const el = document.createElement("div");
    el.className = "calendar-dow";
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstWeekday = days[0].weekday === 6 ? 0 : days[0].weekday + 1; // convert Mon=0 -> Sun=0 offset
  for (let i = 0; i < firstWeekday; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-cell empty";
    grid.appendChild(empty);
  }

  days.forEach(d => {
    const cell = document.createElement("div");
    cell.className = "calendar-cell";
    cell.style.background = hexToRgba(d.color, 0.22);
    cell.style.color = d.color;
    const dayNum = new Date(d.date).getDate();
    cell.innerHTML = `
      <span class="day-num">${dayNum}</span>
      <span class="day-aqi">${Math.round(d.aqi)}</span>
      <div class="calendar-tooltip">${d.date} · ${d.label} · ${Math.round(d.aqi)}</div>
    `;
    cell.addEventListener("click", () => {
      citySelect.value = document.getElementById("calCity").value;
      dateInput.value = d.date;
      switchToTab("reading");
      takeReading();
      toast(`Loaded ${d.date} into Live Reading`);
    });
    grid.appendChild(cell);
  });
}

function hexToRgba(hex, alpha) {
  return `rgba(${hexToRgb(hex)}, ${alpha})`;
}

document.getElementById("calCity").addEventListener("change", loadCalendar);
document.getElementById("calPrev").addEventListener("click", () => {
  calMonth -= 1;
  if (calMonth < 1) { calMonth = 12; calYear -= 1; }
  loadCalendar();
});
document.getElementById("calNext").addEventListener("click", () => {
  calMonth += 1;
  if (calMonth > 12) { calMonth = 1; calYear += 1; }
  loadCalendar();
});

// ============================================================
// LIVE TICKER (top of page)
// ============================================================
async function loadTicker() {
  const date = dateInput.value;
  try {
    const res = await fetch("/rankings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, model: "Random Forest" }),
    });
    const data = await res.json();
    const items = data.rankings.map(r =>
      `<span class="ticker-item"><span class="dot" style="background:${r.color}"></span>${r.city} · ${Math.round(r.aqi)} ${r.label}</span>`
    ).join("");
    document.getElementById("tickerTrack").innerHTML = items + items; // duplicate for seamless loop
  } catch (err) {
    document.getElementById("tickerTrack").innerHTML = `<span class="ticker-item">Live ticker unavailable</span>`;
  }
}

// ============================================================
// CHATBOT
// ============================================================
const chatToggle = document.getElementById("chatToggle");
const chatPanel = document.getElementById("chatPanel");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");

chatToggle.addEventListener("click", () => {
  chatPanel.classList.toggle("open");
  if (chatPanel.classList.contains("open")) chatInput.focus();
});

function addMessage(text, who) {
  const div = document.createElement("div");
  div.className = `msg ${who}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "typing-dots";
  div.id = "typingIndicator";
  div.innerHTML = "<span></span><span></span><span></span>";
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
function hideTyping() {
  const el = document.getElementById("typingIndicator");
  if (el) el.remove();
}

async function sendChat(customText) {
  const text = (customText || chatInput.value).trim();
  if (!text) return;
  addMessage(text, "user");
  chatInput.value = "";
  showTyping();

  try {
    const res = await fetch("/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    await new Promise(r => setTimeout(r, 350)); // small delay so typing indicator is visible
    hideTyping();
    addMessage(data.reply, "bot");
  } catch (err) {
    hideTyping();
    addMessage("Sorry, I couldn't reach the server just now.", "bot");
  }
}

chatSend.addEventListener("click", () => sendChat());
chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => sendChat(chip.dataset.q));
});

// ============================================================
// SMART NOTIFICATION ALERTS
// ============================================================
const alertToggle = document.getElementById("alertToggle");
const alertThreshold = document.getElementById("alertThreshold");

alertToggle.addEventListener("change", async () => {
  if (alertToggle.checked) {
    if (!("Notification" in window)) {
      toast("Browser notifications aren't supported here — I'll use toasts instead.");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      toast("Notification permission denied — I'll use toasts instead.");
    } else {
      toast("Alerts enabled for this session.");
    }
  }
});

function checkAlertThreshold(aqi, city) {
  if (!alertToggle.checked) return;
  const threshold = parseFloat(alertThreshold.value) || 200;
  if (aqi < threshold) return;

  const message = `${city}'s AQI is ${Math.round(aqi)} — at or above your alert threshold of ${threshold}.`;
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("AQI Vision Alert", { body: message, icon: undefined });
  } else {
    toast(`⚠️ ${message}`);
  }
}

// ============================================================
// DOWNLOADABLE REPORT CARD
// ============================================================
document.getElementById("downloadReportBtn").addEventListener("click", async () => {
  const card = document.getElementById("reportCard");
  toast("Generating report card…");
  try {
    const canvas = await html2canvas(card, { backgroundColor: "#0a0f1c", scale: 2 });
    const link = document.createElement("a");
    link.download = `aqi-vision-report-${citySelect.value}-${dateInput.value}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast("Report card downloaded ✅");
  } catch (err) {
    toast("Couldn't generate report card.");
    console.error(err);
  }
});

// ============================================================
// TAB: MAP VIEW
// ============================================================
const CITY_COORDS = {
  Delhi:      { top: 29, left: 32 },
  Mumbai:     { top: 62, left: 17 },
  Bengaluru:  { top: 83, left: 33 },
  Kolkata:    { top: 50, left: 70 },
  Chennai:    { top: 82, left: 42 },
  Hyderabad:  { top: 68, left: 36 },
  Ahmedabad:  { top: 48, left: 16 },
  Pune:       { top: 64, left: 20 },
  Jaipur:     { top: 35, left: 27 },
  Lucknow:    { top: 35, left: 45 },
  Patna:      { top: 39, left: 59 },
  Kanpur:     { top: 36, left: 42 },
};

async function loadMap() {
  const date = document.getElementById("mapDate").value;
  const map = document.getElementById("indiaMap");
  try {
    const res = await fetch("/rankings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, model: "Random Forest" }),
    });
    const data = await res.json();
    map.innerHTML = "";
    data.rankings.forEach(r => {
      const coord = CITY_COORDS[r.city];
      if (!coord) return;
      const dot = document.createElement("div");
      dot.className = "map-dot";
      dot.style.top = coord.top + "%";
      dot.style.left = coord.left + "%";
      dot.style.background = r.color;
      dot.style.color = r.color;
      dot.dataset.city = `${r.city} · ${Math.round(r.aqi)} ${r.label}`;
      dot.innerHTML = `<span class="map-pulse"></span>`;
      dot.addEventListener("click", () => {
        citySelect.value = r.city;
        dateInput.value = date;
        switchToTab("reading");
        takeReading();
      });
      map.appendChild(dot);
    });
  } catch (err) {
    map.innerHTML = `<div class="hint" style="padding:20px;">Couldn't load the map.</div>`;
  }
}
document.getElementById("mapDate").addEventListener("change", loadMap);

// ============================================================
// TAB: WHAT-IF LAB
// ============================================================
const WHATIF_RATIOS = { "PM2.5": 0.55, "PM10": 0.85, "NO2": 0.30, "SO2": 0.12, "CO": 0.018, "O3": 0.28 };
const WHATIF_MAX = { "PM2.5": 300, "PM10": 430, "NO2": 150, "SO2": 60, "CO": 9, "O3": 140 };
const WHATIF_DEFAULT = { "PM2.5": 90, "PM10": 140, "NO2": 40, "SO2": 12, "CO": 1.5, "O3": 35 };

let whatifChart;

function buildWhatifSliders() {
  const container = document.getElementById("whatifSliders");
  container.innerHTML = "";
  Object.keys(WHATIF_RATIOS).forEach(name => {
    const row = document.createElement("div");
    row.className = "slider-row";
    row.innerHTML = `
      <div class="slider-head"><span class="name">${name}</span><span class="val" id="whatifVal-${cssId(name)}">${WHATIF_DEFAULT[name]}</span></div>
      <input type="range" id="whatifSlider-${cssId(name)}" min="0" max="${WHATIF_MAX[name]}" step="${name === 'CO' ? 0.1 : 1}" value="${WHATIF_DEFAULT[name]}">
    `;
    container.appendChild(row);
  });
  Object.keys(WHATIF_RATIOS).forEach(name => {
    const slider = document.getElementById(`whatifSlider-${cssId(name)}`);
    slider.addEventListener("input", updateWhatif);
  });
}
function cssId(name) { return name.replace(/[^a-zA-Z0-9]/g, ""); }

function updateWhatif() {
  const subIndices = {};
  Object.keys(WHATIF_RATIOS).forEach(name => {
    const slider = document.getElementById(`whatifSlider-${cssId(name)}`);
    const value = parseFloat(slider.value);
    document.getElementById(`whatifVal-${cssId(name)}`).textContent = value;
    subIndices[name] = Math.min(500, value / WHATIF_RATIOS[name]);
  });

  const driver = Object.entries(subIndices).sort((a, b) => b[1] - a[1])[0];
  const overallAqi = driver[1];
  const color = colorForAqi(overallAqi);

  const pct = Math.max(0, Math.min(1, overallAqi / 500));
  document.getElementById("whatifGaugeNeedle").style.transform = `translate(-50%, -100%) rotate(${pct * 360}deg)`;
  document.getElementById("whatifGaugeValue").textContent = Math.round(overallAqi);
  document.getElementById("whatifDot").style.background = color;
  document.getElementById("whatifBadge").style.borderColor = color;
  document.getElementById("whatifLabel").textContent = categoryLabelFor(overallAqi);
  document.getElementById("whatifLabel").style.color = color;
  document.getElementById("whatifDriver").textContent = `Driving pollutant: ${driver[0]} (sub-index ${Math.round(driver[1])})`;

  const labels = Object.keys(subIndices);
  const values = labels.map(k => Math.round(subIndices[k]));
  const colors = values.map(v => colorForAqi(v));
  if (whatifChart) whatifChart.destroy();
  whatifChart = new Chart(document.getElementById("whatifChart"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Sub-index", data: values, backgroundColor: colors }] },
    options: chartOptions(),
  });
}

function categoryLabelFor(v) {
  if (v <= 50) return "Good";
  if (v <= 100) return "Satisfactory";
  if (v <= 200) return "Moderate";
  if (v <= 300) return "Poor";
  if (v <= 400) return "Very Poor";
  return "Severe";
}

// ============================================================
// TAB: SEASONAL PATTERNS
// ============================================================
let seasonalLoadedOnce = false;
let weekdayChart, monthlyChart;

async function loadSeasonal() {
  const city = document.getElementById("seasonCity").value;
  try {
    const res = await fetch(`/seasonal/${encodeURIComponent(city)}`);
    const data = await res.json();

    const dowLabels = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    if (weekdayChart) weekdayChart.destroy();
    weekdayChart = new Chart(document.getElementById("weekdayChart"), {
      type: "bar",
      data: {
        labels: dowLabels,
        datasets: [{ label: "Avg AQI", data: data.weekdayAvg, backgroundColor: data.weekdayAvg.map(colorForAqi) }],
      },
      options: chartOptions(),
    });

    const monthLabels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(document.getElementById("monthlyChart"), {
      type: "polarArea",
      data: {
        labels: monthLabels,
        datasets: [{ data: data.monthlyAvg, backgroundColor: data.monthlyAvg.map(v => hexToRgba(colorForAqi(v), 0.65)) }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { r: { ticks: { display: false, backdropColor: "transparent" }, grid: { color: "rgba(255,255,255,0.08)" } } },
      },
    });
    seasonalLoadedOnce = true;
  } catch (err) {
    toast("Couldn't load seasonal patterns.");
  }
}
document.getElementById("seasonCity").addEventListener("change", loadSeasonal);

// ============================================================
// INIT
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  takeReading();
  loadTicker();
  buildWhatifSliders();
  updateWhatif();
});
