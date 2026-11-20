// ------------------------------------------------------------------------------
// main.js - Paanipahra dashboard and live view
//
// Pages that use this file:
//   maindashboard.html  showDashboard()  main water tank + all cooler cards
//   live.html, index.html  showCooler()  one cooler, live values
//   aboutus.html        getEmailContactus()
// Data comes from the API. The page refreshes itself every REFRESH_SECONDS.
// ------------------------------------------------------------------------------

const API_BASE = "https://paanipahrav3api.onrender.com";
const API_COOLERS = API_BASE + "/api/coolers";
const API_COOLER = API_BASE + "/api/coolers/";        // + cooler id
const API_MAIN_TANK = API_BASE + "/api/main-tank";

// How often the pages reload data from the server (seconds)
const REFRESH_SECONDS = 10;

// Shown until a main tank consumption value is available from the server
const MAIN_TANK_CONSUMPTION_DUMMY_LITRES = 100;

var emailContactus = "yashvardhanyadav1709@gmail.com";   // used by the About Us page

// ------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// kind: "loading" (orange) or "error" (red)
function statusBox(kind, heading, detail, linkUrl) {
    const link = linkUrl
        ? "<p><a href=\"" + escapeHtml(linkUrl) + "\">" + escapeHtml(linkUrl) + "</a></p>"
        : "";
    return "<div class=\"status-box " + kind + "\"><h3>" + escapeHtml(heading) + "</h3>" +
           "<p>" + escapeHtml(detail) + "</p>" + link + "</div>";
}

// Fetch JSON with a timeout. Throws an Error with a plain-English message.
async function fetchJson(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        let res;
        try {
            res = await fetch(url, { signal: controller.signal, cache: "no-store" });
        } catch (err) {
            if (err.name === "AbortError") {
                throw new Error("The server did not respond within " + (timeoutMs / 1000) + " seconds.");
            }
            throw new Error("The server cannot be reached. Check your internet connection, or the server may be offline.");
        }

        let body = {};
        try {
            body = await res.json();
        } catch (err) {
            if (res.ok) {
                throw new Error("The server sent a response that is not valid data.");
            }
        }

        if (!res.ok) {
            if (res.status === 503) {
                throw new Error("The server is not ready. It may still be starting, or it cannot reach the database.");
            }
            if (res.status === 404) {
                throw new Error("The server could not find this data (HTTP 404).");
            }
            if (res.status === 429) {
                throw new Error("Too many requests. Please wait a moment and try again.");
            }
            throw new Error("The server returned an error (HTTP " + res.status + ")" +
                            (body.error ? ": " + body.error : "."));
        }
        return body;
    } finally {
        clearTimeout(timer);
    }
}

function getParam(name) {
    return new URL(window.location.href).searchParams.get(name);
}

function setText(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = text;
}

function setLiveNotice(html) {
    const el = document.getElementById("live-notice");
    if (el) el.innerHTML = html;
}

// Water meter is a running total in litres; show a dash if it is not available
function fmtMeter(value) {
    return (value === undefined || value === null || value === "") ? "–" : value + " L";
}

// RO TDS is in parts per million; show a dash if it is not available
function fmtPpm(value) {
    return (value === undefined || value === null || value === "") ? "–" : value + " ppm";
}

// ------------------------------------------------------------------------------
// Colours
// ------------------------------------------------------------------------------

// Water level: red when low, green when full (0 to 300 L)
function getCoolerWaterLevelColor(value) {
    const val = Math.min(Math.max(parseFloat(value), 0), 300);
    const normalized = val / 300;
    const r = Math.round(255 * (1 - normalized));
    const g = Math.round(255 * normalized);
    return `rgb(${r},${g},0)`;
}

// Temperature: blue when cold (5 °C), red when hot (25 °C)
function getTempColor(temp) {
    const t = parseFloat(temp);
    const normalized = Math.max(0, Math.min(1, (t - 5) / 20));
    const b = Math.round(255 * (1 - normalized));
    const r = Math.round(255 * normalized);
    return `rgb(${r},0,${b})`;
}

function getSafetyColor(safety) {
    switch (String(safety).toLowerCase()) {
        case "green":  return "#28a745";
        case "yellow": return "#ffc107";
        case "red":    return "#dc3545";
        default:       return "transparent";
    }
}

function getSystemStateColor(state) {
    switch (String(state).toLowerCase()) {
        case "ok":     return "#28a745";
        case "not ok": return "#dc3545";
        default:       return "yellow";
    }
}

// ------------------------------------------------------------------------------
// Live view: one cooler (live.html?id=1, index.html)
// The layout (with the video) is drawn once; refreshes update only the values,
// so the video does not restart.
// ------------------------------------------------------------------------------
let liveRendered = false;     // the page layout (with video) is drawn
let liveTimer = null;
let liveId = null;

