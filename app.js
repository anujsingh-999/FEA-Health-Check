let data = window.DASHBOARD_DATA;
const branchStructure = window.BRANCH_STRUCTURE || { regionalManagers: {} };
const SPREADSHEET_ID = "11kof2bCLpS-q7WFQdFM0_jkxp0mB3_vUA0bo_hM8wgQ";
const SHEET_NAMES = ["Overall", "AM wise", "SAM wise", "RM wise", "Low Attednance", "Targets", "Branch Per RM", "Emp Attrition"];

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
  branchGrowthTable: document.querySelector("#branchGrowthTable"),
  teacherGrowthChart: document.querySelector("#teacherGrowthChart"),
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

function numericValue(value) {
  const cleaned = cleanNumber(value);
  return Number.isFinite(cleaned) ? cleaned : null;
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

function normalizeRmName(label) {
  const text = String(label || "")
    .replace(/\bactual\b/ig, "")
    .replace(/\bRM\b/ig, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/manikant/i.test(text)) return "Manikant Mishra";
  if (/ankita/i.test(text)) return "Ankita Srivastava";
  if (/surbhi/i.test(text)) return "Surbhi Chaudhary";
  if (/deepak/i.test(text)) return "Deepak Verma";
  if (/mukesh/i.test(text)) return "Mukesh Upadhyay";
  if (/darshana/i.test(text)) return "Darshana V";
  return text.split(",")[0].trim();
}

function parsePipeline(value) {
  if (value === null || value === undefined || value === "") return { teachers: null, tms: null };
  const text = String(value).trim();
  const match = text.match(/([0-9.]+)\s*\/\s*([0-9.]+)/);
  if (match) return { teachers: Number(match[1]), tms: Number(match[2]) };
  const teachers = numericValue(value);
  return { teachers, tms: null };
}

function readBranchGrowth(rows) {
  const headerIndex = rows.findIndex((row) => /week/i.test(String(row[0] || "")));
  if (headerIndex < 0) return [];
  const headers = rows[headerIndex];
  const output = [];

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const label = String(row[0] || "").trim();
    if (!label || /pipeline/i.test(label)) continue;
    const pipelineRow = rows[index + 1] && /pipeline/i.test(String(rows[index + 1][0] || "")) ? rows[index + 1] : [];
    const points = [];
    const pipeline = [];

    for (let col = 1; col < headers.length; col += 1) {
      const week = String(headers[col] || "").trim();
      if (!week) continue;
      const branches = numericValue(row[col]);
      if (Number.isFinite(branches)) points.push({ week, branches });
      const pipe = parsePipeline(pipelineRow[col]);
      if (Number.isFinite(pipe.teachers) || Number.isFinite(pipe.tms)) pipeline.push({ week, ...pipe });
    }

    if (points.length) {
      const latest = points.at(-1);
      const comparison = points.length >= 4 ? points.at(-4) : points[0];
      const latestPipeline = pipeline.filter((point) => Number.isFinite(point.teachers) || Number.isFinite(point.tms)).at(-1) || {};
      output.push({
        rm: normalizeRmName(label),
        latest,
        points,
        fourWeekGrowth: latest.branches - comparison.branches,
        fourWeekGrowthPct: comparison.branches ? ((latest.branches - comparison.branches) / comparison.branches) * 100 : null,
        pipelineTeachers: latestPipeline.teachers ?? null,
        pipelineTms: latestPipeline.tms ?? null,
      });
    }
  }

  return output;
}

