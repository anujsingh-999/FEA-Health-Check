let data = window.DASHBOARD_DATA;
const branchStructure = window.BRANCH_STRUCTURE || { regionalManagers: {} };
const indiaStates = window.INDIA_STATES_GEOJSON || { features: [] };
const SPREADSHEET_ID = "11kof2bCLpS-q7WFQdFM0_jkxp0mB3_vUA0bo_hM8wgQ";
const OPERATIONS_URL = "http://103.27.234.18:8080/rmwisebranch.aspx";
const SHEET_NAMES = ["Overall", "AM wise", "SAM wise", "RM wise", "Low Attednance", "Targets", "Branch Per RM", "Emp Attrition"];
const DECEMBER_2026_MILESTONES = {
  "Ankita Srivastava": 290,
  "Darshana Vishwakarma": 500,
  "Deepak Verma": 600,
  "Manikant Mishra": 450,
  "Mukesh Upadhyay": 400,
  "Surbhi Chaudhary": 320,
  Total: 2560,
};

const state = {
  rm: "All",
  activeTab: "student",
  selectedBranchRm: null,
  selectedCapacityRm: null,
  selectedTeacherWeek: null,
};

const els = {
  kpis: document.querySelector("#kpis"),
  trendTitle: document.querySelector("#trendTitle"),
  trendChart: document.querySelector("#trendChart"),
  trendLegend: document.querySelector("#trendLegend"),
  heatmapTitle: document.querySelector("#heatmapTitle"),
  attendanceHeatmap: document.querySelector("#attendanceHeatmap"),
  rmMatrix: document.querySelector("#rmMatrix"),
  rmTable: document.querySelector("#rmTable"),
  amTable: document.querySelector("#amTable"),
  branchGrowthTable: document.querySelector("#branchGrowthTable"),
  branchAmGrowthTable: document.querySelector("#branchAmGrowthTable"),
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

function htmlTableToRecords(table) {
  const rows = [...table.querySelectorAll("tr")].map((row) =>
    [...row.querySelectorAll("th,td")].map((cell) => cell.textContent.replace(/\u00a0/g, " ").trim()),
  ).filter((row) => row.some(Boolean));
  const headers = rows[0] || [];
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

function fieldNumber(record, field) {
  return numericValue(record?.[field]);
}

function readOperationsPage(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = [...doc.querySelectorAll("table")];
  const rmRecords = htmlTableToRecords(tables.find((table) => table.id === "GridView2") || tables[0] || document.createElement("table"));
  const amRecords = htmlTableToRecords(tables.find((table) => table.id === "GridView1") || tables[1] || document.createElement("table"));
  const rmRows = rmRecords.filter((record) => record.RM && record.RM.toLowerCase() !== "total");
  const totalRow = rmRecords.find((record) => String(record.RM || "").toLowerCase() === "total");
  const summary = {
    ams: fieldNumber(totalRow, "AMs"),
    tms: fieldNumber(totalRow, "TMs"),
    branches: fieldNumber(totalRow, "Branches"),
    branchesWithLaptop: fieldNumber(totalRow, "Branchwithlaptop"),
    laptops: fieldNumber(totalRow, "Laptops"),
    tablets: fieldNumber(totalRow, "Tablets and Jio Book"),
    datacards: fieldNumber(totalRow, "datacard"),
    trolleys: fieldNumber(totalRow, "Trolly"),
    cameras: fieldNumber(totalRow, "Camera"),
    airfiber: fieldNumber(totalRow, "airfiber"),
  };

  const ams = amRecords.filter((record) => record.AM).map((record) => {
    const branches = fieldNumber(record, "Branches");
    const laptops = fieldNumber(record, "Laptops") || 0;
    const tablets = fieldNumber(record, "Tablets and Jio Book") || 0;
    return {
      am: record.AM,
      rm: record.RM,
      sam: record.SAM,
      tms: fieldNumber(record, "TMs"),
      branches,
      branchesWithLaptop: fieldNumber(record, "Branchwithlaptop"),
      laptops,
      tablets,
      devices: laptops + tablets,
      devicesPerBranch: branches ? (laptops + tablets) / branches : null,
      datacards: fieldNumber(record, "datacard"),
      trolleys: fieldNumber(record, "Trolly"),
      cameras: fieldNumber(record, "Camera"),
      airfiber: fieldNumber(record, "airfiber"),
    };
  });

  const rmSummary = Object.fromEntries(rmRows.map((record) => [record.RM, {
    rm: record.RM,
    ams: fieldNumber(record, "AMs"),
    tms: fieldNumber(record, "TMs"),
    branches: fieldNumber(record, "Branches"),
    branchesWithLaptop: fieldNumber(record, "Branchwithlaptop"),
    laptops: fieldNumber(record, "Laptops"),
    tablets: fieldNumber(record, "Tablets and Jio Book"),
    devices: (fieldNumber(record, "Laptops") || 0) + (fieldNumber(record, "Tablets and Jio Book") || 0),
    datacards: fieldNumber(record, "datacard"),
    trolleys: fieldNumber(record, "Trolly"),
    cameras: fieldNumber(record, "Camera"),
    airfiber: fieldNumber(record, "airfiber"),
  }]));

  const enrollment = readEnrollmentFromOperationsTables(tables);
  return { sourceUrl: OPERATIONS_URL, summary, rmSummary, ams, enrollment };
}

function readEnrollmentFromOperationsTables(tables) {
  for (const table of tables) {
    const records = htmlTableToRecords(table);
    if (!records.length) continue;
    const headers = Object.keys(records[0]);
    const hasEnrollment = headers.some((header) => /enrol|student/i.test(header));
    if (!hasEnrollment) continue;
    const total = records.find((record) => /total|overall/i.test(Object.values(record).join(" "))) || records.at(-1);
    const enrolledKey = headers.find((header) => /enrol|student/i.test(header) && !/%|percent|capacity/i.test(header));
    const capacityKey = headers.find((header) => /capacity/i.test(header));
    const pctKey = headers.find((header) => /%|percent/i.test(header));
    const enrolled = fieldNumber(total, enrolledKey);
    const capacity = fieldNumber(total, capacityKey);
    const pctValue = fieldNumber(total, pctKey);
    return {
      enrolled,
      capacity,
      pct: Number.isFinite(pctValue) ? pctValue : (Number.isFinite(enrolled) && Number.isFinite(capacity) && capacity > 0 ? (enrolled / capacity) * 100 : null),
    };
  }
  return null;
}

async function loadOperationsData() {
  const response = await fetch(OPERATIONS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load operations page: ${response.status}`);
  return readOperationsPage(await response.text());
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

function canonicalRmName(rm) {
  const text = normalizeRmName(rm);
  if (/darshana/i.test(text)) return "Darshana Vishwakarma";
  return text;
}

function milestoneForRm(rm) {
  return DECEMBER_2026_MILESTONES[canonicalRmName(rm)] ?? null;
}

function monthsUntilDecember2026() {
  const now = new Date();
  const target = new Date(2026, 11, 31);
  if (now >= target) return 0;
  return Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + target.getMonth() - now.getMonth() + 1);
}

function milestoneStatus(record) {
  const milestone = milestoneForRm(record.rm);
  const activeBranches = data.operations?.rmSummary?.[record.rm]?.branches ?? record.latest?.branches;
  if (!Number.isFinite(milestone)) return { value: "n/a", note: "Milestone not set", className: "muted-cell" };
  if (!Number.isFinite(activeBranches)) return { value: milestone.toString(), note: "Waiting for active branch count", className: "muted-cell" };

  const remaining = Math.max(0, milestone - activeBranches);
  const requiredMonthly = remaining / monthsUntilDecember2026();
  const recentMonthly = Number.isFinite(record.fourWeekGrowth) ? record.fourWeekGrowth : null;
  if (!Number.isFinite(recentMonthly)) {
    return { value: milestone.toString(), note: `${remaining} remaining`, className: "muted-cell" };
  }

  const onTrack = recentMonthly >= requiredMonthly;
  return {
    value: milestone.toString(),
    note: `${onTrack ? "On track" : "Behind"}: +${Math.round(requiredMonthly)} / month needed`,
    className: onTrack ? "positive" : "negative",
  };
}

function tmVacanciesForAreaManager(tms) {
  return Number.isFinite(tms) ? Math.max(0, 10 - tms) : null;
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
  const live = data.operations?.rmSummary?.[rm];
  const record = branchStructure.regionalManagers?.[rm];
  return {
    branches: live?.branches ?? record?.branches?.length ?? null,
    ams: live?.ams ?? record?.areaManagers?.length ?? null,
    tms: live?.tms ?? record?.tms?.length ?? null,
    atms: record?.atms?.length ?? null,
  };
}

function totalActiveBranches() {
  if (Number.isFinite(data.operations?.summary?.branches)) return data.operations.summary.branches;
  const branchLists = Object.values(branchStructure.regionalManagers || {}).flatMap((record) => record.branches || []);
  if (branchLists.length) return unique(branchLists).length;
  return unique(data.lowAttendance.map((record) => record.center)).length;
}

function totalHiredTms() {
  if (Number.isFinite(data.operations?.summary?.tms)) return data.operations.summary.tms;
  const tmLists = Object.values(branchStructure.regionalManagers || {}).flatMap((record) => record.tms || []);
  return unique(tmLists).length;
}

function latestStudentCapacityPct() {
  return data.operations?.enrollment?.pct ?? null;
}

function deviceGapSummary() {
  const rows = data.operations?.ams || [];
  const weak = rows.filter((record) => Number.isFinite(record.devicesPerBranch) && record.devicesPerBranch < 15);
  return {
    ams: weak.length,
    tms: weak.reduce((sum, record) => sum + (record.tms || 0), 0),
  };
}

function latestPeopleMovement() {
  return (data.peopleMovement || [])
    .filter((record) => Number.isFinite(record.employed) || Number.isFinite(record.net))
    .at(-1) || {};
}

function totalTmCapacityGap() {
  const activeBranches = totalActiveBranches();
  const hiredTms = totalHiredTms();
  return Number.isFinite(activeBranches) && Number.isFinite(hiredTms)
    ? Math.max(0, Math.ceil(activeBranches / 10) - hiredTms)
    : null;
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

function normalizeStateName(state) {
  const value = String(state || "").trim().toLowerCase();
  const aliases = {
    pb: "Punjab",
    "nct of delhi": "Delhi",
    "andaman and nicobar": "Andaman and Nicobar",
    "dadra and nagar haveli": "Dadra and Nagar Haveli",
    "daman and diu": "Daman and Diu",
    odisha: "Orissa",
    uttarakhand: "Uttaranchal",
  };
  if (aliases[value]) return aliases[value];
  return String(state || "").trim();
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
  const studentCapacityPct = latestStudentCapacityPct();
  const totalStudentCapacity = data.operations?.enrollment?.capacity ?? activeBranches * 60;
  const currentStudents = data.operations?.enrollment?.enrolled ?? (Number.isFinite(studentCapacityPct) ? Math.round((studentCapacityPct / 100) * totalStudentCapacity) : null);
  const people = latestPeopleMovement();
  const studentCards = [
    [`${latestWeekLabel(areaManagers).replace("Week ", "W ")} Attendance`, pctRound(latest), "Latest available weekly attendance"],
    ["4-Week Average", pctRound(fourWeekAvg), fourWeeks.map((point) => `${point.week.replace("Week ", "W ")} ${pctRound(point.value)}`).join(" / ")],
    ["3-Month Average", pctRound(threeMonthAvg), "Rolling 12-week attendance average"],
    ["Enrolment %", pctRound(studentCapacityPct), Number.isFinite(currentStudents) ? `${currentStudents} students / ${totalStudentCapacity} capacity` : `${totalStudentCapacity} capacity from ${activeBranches} branches; waiting for enrolment table`],
    ["Active Branches", activeBranches.toString(), data.operations ? "Live branch count from operations page" : "Branches with attendance records across FEA"],
  ];
  const staffCards = [
    ["Teaching Staff", Number.isFinite(people.employed) ? people.employed.toString() : "n/a", people.week ? `${people.week} employed teaching staff` : "Waiting for staff movement data"],
    ["Net Increase", Number.isFinite(people.net) ? `${people.net > 0 ? "+" : ""}${people.net}` : "n/a", people.week ? `${people.week}: ${Number.isFinite(people.hired) ? `${people.hired} hired` : "hiring n/a"} / ${Number.isFinite(people.exited) ? `${people.exited} exited` : "exits n/a"}` : "Latest hired minus exited"],
    ["Branches / TM", Number.isFinite(branchesPerTm) ? branchesPerTm.toFixed(1) : "n/a", `${activeBranches} branches / ${hiredTms || "n/a"} TMs; 10 expected per TM`],
    ["Total branches with less than 15 devices", "n/a", "Waiting for branch-level device data"],
  ];
  const cards = state.activeTab === "staff" ? staffCards : studentCards;

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
    : "Regional Four-Week Attendance Ranking";

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

function heatmapClass(value) {
  if (!Number.isFinite(value)) return "empty";
  if (value < 50) return "critical";
  if (value < 60) return "warning";
  if (value < 70) return "steady";
  return "strong";
}

function escapeAttr(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function geometryCoordinates(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

function flattenCoordinates(geometry) {
  return geometryCoordinates(geometry).flat();
}

function geoPath(geometry, project) {
  return geometryCoordinates(geometry)
    .map((ring) => {
      const points = ring.map(([lon, lat]) => project(lon, lat));
      if (!points.length) return "";
      return `M ${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")} Z`;
    })
    .join(" ");
}

function geoLabelPoint(geometry, project) {
  const points = flattenCoordinates(geometry).map(([lon, lat]) => project(lon, lat));
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
}

function clusterPoint(center, index, total) {
  if (!center) return null;
  if (total <= 1) return center;
  const ring = Math.ceil((Math.sqrt(index + 1) - 1) / 2);
  const ringStart = Math.max(0, (2 * ring - 1) ** 2);
  const position = index - ringStart;
  const ringCount = Math.max(1, (2 * ring + 1) ** 2 - ringStart);
  const angle = (position / ringCount) * Math.PI * 2 - Math.PI / 2;
  const radius = 20 + ring * 18;
  return [
    center[0] + Math.cos(angle) * radius,
    center[1] + Math.sin(angle) * radius,
  ];
}

function initials(name) {
  return String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
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
    button.onclick = () => {
      state.rm = state.rm === button.dataset.rm ? "All" : button.dataset.rm;
      render();
    };
  });
}