// silent === true means a background refresh
async function showCooler(silent) {
    const id = getParam("id");
    const isRefresh = (silent === true);

    if (!id) {
        document.getElementById("title").textContent = "Live View - Invalid ID";
        document.getElementById("container").innerHTML = "<p>No data for this cooler.</p>";
        return;
    }
    if (id !== liveId) {          // a different cooler: draw the layout again
        liveId = id;
        liveRendered = false;
    }

    if (!isRefresh && !liveRendered) {
        document.getElementById("container").innerHTML = statusBox(
            "loading", "Loading cooler data...", "Please wait. The server may take up to a minute to wake up.");
    }

    const url = API_COOLER + encodeURIComponent(id);
    let data;
    try {
        data = await fetchJson(url);
    } catch (err) {
        console.error("Could not load cooler", err);
        if (liveRendered) {
            setLiveNotice(statusBox("error", "Live update failed",
                err.message + " Showing the last values. Retrying automatically.", url));
        } else {
            document.getElementById("title").textContent = "Live View - Unavailable";
            document.getElementById("container").innerHTML = statusBox(
                "error", "Could not load data for this cooler", err.message, url);
        }
        scheduleLiveRefresh();
        return;
    }

    document.title = "Live View - " + data.title;
    document.getElementById("title").textContent = data.title + " - Live View";

    if (!liveRendered) {
        document.getElementById("container").innerHTML = `
        <div id="live-notice"></div>
        <div class="live-video-container">
            <iframe width="480" height="270" src="${escapeHtml(data.video)}" frameborder="0"
                    allow="autoplay; encrypted-media" allowfullscreen></iframe>
        </div>
        <div class="cooler-details">
            <table class="location-status-table">
                <tr><td>Water Level</td><td class="data-cell" id="live-level"></td></tr>
                <tr><td>Consumption</td><td class="data-cell" style="background-color: #475569; color: white;" id="live-meter"></td></tr>
                <tr><td>RO TDS</td><td class="data-cell" style="background-color: #475569; color: white;" id="live-tds"></td></tr>
                <tr><td>Safety</td><td class="data-cell green" id="live-safety"></td></tr>
                <tr><td>Water Temperature</td><td class="data-cell" id="live-temp"></td></tr>
                <tr><td>System Working</td><td class="data-cell ok" id="live-system"></td></tr>
            </table>
        </div>`;
        liveRendered = true;
    }

    setText("live-level", data.waterLevel + " L");
    setText("live-meter", fmtMeter(data.consumption));
    setText("live-tds", fmtPpm(data.roTds));
    setText("live-safety", data.safety);
    setText("live-temp", data.waterTemp + "°C");
    setText("live-system", data.systemWorking);
    setLiveNotice("");
    scheduleLiveRefresh();
}

function scheduleLiveRefresh() {
    if (liveTimer === null) {
        liveTimer = setInterval(() => showCooler(true), REFRESH_SECONDS * 1000);
    }
}

// ------------------------------------------------------------------------------
// Dashboard: main water tank and all coolers (maindashboard.html)
// ------------------------------------------------------------------------------
let dashboardHtml = "";       // last good dashboard, kept if a refresh fails
let dashboardTimer = null;
let mainTank = null;          // latest main tank reading (null if not available)

// silent === true means a background refresh (no loading message)
async function showDashboard(silent) {
    const container = document.getElementById("container");
    const isRefresh = (silent === true);
    if (!isRefresh) {
        container.innerHTML = statusBox(
            "loading", "Loading cooler data...", "Please wait. The server may take up to a minute to wake up.");
    }

    // The coolers and the main tank are requested together. A main tank failure
    // does not stop the cooler cards from showing.
    const [coolers, tank] = await Promise.allSettled([
        fetchJson(API_COOLERS),
        fetchJson(API_MAIN_TANK),
    ]);
    mainTank = (tank.status === "fulfilled") ? tank.value : null;
    if (tank.status === "rejected") {
        console.error("Main tank not available", tank.reason);
    }

    if (coolers.status === "rejected") {
        const err = coolers.reason;
        console.error("Could not load coolers", err);
        if (isRefresh && dashboardHtml) {
            container.innerHTML = statusBox("error", "Live update failed",
                err.message + " Showing the last values. Retrying automatically.", API_COOLERS) + dashboardHtml;
        } else {
            container.innerHTML = statusBox("error", "Could not load cooler data", err.message, API_COOLERS);
        }
        scheduleDashboardRefresh();
        return;
    }

    const data = coolers.value;
    if (Object.keys(data).length === 0) {
        container.innerHTML = statusBox(
            "error", "No cooler data available",
            "The server responded, but it has no coolers. The database may be empty.", API_COOLERS);
        scheduleDashboardRefresh();
        return;
    }

    dashboardHtml = buildDashboardHtml(data);
    container.innerHTML = dashboardHtml;
    scheduleDashboardRefresh();
}