function readPeopleMovement(rows) {
  const wideHeaderIndex = rows.findIndex((row) => /^rural teachers$/i.test(String(row[0] || "").trim()));
  if (wideHeaderIndex >= 0) {
    const header = rows[wideHeaderIndex];
    const metricRows = new Map();
    for (const row of rows.slice(wideHeaderIndex + 1)) {
      const label = String(row[0] || "").trim();
      if (label) metricRows.set(label.toLowerCase(), row);
    }

    const employedRow = metricRows.get("employed") || [];
    const retentionRow = [...metricRows.entries()].find(([label]) => /retention/i.test(label))?.[1] || [];
    const hiredRow = metricRows.get("hired") || [];
    const attritionStart = rows.findIndex((row) => /attrition/i.test(String(row[0] || "")));
    const exitRows = attritionStart >= 0
      ? rows.slice(attritionStart + 1).filter((row) => {
        const label = String(row[0] || "").trim();
        return label && !/bonus/i.test(label);
      })
      : [];

    const output = [];
    for (let col = 1; col < header.length; col += 1) {
      const week = header[col];
      const hired = numericValue(hiredRow[col]);
      const employed = numericValue(employedRow[col]);
      const retention = numericValue(retentionRow[col]);
      const exited = exitRows.reduce((sum, row) => {
        const value = numericValue(row[col]);
        return Number.isFinite(value) ? sum + value : sum;
      }, 0);
      if (week && (Number.isFinite(hired) || Number.isFinite(employed) || exited > 0)) {
        output.push({
          week: `Week ${week}`,
          employed,
          hired,
          exited,
          net: (Number.isFinite(hired) ? hired : 0) - exited,
          retention: Number.isFinite(retention) ? retention * 100 : null,
        });
      }
    }
    return output;
  }

  const headers = rows[0] || [];
  const weekIndex = headers.findIndex((label) => /week/i.test(String(label)));
  const hiredIndex = headers.findIndex((label) => /hired/i.test(String(label)));
  const exitedIndex = headers.findIndex((label) => /exit|attrition/i.test(String(label)));
  if (weekIndex < 0 || hiredIndex < 0 || exitedIndex < 0) return [];

  return rows.slice(1).map((row) => {
    const hired = numericValue(row[hiredIndex]);
    const exited = numericValue(row[exitedIndex]);
    return {
      week: row[weekIndex],
      hired,
      exited,
      net: Number.isFinite(hired) && Number.isFinite(exited) ? hired - exited : null,
    };
  }).filter((record) => record.week && Number.isFinite(record.net));
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
    branchGrowth: readBranchGrowth(workbook["Branch Per RM"] || []),
    peopleMovement: readPeopleMovement(workbook["Emp Attrition"] || []),
  };
}

function pct(value) {
  return Number.isFinite(value) ? `${Math.round(value * 10) / 10}%` : "n/a";
}