function renderAttendanceHeatmap(areaManagers) {
  if (!els.attendanceHeatmap) return;

  els.heatmapTitle.textContent = state.rm === "All"
    ? `India map by last ${mapWindowLabel()} attendance`
    : `India map under ${state.rm} - last ${mapWindowLabel()}`;

  if (!indiaStates.features.length) {
    els.attendanceHeatmap.innerHTML = `<p class="empty">India map boundary data is not available.</p>`;
    return;
  }

  const stateMetrics = new Map();
  for (const record of areaManagers) {
    const value = lastNAvg(record, state.mapWindow);
    const states = areaManagerDetails(record.am).states || [];
    for (const stateName of states) {
      const normalized = normalizeStateName(stateName);
      if (!normalized || !Number.isFinite(value)) continue;
      if (!stateMetrics.has(normalized)) {
        stateMetrics.set(normalized, { values: [], ams: new Set(), rms: new Set() });
      }
      const metric = stateMetrics.get(normalized);
      metric.values.push(value);
      metric.ams.add(record.am);
      metric.rms.add(record.rm);
      if (!metric.amRecords) metric.amRecords = [];
      metric.amRecords.push(record);
    }
  }

  const stateSummary = new Map([...stateMetrics.entries()].map(([name, metric]) => [name, {
    avg: avg(metric.values),
    ams: metric.ams.size,
    rms: [...metric.rms],
    amRecords: metric.amRecords || [],
  }]));

  const coords = indiaStates.features.flatMap((feature) => flattenCoordinates(feature.geometry));
  const lons = coords.map(([lon]) => lon);
  const lats = coords.map(([, lat]) => lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const width = 720;
  const height = 760;
  const pad = 28;
  const scale = Math.min((width - pad * 2) / (maxLon - minLon), (height - pad * 2) / (maxLat - minLat));
  const mapWidth = (maxLon - minLon) * scale;
  const mapHeight = (maxLat - minLat) * scale;
  const offsetX = (width - mapWidth) / 2;
  const offsetY = (height - mapHeight) / 2;
  const project = (lon, lat) => [
    offsetX + (lon - minLon) * scale,
    offsetY + (maxLat - lat) * scale,
  ];
  const weakestStates = [...stateSummary.entries()]
    .filter(([, metric]) => Number.isFinite(metric.avg))
    .sort((a, b) => a[1].avg - b[1].avg)
    .slice(0, 6);
  const selectedState = state.selectedMapState && stateSummary.has(state.selectedMapState)
    ? state.selectedMapState
    : null;
  const selectedMetric = selectedState ? stateSummary.get(selectedState) : null;
  const selectedAms = selectedMetric
    ? selectedMetric.amRecords
      .slice()
      .sort((a, b) => lastNAvg(a, state.mapWindow) - lastNAvg(b, state.mapWindow))
    : [];
  const mapFeatures = indiaStates.features.map((feature) => {
    const stateName = normalizeStateName(feature.properties?.name);
    const metric = stateSummary.get(stateName);
    const value = metric?.avg;
    const ams = metric?.amRecords
      ?.slice()
      .sort((a, b) => lastNAvg(a, state.mapWindow) - lastNAvg(b, state.mapWindow))
      .map((record) => `${record.am}: ${pctRound(lastNAvg(record, state.mapWindow))}`)
      .join(" | ") || "";
    return {
      feature,
      stateName,
      metric,
      value,
      labelPoint: Number.isFinite(value) ? geoLabelPoint(feature.geometry, project) : null,
      tooltip: Number.isFinite(value)
        ? `${stateName} - ${pct(value)} / ${metric.ams} AMs / ${ams}`
        : `${stateName}: no FEA attendance data mapped`,
    };
  });
  const homeStateAms = new Map();
  for (const record of areaManagers) {
    const homeState = normalizeStateName((areaManagerDetails(record.am).states || [])[0]);
    const value = lastNAvg(record, state.mapWindow);
    if (!homeState || !Number.isFinite(value) || !stateSummary.has(homeState)) continue;
    if (!homeStateAms.has(homeState)) homeStateAms.set(homeState, []);
    homeStateAms.get(homeState).push({ record, value });
  }
  const mapNodes = mapFeatures.flatMap((item) => {
    const center = item.labelPoint;
    const ams = (homeStateAms.get(item.stateName) || [])
      .slice()
      .sort((a, b) => a.value - b.value);
    return ams.map((am, index) => ({
      ...am,
      stateName: item.stateName,
      point: clusterPoint(center, index, ams.length),
    })).filter((node) => node.point);
  });

  els.attendanceHeatmap.innerHTML = `
    <div class="geo-map-layout">
      <div class="india-map-wrap">
        <div class="geo-hover-card" hidden></div>
        <svg class="india-map" viewBox="0 0 ${width} ${height}" role="img" aria-label="India attendance heat map by state">
          ${mapFeatures.map(({ feature, stateName, value, tooltip }) => `
              <path class="india-state ${heatmapClass(value)} ${stateName === selectedState ? "selected" : ""}" data-state="${escapeAttr(stateName)}" data-tooltip="${escapeAttr(tooltip)}" tabindex="0" d="${geoPath(feature.geometry, project)}">
                <title>${tooltip}</title>
              </path>
          `).join("")}
          ${mapNodes.map(({ record, value, stateName, point }) => `
            <g class="am-map-node" data-state="${escapeAttr(stateName)}" data-tooltip="${escapeAttr(`${record.am} - ${pct(value)} / ${record.rm} / ${stateName}`)}" tabindex="0" transform="translate(${point[0].toFixed(1)} ${point[1].toFixed(1)})">
              <circle class="${heatmapClass(value)}" r="15"></circle>
              <text y="4">${Math.round(value)}</text>
              <title>${record.am}: ${pct(value)} / ${record.rm} / ${stateName}</title>
            </g>
          `).join("")}
        </svg>
      </div>
      <div class="geo-map-panel">
        <p class="geo-map-note">State color shows the selected-period average. Each dot is one Area Manager placed in their home territory; dot color and number show that AM's attendance.</p>
        ${selectedState ? `
          <div class="geo-detail-heading">
            <div>
              <span>${selectedState}</span>
              <small>${selectedMetric.ams} AMs / ${selectedMetric.rms.join(", ")}</small>
            </div>
            <strong class="${heatmapClass(selectedMetric.avg)}">${pctRound(selectedMetric.avg)}</strong>
          </div>
          <div class="geo-am-list">
            ${selectedAms.map((record) => {
              const value = lastNAvg(record, state.mapWindow);
              return `
                <div class="geo-am-row">
                  <div>
                    <span>${record.am}</span>
                    <small>${record.rm}</small>
                  </div>
                  <strong class="${heatmapClass(value)}">${pctRound(value)}</strong>
                </div>
              `;
            }).join("")}
          </div>
          <button class="geo-clear" type="button" data-clear-state>Show weakest states</button>
        ` : `
          <div class="geo-state-list">
            ${weakestStates.map(([name, metric]) => `
              <button class="geo-state-card" type="button" data-state-card="${escapeAttr(name)}">
                <span>${name}</span>
                <strong class="${heatmapClass(metric.avg)}">${pctRound(metric.avg)}</strong>
                <small>${metric.ams} AMs / ${metric.rms.join(", ")}</small>
              </button>
            `).join("") || `<p class="empty">No states are mapped to current attendance data.</p>`}
          </div>
        `}
      </div>
    </div>
  `;

  els.attendanceHeatmap.querySelectorAll("[data-state], [data-state-card]").forEach((item) => {
    item.addEventListener("click", () => {
      const clickedState = item.dataset.state || item.dataset.stateCard;
      if (!stateSummary.has(clickedState)) return;
      state.selectedMapState = clickedState;
      render();
    });
    item.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      item.click();
    });
  });

  const clearButton = els.attendanceHeatmap.querySelector("[data-clear-state]");
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      state.selectedMapState = null;
      render();
    });
  }

  document.querySelectorAll("[data-map-window]").forEach((button) => {
    const weeks = Number(button.dataset.mapWindow);
    button.classList.toggle("selected", weeks === state.mapWindow);
    button.addEventListener("click", () => {
      state.mapWindow = weeks;
      state.selectedMapState = null;
      render();
    });
  });

  const hoverCard = els.attendanceHeatmap.querySelector(".geo-hover-card");
  els.attendanceHeatmap.querySelectorAll(".india-state, .am-map-node").forEach((item) => {
    const showTooltip = () => {
      if (!hoverCard || !item.dataset.tooltip) return;
      hoverCard.hidden = false;
      const [title, ...details] = item.dataset.tooltip.split(" / ");
      hoverCard.innerHTML = `
        <strong>${escapeHtml(title)}</strong>
        ${details.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}
      `;
    };
    const moveTooltip = (event) => {
      if (!hoverCard) return;
      const bounds = els.attendanceHeatmap.querySelector(".india-map-wrap").getBoundingClientRect();
      hoverCard.style.left = `${Math.min(bounds.width - 230, Math.max(12, event.clientX - bounds.left + 14))}px`;
      hoverCard.style.top = `${Math.min(bounds.height - 110, Math.max(12, event.clientY - bounds.top + 14))}px`;
    };
    item.addEventListener("mouseenter", showTooltip);
    item.addEventListener("mousemove", moveTooltip);
    item.addEventListener("mouseleave", () => {
      if (hoverCard) hoverCard.hidden = true;
    });
    item.addEventListener("focus", showTooltip);
    item.addEventListener("blur", () => {
      if (hoverCard) hoverCard.hidden = true;
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

  if (!rows.some((record) => record.week === state.selectedTeacherWeek)) {
    state.selectedTeacherWeek = rows.at(-1)?.week;
  }
  const selected = rows.find((record) => record.week === state.selectedTeacherWeek) || rows.at(-1);
  const width = 920;
  const height = 380;
  const pad = { top: 44, right: 48, bottom: 78, left: 78 };
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
  const netBaseY = height - 44;
  const netScale = 56 / maxNet;
  const points = rows.map((record, index) => `${x(index).toFixed(1)},${y(record.employed).toFixed(1)}`).join(" ");
  const ticks = [employedMin, employedMin + (employedMax - employedMin) / 2, employedMax];
  const selectedIndex = rows.findIndex((record) => record.week === selected.week);
  const selectedX = x(Math.max(0, selectedIndex));
  const selectedY = y(selected.employed);

  els.teacherGrowthChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Teaching staff net increase by week">
      <defs>
        <linearGradient id="teacherLineFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#3b6ea8" stop-opacity="0.2"></stop>
          <stop offset="100%" stop-color="#3b6ea8" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${ticks.map((tick) => `
        <line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick)}" y2="${y(tick)}"></line>
        <text x="${pad.left - 12}" y="${y(tick) + 4}" text-anchor="end" fill="#6b7280" font-size="11">${Math.round(tick)}</text>
      `).join("")}
      <polygon points="${pad.left},${height - pad.bottom} ${points} ${width - pad.right},${height - pad.bottom}" fill="url(#teacherLineFill)"></polygon>
      <polyline points="${points}" fill="none" stroke="#3b6ea8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
      <line class="axis" x1="${pad.left}" x2="${width - pad.right}" y1="${netBaseY}" y2="${netBaseY}"></line>
      ${rows.map((record, index) => {
        const barHeight = Math.abs(record.net) * netScale;
        const barY = record.net >= 0 ? netBaseY - barHeight : netBaseY;
        const fill = record.net >= 0 ? "#0f766e" : "#b42318";
        const selectedClass = record.week === selected.week ? " selected" : "";
        return `
          <g class="teacher-week${selectedClass}" tabindex="0" role="button" data-staff-week="${escapeAttr(record.week)}">
            <title>${record.week}: ${record.employed} employed teachers, net ${record.net > 0 ? "+" : ""}${record.net}</title>
            <rect x="${x(index) - 14}" y="${pad.top - 8}" width="28" height="${height - pad.top - 20}" rx="12" fill="transparent"></rect>
            <rect class="teacher-net-bar" x="${x(index) - 10}" y="${barY}" width="20" height="${Math.max(4, barHeight)}" rx="5" fill="${fill}"></rect>
            <circle class="teacher-point" cx="${x(index)}" cy="${y(record.employed)}" r="5.5" fill="#ffffff" stroke="#3b6ea8" stroke-width="2.5"></circle>
            <text x="${x(index)}" y="${record.net >= 0 ? barY - 7 : barY + barHeight + 15}" text-anchor="middle" fill="${fill}" font-size="12" font-weight="900">${record.net > 0 ? "+" : ""}${record.net}</text>
            <text x="${x(index)}" y="${height - 13}" text-anchor="middle" fill="#4b5563" font-size="12" font-weight="750">${String(record.week).replace("Week ", "W")}</text>
          </g>
        `;
      }).join("")}
      <line x1="${selectedX}" x2="${selectedX}" y1="${pad.top - 2}" y2="${netBaseY + 14}" stroke="#c76f2d" stroke-width="2" stroke-dasharray="5 5"></line>
      <circle cx="${selectedX}" cy="${selectedY}" r="8" fill="#ffffff" stroke="#c76f2d" stroke-width="3"></circle>
      <g class="teacher-callout">
        <rect x="${Math.min(width - 300, Math.max(pad.left, selectedX - 132))}" y="14" width="264" height="58" rx="12"></rect>
        <text x="${Math.min(width - 284, Math.max(pad.left + 16, selectedX - 116))}" y="38">${escapeHtml(selected.week)} / ${selected.employed} teachers</text>
        <text x="${Math.min(width - 284, Math.max(pad.left + 16, selectedX - 116))}" y="58">Net ${selected.net > 0 ? "+" : ""}${selected.net}${Number.isFinite(selected.hired) && Number.isFinite(selected.exited) ? ` / ${selected.hired} hired, ${selected.exited} exited` : ""}</text>
      </g>
      <text x="${pad.left}" y="22" fill="#3b6ea8" font-size="13" font-weight="900">Teaching staff</text>
    </svg>
  `;
  els.teacherGrowthChart.querySelectorAll("[data-staff-week]").forEach((item) => {
    item.onclick = () => {
      state.selectedTeacherWeek = item.dataset.staffWeek;
      renderTeacherGrowthChart();
    };
    item.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        state.selectedTeacherWeek = item.dataset.staffWeek;
        renderTeacherGrowthChart();
      }
    };
  });

}

function renderTables(areaManagers) {
  const liveBranchRows = Object.values(data.operations?.rmSummary || {}).map((record) => ({
    rm: record.rm,
    latest: { branches: record.branches },
    fourWeekGrowth: 0,
    fourWeekGrowthPct: null,
    pipelineTeachers: null,
  }));
  const branchGrowthRows = (data.branchGrowth?.length ? data.branchGrowth : liveBranchRows)
    .filter((record) => state.rm === "All" || record.rm === state.rm)
    .sort((a, b) => b.fourWeekGrowth - a.fourWeekGrowth);

  if (els.branchGrowthTable) {
    els.branchGrowthTable.innerHTML = branchGrowthRows.map((record) => {
      const status = milestoneStatus(record);
      return `
        <tr>
          <td><button class="text-link" type="button" data-branch-rm="${escapeAttr(record.rm)}">${escapeHtml(record.rm)}</button></td>
          <td class="metric">${data.operations?.rmSummary?.[record.rm]?.branches ?? record.latest.branches}</td>
          <td class="${record.fourWeekGrowthPct >= 0 ? "positive" : "negative"}">${pct(record.fourWeekGrowthPct)}</td>
          <td class="metric">${record.pipelineTeachers ?? "n/a"}</td>
          <td class="metric milestone-cell">
            <strong>${status.value}</strong>
            <span class="${status.className}">${status.note}</span>
          </td>
        </tr>
      `;
    }).join("") || `<tr><td colspan="5" class="empty">Add a Branch Per RM tab to the Google Sheet to show branch expansion.</td></tr>`;

    els.branchGrowthTable.querySelectorAll("[data-branch-rm]").forEach((button) => {
      button.onclick = () => {
        state.selectedBranchRm = button.dataset.branchRm;
        renderTables(filteredAreaManagers());
      };
    });
  }

  if (els.branchAmGrowthTable) {
    const selectedRm = state.selectedBranchRm;
    const liveRows = (data.operations?.ams || [])
      .filter((record) => record.rm === selectedRm)
      .sort((a, b) => (b.branches || 0) - (a.branches || 0));
    const fallbackRows = data.areaManagers
      .filter((record) => record.rm === selectedRm)
      .map((record) => ({ am: record.am, branches: null }));

    const rows = liveRows.length ? liveRows : fallbackRows;
    els.branchAmGrowthTable.innerHTML = selectedRm && rows.length
      ? rows.map((record) => `
        <tr>
          <td>${record.am}</td>
          <td class="metric">${Number.isFinite(record.branches) ? record.branches : "n/a"}</td>
          <td class="muted-cell">Not available</td>
        </tr>
      `).join("")
      : `<tr><td colspan="3" class="empty">Select an RM above to view Area Manager branch detail.</td></tr>`;
  }

  els.rmTable.innerHTML = regionalSummary(areaManagers).map((record) => {
    const isSelected = record.rm === state.selectedCapacityRm;
    const liveRows = (data.operations?.ams || [])
      .filter((item) => item.rm === record.rm)
      .map((item) => ({
        am: item.am,
        tms: item.tms,
        vacancies: tmVacanciesForAreaManager(item.tms),
      }))
      .sort((a, b) => (b.vacancies || 0) - (a.vacancies || 0));
    const fallbackRows = data.areaManagers
      .filter((item) => item.rm === record.rm)
      .map((item) => ({ am: item.am, tms: null, vacancies: null }));
    const rows = liveRows.length ? liveRows : fallbackRows;
    const detailRows = rows.map((item, index) => `
      <div class="am-capacity-item">
        <span>${index + 1}. ${escapeHtml(item.am)}</span>
        <strong>${Number.isFinite(item.tms) ? item.tms : "n/a"} TMs</strong>
        <em>${Number.isFinite(item.vacancies) ? item.vacancies : "n/a"} vacancies</em>
      </div>
    `).join("");
    const expansion = isSelected
      ? `<tr class="am-expansion-row">
          <td colspan="5">
            <div class="am-expansion">
              ${detailRows || `<p class="empty">No Area Manager detail available for ${escapeHtml(record.rm)}.</p>`}
            </div>
          </td>
        </tr>`
      : "";
    return `
      <tr class="${isSelected ? "selected-row" : ""}">
        <td><button class="text-link" type="button" data-capacity-rm="${escapeAttr(record.rm)}">${escapeHtml(record.rm)}</button></td>
        <td class="metric ${Number.isFinite(record.vacancyPct) && record.vacancyPct > 0 ? "negative" : "positive"}">${pct(record.vacancyPct)}</td>
        <td class="metric">${record.ams}</td>
        <td class="metric">${record.tms ?? "n/a"}</td>
        <td class="metric">${record.vacantTmCapacity ?? "n/a"}</td>
      </tr>
      ${expansion}
    `;
  }).join("") || `<tr><td colspan="5" class="empty">No regional manager data found.</td></tr>`;

  els.rmTable.querySelectorAll("[data-capacity-rm]").forEach((button) => {
    button.onclick = () => {
      state.selectedCapacityRm = state.selectedCapacityRm === button.dataset.capacityRm ? null : button.dataset.capacityRm;
      renderTables(filteredAreaManagers());
    };
  });

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
  document.querySelectorAll("[data-view-tab]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.viewTab === state.activeTab);
    button.onclick = () => {
      state.activeTab = button.dataset.viewTab;
      render();
    };
  });
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== state.activeTab;
  });
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

  try {
    data = { ...data, operations: await loadOperationsData() };
    render();
  } catch (error) {
    console.warn("Using dashboard without live operations page data.", error);
  }
}

initializeDashboard();
