let data = window.DASHBOARD_DATA;
const branchStructure = window.BRANCH_STRUCTURE || { regionalManagers: {} };
const SPREADSHEET_ID = "11kof2bCLpS-q7WFQdFM0_jkxp0mB3_vUA0bo_hM8wgQ";
const SHEET_NAMES = ["Overall", "AM wise", "SAM wise", "RM wise", "Low Attednance", "Targets"];

const state = {
  rm: "All",
};

const els = {
  kpis: document.querySelector("#kpis"),
  trendTitle: document.querySelector("#trendTitle"),
  trendChart: document.querySelector("#trendChart"),
  trendLegend: document.querySelector("#trendLegend"),
  rmMatrix: document.querySelector("#rmMatrix"),
  rmTable: document.querySelector("#rmTable"),
  amTable: document.querySelector("#amTable"),
};

function gvizSheet(sheetName) {
  const callbackName = `googleSheet_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const params = new URLSearchParams({
    sheet: sheetName,
    tqx: `out:json;responseHandler:${callbackName}`,
  });
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out loading ${sheetName}`));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (response) => {
      cleanup();
      if (response?.status === "error") {
        reject(new Error(response.errors?.[0]?.detailed_message || `Could not load ${sheetName}`));
        return;
      }
      resolve(response.table);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error(`Could not load ${sheetName}`));
    };
    script.src = url;
    document.head.appendChild(script);
  });
}

function tableToRows(table) {
  const headers = table.cols.map((col) => col.label || col.id || "");
  const rows = table.rows.map((row) => {
    const values = row.c.map((cell) => cell?.v ?? "");
    while (values.length < headers.length) values.push("");
    return values;
  });
  return [headers, ...rows].filter((row) => row.some((value) => String(value).trim() !== ""));
}

function cleanNumber(value) {
  if (value === "" || value === null || value === undefined || value === "NA" || value === "#N/A") return null;
  if (typeof value === "number") return Math.round(value * 100) / 100;
  const parsed = Number(String(value).replace("%", "").trim());
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : value;
}

function normalizeWeek(label) {
  const match = String(label || "").match(/Week\s*([0-9]+)/i);
  return match ? `Week ${Number(match[1])}` : null;
}

function wideWeekRows(rows, dimensions) {
  const headers = rows[0] || [];
  const weekCols = headers
    .map((label, index) => ({ index, week: normalizeWeek(label) }))
    .filter((item) => item.week);

  return rows.slice(1).map((row) => {
    const record = Object.fromEntries(Object.entries(dimensions).map(([key, index]) => [key, row[index] || ""]));
    const points = weekCols.map(({ index, week }) => ({ week, value: cleanNumber(row[index]) })).filter((point) => Number.isFinite(point.value));
    return { ...record, points, latest: points.at(-1), previous: points.at(-2) };
  }).filter((record) => Object.values(dimensions).some((index) => String(record[Object.keys(dimensions).find((key) => dimensions[key] === index)] || "").trim()) && record.points.length);
}

function readOverall(rows) {
  const currentYear = [];
  const previousYear = [];
  for (const row of rows.slice(1)) {
    const currentWeek = cleanNumber(row[0]);
    const currentValue = cleanNumber(row[1]);
    const priorWeek = cleanNumber(row[5]);
    const priorValue = cleanNumber(row[6]);
    if (Number.isFinite(currentWeek) && Number.isFinite(currentValue)) currentYear.push({ week: `Week ${currentWeek}`, value: currentValue });
    if (Number.isFinite(priorWeek) && Number.isFinite(priorValue)) previousYear.push({ week: `Week ${priorWeek}`, value: priorValue });
  }
  return { currentYear, previousYear };
}

function readLowAttendance(rows) {
  const headers = rows[0] || [];
  const avgIndex = headers.findIndex((label) => String(label).toLowerCase() === "average");
  const weekCols = headers
    .map((label, index) => ({ index, week: normalizeWeek(label) }))
    .filter((item) => item.week);

  return rows.slice(1).map((row) => {
    const average = cleanNumber(row[avgIndex]);
    const points = weekCols.map(({ index, week }) => {
      const value = cleanNumber(row[index]);
      return { week, value: Number.isFinite(value) ? Math.round(value * 1000) / 10 : value };
    }).filter((point) => Number.isFinite(point.value));

    return {
      areaManager: row[0] || "",
      center: row[1] || "",
      average: Number.isFinite(average) ? Math.round(average * 1000) / 10 : null,
      points,
    };
  }).filter((record) => record.areaManager && record.center && Number.isFinite(record.average));
}