function pctRound(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : "n/a";
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
    [`${latestWeekLabel(areaManagers).replace("Week ", "W")} attendance`, pctRound(latest), "Latest available weekly attendance"],
    ["4-week average", pctRound(fourWeekAvg), fourWeeks.map((point) => `${point.week.replace("Week ", "W")} ${pctRound(point.value)}`).join(" / ")],
    ["3-month average", pctRound(threeMonthAvg), "Rolling 12-week attendance average"],
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
      <span class="rm-card-score">${pctRound(record.fourWeekAvg)}</span>
      <span class="rm-card-meta">1M ${pctRound(record.fourWeekAvg)} / 3M ${pctRound(record.threeMonthAvg)}</span>
    </button>
  `).join("") || `<p class="empty">No regional data found.</p>`;

  els.rmMatrix.querySelectorAll(".rm-card").forEach((button) => {
    button.addEventListener("click", () => {
      state.rm = state.rm === button.dataset.rm ? "All" : button.dataset.rm;
      render();
    });
  });
}

function renderTeacherGrowthChart() {
  if (!els.teacherGrowthChart) return;

  const rows = (data.peopleMovement || [])
    .filter((record) => Number.isFinite(record.employed) && Number.isFinite(record.net))
    .slice(-12);

  if (!rows.length) {
    els.teacherGrowthChart.innerHTML = `<p class="empty">Add an Emp Attrition tab with Employed, Hired, and Attrition rows to show teacher hiring growth.</p>`;
    return;
  }

  const width = 920;
  const height = 350;
  const pad = { top: 38, right: 44, bottom: 72, left: 72 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const employedValues = rows.map((record) => record.employed);
  const minEmployed = Math.min(...employedValues);
  const maxEmployed = Math.max(...employedValues);
  const employedSpread = Math.max(1, maxEmployed - minEmployed);
  const employedMin = Math.max(0, minEmployed - employedSpread * 0.18);
  const employedMax = maxEmployed + employedSpread * 0.18;
  const maxNet = Math.max(1, ...rows.map((record) => Math.abs(record.net)));
  const x = (index) => pad.left + (rows.length === 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth);
  const y = (value) => pad.top + ((employedMax - value) / (employedMax - employedMin)) * chartHeight;
  const netBaseY = height - 38;
  const netScale = 38 / maxNet;
  const points = rows.map((record, index) => `${x(index).toFixed(1)},${y(record.employed).toFixed(1)}`).join(" ");
  const ticks = [employedMin, employedMin + (employedMax - employedMin) / 2, employedMax];

  els.teacherGrowthChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Teacher hiring growth by week">
      <defs>
        <linearGradient id="teacherLineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#146eb4" stop-opacity="0.18"></stop>
          <stop offset="100%" stop-color="#146eb4" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${ticks.map((tick) => `
        <line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick)}" y2="${y(tick)}"></line>
        <text x="${pad.left - 12}" y="${y(tick) + 4}" text-anchor="end" fill="#6b7280" font-size="11">${Math.round(tick)}</text>
      `).join("")}
      <polygon points="${pad.left},${height - pad.bottom} ${points} ${width - pad.right},${height - pad.bottom}" fill="url(#teacherLineFill)"></polygon>
      <polyline points="${points}" fill="none" stroke="#146eb4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
      <line class="axis" x1="${pad.left}" x2="${width - pad.right}" y1="${netBaseY}" y2="${netBaseY}"></line>
      ${rows.map((record, index) => {
        const barHeight = Math.abs(record.net) * netScale;
        const barY = record.net >= 0 ? netBaseY - barHeight : netBaseY;
        const fill = record.net >= 0 ? "#047857" : "#b91c1c";
        return `
          <circle cx="${x(index)}" cy="${y(record.employed)}" r="4.5" fill="#ffffff" stroke="#146eb4" stroke-width="2">
            <title>${record.week}: ${record.employed} employed teachers, net ${record.net > 0 ? "+" : ""}${record.net}</title>
          </circle>
          <rect x="${x(index) - 8}" y="${barY}" width="16" height="${Math.max(2, barHeight)}" rx="4" fill="${fill}" opacity="0.88"></rect>
          <text x="${x(index)}" y="${record.net >= 0 ? barY - 6 : barY + barHeight + 14}" text-anchor="middle" fill="${fill}" font-size="11" font-weight="800">${record.net > 0 ? "+" : ""}${record.net}</text>
          <text x="${x(index)}" y="${height - 12}" text-anchor="middle" fill="#6b7280" font-size="11">${String(record.week).replace("Week ", "W")}</text>
        `;
      }).join("")}
      <text x="${pad.left}" y="20" fill="#146eb4" font-size="12" font-weight="850">Employed teachers</text>
      <text x="${width - pad.right}" y="20" text-anchor="end" fill="#6b7280" font-size="12" font-weight="750">Bars show net increase</text>
    </svg>
  `;
}

function renderTables(areaManagers) {
  const branchGrowthRows = (data.branchGrowth || [])
    .filter((record) => state.rm === "All" || record.rm === state.rm)
    .sort((a, b) => b.fourWeekGrowth - a.fourWeekGrowth);

  if (els.branchGrowthTable) {
    els.branchGrowthTable.innerHTML = branchGrowthRows.map((record) => `
      <tr>
        <td>${record.rm}</td>
        <td class="metric">${record.latest.branches}</td>
        <td class="${record.fourWeekGrowthPct >= 0 ? "positive" : "negative"}">${pct(record.fourWeekGrowthPct)}</td>
        <td class="metric">${record.pipelineTeachers ?? "n/a"}</td>
      </tr>
    `).join("") || `<tr><td colspan="4" class="empty">Add a Branch Per RM tab to the Google Sheet to show branch expansion.</td></tr>`;
  }

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
        <td>${record.rm}</td>
        <td class="metric">${pct(latestValue(record))}</td>
        <td>${pct(lastNAvg(record, 4))}</td>
      </tr>
    `).join("") || `<tr><td colspan="6" class="empty">No area manager data found.</td></tr>`;
}

function render() {
  const areaManagers = filteredAreaManagers();
  renderKpis(data.areaManagers);
  renderRmMatrix(data.areaManagers);
  renderChart(areaManagers);
  renderTeacherGrowthChart();
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