function scheduleDashboardRefresh() {
    if (dashboardTimer === null) {
        dashboardTimer = setInterval(() => showDashboard(true), REFRESH_SECONDS * 1000);
    }
}

// "Updated 15 Nov, 02:30 pm" in India time, for the main tank and every cooler
function fmtUpdated(isoTime) {
    if (!isoTime) return "No data";
    const when = new Date(isoTime);
    if (isNaN(when)) return "No data";
    return "Updated " + when.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
}

function buildMainTankHtml() {
    const level = mainTank ? escapeHtml(mainTank.waterLevel) + " Liters" : "–";
    const safety = mainTank ? escapeHtml(mainTank.safety) : "–";
    const safetyColor = mainTank ? getSafetyColor(mainTank.safety) : "transparent";
    const updated = mainTank ? fmtUpdated(mainTank.lastUpdated) : "Not available";
    return `
    <div class="main-title">Main Water Tank
        <span style="font-size: 0.6em; font-weight: normal; margin-left: 1rem; opacity: 0.9;">${escapeHtml(updated)}</span>
    </div>
    <div class="dashboard-section">
        <table class="dashboard-table dashboard-oneline">
            <tr>
                <td>Main Tank Water Level</td>
                <td class="water-level">${level}</td>
                <td>Overall Safety Indicator</td>
                <td class="indicator" style="background-color: ${safetyColor}; color: white; font-weight: bold;">${safety}</td>
                <td>Today's Consumption (since 07:00 AM)</td>
                <td class="consumption">${MAIN_TANK_CONSUMPTION_DUMMY_LITRES} Liters</td>
            </tr>
        </table>
    </div>`;
}

function buildCoolerCardHtml(id, info) {
    return `
                    <div class="location-card">
                        <div class="location-title">${escapeHtml(info.title)}
                            <span style="font-size: 0.7em; font-weight: normal; display: block; opacity: 0.9;">${escapeHtml(fmtUpdated(info.lastUpdated))}</span>
                        </div>
                        <table class="location-status-table">
                            <tr>
                                <td>Water Level</td>
                                <td class="data-cell" style="background-color: ${getCoolerWaterLevelColor(info.waterLevel)}; color: white; font-weight: bold;">${escapeHtml(info.waterLevel)} L</td>
                            </tr>
                            <tr>
                                <td>Consumption</td>
                                <td class="data-cell" style="background-color: #475569; color: white; font-weight: bold;">${fmtMeter(info.consumption)}</td>
                            </tr>
                            <tr>
                                <td>RO TDS</td>
                                <td class="data-cell" style="background-color: #475569; color: white; font-weight: bold;">${fmtPpm(info.roTds)}</td>
                            </tr>
                            <tr>
                                <td>Safety</td>
                                <td class="data-cell" style="background-color: ${getSafetyColor(info.safety)}; color: white; font-weight: bold;">${escapeHtml(info.safety)}</td>
                            </tr>
                            <tr>
                                <td>Water Temperature</td>
                                <td class="data-cell" style="background-color: ${getTempColor(info.waterTemp)}; color: white; font-weight: bold;">${escapeHtml(info.waterTemp)}°C</td>
                            </tr>
                            <tr>
                                <td>System Working</td>
                                <td class="data-cell" style="background-color: ${getSystemStateColor(info.systemWorking)}; color: white; font-weight: bold;">${escapeHtml(info.systemWorking)}</td>
                            </tr>
                        </table>
                        <a class="show-live-btn" href="live.html?id=${encodeURIComponent(id)}">Show Live</a>
                    </div>`;
}

function buildDashboardHtml(data) {
    const cards = Object.keys(data).sort()
        .map(id => buildCoolerCardHtml(id, data[id]))
        .join("");

    return `
    <div class="header">
        AI Based RO Water System with Auto Adjustable Temp, Child Safe Environment &amp; Central Water Requirements Prediction
    </div>
    ${buildMainTankHtml()}
    <div class="sub-title">Individual Locations</div>
    <div class="locations-section">
        <div class="locations-grid">${cards}
        </div>
    </div>`;
}

// ------------------------------------------------------------------------------
// About Us page: fills in the contact email link
// ------------------------------------------------------------------------------
function getEmailContactus() {
    document.getElementById("contactususemail").href =
        "mailto:" + emailContactus + "?subject=RO%20Dashboard%20Query&body=Hello%2C%0A";
}