function readTargets(rows) {
  const headers = rows[0] || [];
  const targetCols = headers
    .map((label, index) => ({ label, index }))
    .filter(({ label }) => /target|milestone/i.test(String(label)));

  return rows.slice(1).map((row) => {
    const targets = targetCols.map(({ label, index }) => ({ label, value: cleanNumber(row[index]) })).filter((target) => Number.isFinite(target.value));
    return { rm: row[0] || "", sam: row[1] || "", targets, latestTarget: targets.at(-1) };
  }).filter((record) => record.rm && record.sam && record.targets.length);
}

async function loadLiveDashboardData() {
  const tables = await Promise.all(SHEET_NAMES.map(async (sheet) => [sheet, tableToRows(await gvizSheet(sheet))]));
  const workbook = Object.fromEntries(tables);
  return {
    source: {
      sheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?usp=sharing`,
      generatedFrom: "live Google Sheet",
      live: true,
    },
    overall: readOverall(workbook.Overall),
    regionalManagers: wideWeekRows(workbook["RM wise"], { rm: 0 }),
    seniorAreaManagers: wideWeekRows(workbook["SAM wise"], { rm: 0, sam: 1 }),
    areaManagers: wideWeekRows(workbook["AM wise"], { am: 0, sam: 1, rm: 2 }),
    lowAttendance: readLowAttendance(workbook["Low Attednance"]),
    targets: readTargets(workbook.Targets),
  };
}

function pct(value) {
  return Number.isFinite(value) ? `${Math.round(value * 10) / 10}%` : "n/a";
}

function signed(value) {
  if (!Number.isFinite(value)) return "n/a";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded} pts`;
}

function avg(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function latestValue(record) {
  return record?.latest?.value ?? null;
}

function previousValue(record) {
  return record?.previous?.value ?? null;
}

function delta(record) {
  const latest = latestValue(record);
  const previous = previousValue(record);
  return Number.isFinite(latest) && Number.isFinite(previous) ? latest - previous : null;
}

function lastNAvg(record, count) {
  return avg(record.points.slice(-count).map((point) => point.value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function filteredAreaManagers() {
  return data.areaManagers.filter((record) => {
    return state.rm === "All" || record.rm === state.rm;
  });
}

function targetFor(rm, sam) {
  const targets = data.targets.filter((record) => (!rm || record.rm === rm) && (!sam || record.sam === sam));
  return avg(targets.map((record) => record.latestTarget?.value));
}

function branchCountsForRm(rm) {
  const record = branchStructure.regionalManagers?.[rm];
  return {
    branches: record?.branches?.length ?? null,
    ams: record?.areaManagers?.length ?? null,
    tms: record?.tms?.length ?? null,
    atms: record?.atms?.length ?? null,
  };
}

function totalActiveBranches() {
  const branchLists = Object.values(branchStructure.regionalManagers || {}).flatMap((record) => record.branches || []);
  if (branchLists.length) return unique(branchLists).length;
  return unique(data.lowAttendance.map((record) => record.center)).length;
}

function totalHiredTms() {
  const tmLists = Object.values(branchStructure.regionalManagers || {}).flatMap((record) => record.tms || []);
  return unique(tmLists).length;
}

function latestWeekLabel(areaManagers) {
  return areaManagers.find((record) => record.latest?.week)?.latest.week ?? "Latest week";
}

function areaManagerDetails(am) {
  return branchStructure.areaManagers?.[am] || {};
}

function statesForAreaManager(am) {
  const states = areaManagerDetails(am).states || [];
  return states.length ? states.join(", ") : "n/a";
}

function regionalSummary(areaManagers) {
  const byRm = new Map();
  for (const am of areaManagers) {
    if (!byRm.has(am.rm)) byRm.set(am.rm, []);
    byRm.get(am.rm).push(am);
  }
  return [...byRm.entries()]
    .map(([rm, ams]) => {
      const sams = unique(ams.map((record) => record.sam));
      const latest = avg(ams.map(latestValue));
      const prev = avg(ams.map(previousValue));
      const target = targetFor(rm, null);
      const branchCounts = branchCountsForRm(rm);
      return {
        rm,
        latest,
        previousWeek: prev,
        delta: Number.isFinite(latest) && Number.isFinite(prev) ? latest - prev : null,
        fourWeekAvg: avg(ams.map((record) => lastNAvg(record, 4))),
        threeMonthAvg: avg(ams.map((record) => lastNAvg(record, 12))),
        target,
        sams: sams.length,
        ams: branchCounts.ams ?? ams.length,
        tms: branchCounts.tms,
        vacantTmCapacity: Number.isFinite(branchCounts.ams) && Number.isFinite(branchCounts.tms)
          ? Math.max(0, branchCounts.ams * 10 - branchCounts.tms)
          : null,
        vacancyPct: Number.isFinite(branchCounts.ams) && Number.isFinite(branchCounts.tms) && branchCounts.ams > 0
          ? (Math.max(0, branchCounts.ams * 10 - branchCounts.tms) / (branchCounts.ams * 10)) * 100
          : null,
        branches: branchCounts.branches,
        lastFour: averageLastFour(ams),
      };
    })
    .sort((a, b) => (b.fourWeekAvg ?? -Infinity) - (a.fourWeekAvg ?? -Infinity));
}

function averageLastFour(records) {
  if (!records.length) return [];
  const maxLength = Math.max(...records.map((record) => record.points.length));
  const output = [];
  for (let offset = 4; offset >= 1; offset -= 1) {
    const values = records
      .map((record) => record.points[record.points.length - offset]?.value)
      .filter(Number.isFinite);
    const sample = records.find((record) => record.points[record.points.length - offset]);
    if (sample || maxLength >= offset) {
      output.push({
        week: sample?.points[sample.points.length - offset]?.week ?? `W-${offset}`,
        value: avg(values),
      });
    }
  }
  return output;
}

function renderKpis(areaManagers) {
  const latest = avg(areaManagers.map(latestValue));
  const fourWeeks = averageLastFour(areaManagers);
  const fourWeekAvg = avg(fourWeeks.map((point) => point.value));
  const threeMonthAvg = avg(areaManagers.map((record) => lastNAvg(record, 12)));
  const activeBranches = totalActiveBranches();
  const hiredTms = totalHiredTms();
  const branchesPerTm = hiredTms ? activeBranches / hiredTms : null;
  const cards = [
    [`${latestWeekLabel(areaManagers).replace("Week ", "W")} attendance`, pct(latest), "Latest available weekly attendance"],
    ["4-week average", pct(fourWeekAvg), fourWeeks.map((point) => `${point.week.replace("Week ", "W")} ${pct(point.value)}`).join(" / ")],
    ["3-month average", pct(threeMonthAvg), "Rolling 12-week attendance average"],
    ["Active branches", activeBranches.toString(), "Branches with attendance records across FEA"],
    ["Avg branches / hired TM", Number.isFinite(branchesPerTm) ? branchesPerTm.toFixed(1) : "n/a", `${activeBranches} branches / ${hiredTms || "n/a"} hired TMs; 10 expected per TM`],
  ];

  els.kpis.innerHTML = cards
    .map(([label, value, note]) => `
      <article class="kpi-card">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${value}</div>
        <p class="kpi-note">${note}</p>
      </article>
    `)
    .join("");
}

function chartRows(areaManagers) {
  if (state.rm !== "All") {
    return areaManagers
      .map((record) => ({
        label: record.am,
        value: lastNAvg(record, 4),
        meta: `${record.rm} / ${record.sam}`,
      }))
      .filter((row) => Number.isFinite(row.value))
      .sort((a, b) => a.value - b.value)
      .slice(0, 14);
  }

  return regionalSummary(areaManagers)
    .map((record) => ({
      label: record.rm,
      value: record.fourWeekAvg,
      meta: `3M ${pct(record.threeMonthAvg)} / ${record.ams} AMs`,
    }))
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => a.value - b.value);
}

function renderChart(areaManagers) {
  const rows = chartRows(areaManagers);
  els.trendLegend.innerHTML = `
    <span><i style="background:#146eb4"></i>4-week average</span>
    <span><i style="background:#ff9900"></i>Below 60%</span>
  `;
  els.trendTitle.textContent = state.rm !== "All"
    ? `${state.rm} - area manager ranking`
    : "Regional 4-week attendance ranking";

  if (!rows.length) {
    els.trendChart.innerHTML = `<p class="empty">No trend data available for the current filter.</p>`;
    return;
  }

  const width = 920;
  const rowHeight = 34;
  const height = Math.max(338, rows.length * rowHeight + 94);
  const pad = { top: 30, right: 76, bottom: 32, left: 238 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const max = 100;
  const x = (value) => pad.left + (Math.max(0, Math.min(max, value)) / max) * chartWidth;
  const thresholdX = x(60);
  const grid = [40, 60, 80, 100];
  const bars = rows.map((row, index) => {
    const y = pad.top + index * rowHeight + (rowHeight - 16) / 2;
    const fill = row.value < 60 ? "#ff9900" : "#146eb4";
    const label = row.label.length > 28 ? `${row.label.slice(0, 27)}...` : row.label;
    return `
      <text x="${pad.left - 14}" y="${y + 12}" text-anchor="end" fill="#374151" font-size="12" font-weight="700">${label}</text>
      <rect class="bar" x="${pad.left}" y="${y}" width="${Math.max(4, x(row.value) - pad.left).toFixed(1)}" height="16" rx="4" fill="${fill}">
        <title>${row.label}: ${pct(row.value)} (${row.meta})</title>
      </rect>
      <text x="${Math.min(width - 18, x(row.value) + 10)}" y="${y + 12}" fill="#111827" font-size="12" font-weight="800">${pct(row.value)}</text>
      <text x="${pad.left - 14}" y="${y + 27}" text-anchor="end" fill="#6b7280" font-size="10">${row.meta}</text>
    `;
  }).join("");

  els.trendChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Attendance ranked bar chart">
      ${grid.map((value) => `<line class="grid-line" x1="${x(value)}" x2="${x(value)}" y1="${pad.top - 10}" y2="${height - pad.bottom}"></line><text x="${x(value)}" y="${height - 10}" fill="#6b7280" font-size="11" text-anchor="middle">${pct(value)}</text>`).join("")}
      <line class="threshold-line" x1="${thresholdX}" x2="${thresholdX}" y1="${pad.top - 12}" y2="${height - pad.bottom}"></line>
      <text x="${thresholdX + 8}" y="${pad.top - 16}" fill="#b45309" font-size="12" font-weight="800">60% floor</text>
      <line class="axis" x1="${pad.left}" x2="${width - pad.right}" y1="${height - pad.bottom}" y2="${height - pad.bottom}"></line>
      ${bars}
    </svg>
  `;
}

function toneClass(value) {
  if (!Number.isFinite(value)) return "";
  if (value > 0.5) return "positive";
  if (value < -0.5) return "negative";
  return "neutral";
}

function renderRmMatrix(areaManagers) {
  els.rmMatrix.innerHTML = regionalSummary(areaManagers).map((record, index) => `
    <button class="rm-card ${state.rm === record.rm ? "selected" : ""}" type="button" data-rm="${record.rm}">
      <span class="rm-card-name">${record.rm}</span>
      <span class="rm-card-score">${pct(record.fourWeekAvg)}</span>
      <span class="rm-card-meta">1M ${pct(record.fourWeekAvg)} / 3M ${pct(record.threeMonthAvg)}</span>
    </button>
  `).join("") || `<p class="empty">No regional data found.</p>`;

  els.rmMatrix.querySelectorAll(".rm-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.rm = state.rm === button.dataset.rm ? "All" : button.dataset.rm;
      render();
    });
  });
}

function renderTables(areaManagers) {
  els.rmTable.innerHTML = regionalSummary(areaManagers).map((record) => `
    <tr>
      <td>${record.rm}</td>
      <td class="metric ${Number.isFinite(record.vacancyPct) && record.vacancyPct > 0 ? "negative" : "positive"}">${pct(record.vacancyPct)}</td>
      <td class="metric">${record.sams}</td>
      <td class="metric">${record.ams}</td>
      <td class="metric">${record.tms ?? "n/a"}</td>
      <td class="metric">${record.vacantTmCapacity ?? "n/a"}</td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="empty">No regional manager data found.</td></tr>`;

  els.amTable.innerHTML = areaManagers
    .slice()
    .sort((a, b) => latestValue(b) - latestValue(a))
    .map((record, index) => `
      <tr>
        <td class="metric">${index + 1}</td>
        <td>${record.am}</td>
        <td>${statesForAreaManager(record.am)}</td>
        <td>${record.sam}</td>
        <td>${record.rm}</td>
        <td class="metric">${pct(latestValue(record))}</td>
        <td class="${toneClass(delta(record))}">${signed(delta(record))}</td>
        <td>${pct(lastNAvg(record, 4))}</td>
      </tr>
    `).join("") || `<tr><td colspan="8" class="empty">No area manager data found.</td></tr>`;
}

function render() {
  const areaManagers = filteredAreaManagers();
  renderKpis(data.areaManagers);
  renderRmMatrix(data.areaManagers);
  renderChart(areaManagers);
  renderTables(areaManagers);
}

async function initializeDashboard() {
  render();

  try {
    const liveData = await loadLiveDashboardData();
    data = liveData;
    render();
  } catch (error) {
    console.warn("Using dashboard snapshot because live Google Sheet loading failed.", error);
    render();
  }
}

initializeDashboard();
