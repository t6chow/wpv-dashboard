const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs, ns) {
  const node = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  return node;
}

function svgEl(tag, attrs) {
  return el(tag, attrs, SVG_NS);
}

/** Rounds a raw max up to a visually clean number (1/2/5 * 10^n). */
function niceNumber(value, round) {
  const exp = Math.floor(Math.log10(value));
  const fraction = value / Math.pow(10, exp);
  let niceFraction;
  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }
  return niceFraction * Math.pow(10, exp);
}

function niceTicks(maxRaw, tickCount) {
  const range = niceNumber(maxRaw, false);
  const step = niceNumber(range / (tickCount - 1), true);
  const niceMax = Math.ceil(maxRaw / step) * step;
  const ticks = [];
  for (let v = 0; v <= niceMax + 1e-9; v += step) ticks.push(Math.round(v));
  return { ticks, niceMax };
}

/**
 * Renders a single-series bar chart into `container` as an inline SVG,
 * per dataviz skill mark specs: <=24px bars, 4px rounded caps, direct
 * value labels, tabular y-axis ticks, hover tooltip with the mark as
 * the hit target.
 */
function renderBarChart(container, rows, { key, valueLabel, formatValue }) {
  const width = 720;
  const height = 260;
  const padding = { top: 24, right: 16, bottom: 32, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const rawMax = Math.max(...rows.map((r) => r[key]));
  const { ticks, niceMax } = niceTicks(rawMax, 4);

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": valueLabel,
  });

  const baselineY = padding.top + plotHeight;

  // Gridlines + y-axis ticks (tabular, thousands-comma'd).
  ticks.forEach((t) => {
    const y = padding.top + plotHeight - (t / niceMax) * plotHeight;
    svg.appendChild(
      svgEl("line", {
        class: "axis-line",
        x1: padding.left,
        x2: width - padding.right,
        y1: y,
        y2: y,
        style: "stroke: var(--gridline);",
      })
    );
    const tick = svgEl("text", {
      class: "axis-tick",
      x: padding.left - 8,
      y: y + 4,
      "text-anchor": "end",
    });
    tick.textContent = t.toLocaleString();
    svg.appendChild(tick);
  });

  // Baseline axis.
  svg.appendChild(
    svgEl("line", {
      class: "axis-line",
      x1: padding.left,
      x2: width - padding.right,
      y1: baselineY,
      y2: baselineY,
    })
  );

  const barSlot = plotWidth / rows.length;
  const barWidth = Math.min(24, barSlot * 0.4);
  const radius = 4;

  const tooltip = container.querySelector(".tooltip") || (() => {
    const t = el("div", { class: "tooltip" });
    t.innerHTML = '<span class="tooltip-value"></span> <span class="tooltip-label"></span>';
    container.appendChild(t);
    return t;
  })();
  const tooltipValue = tooltip.querySelector(".tooltip-value");
  const tooltipLabel = tooltip.querySelector(".tooltip-label");

  rows.forEach((row, i) => {
    const value = row[key];
    const barHeight = (value / niceMax) * plotHeight;
    const slotX = padding.left + i * barSlot;
    const barX = slotX + (barSlot - barWidth) / 2;
    const barY = baselineY - barHeight;
    const r = Math.min(radius, barWidth / 2, barHeight);

    const path = svgEl("path", {
      class: "bar",
      d: `M${barX},${baselineY}
          L${barX},${barY + r}
          Q${barX},${barY} ${barX + r},${barY}
          L${barX + barWidth - r},${barY}
          Q${barX + barWidth},${barY} ${barX + barWidth},${barY + r}
          L${barX + barWidth},${baselineY}
          Z`,
    });
    svg.appendChild(path);

    const label = svgEl("text", {
      class: "bar-value-label",
      x: barX + barWidth / 2,
      y: barY - 8,
      "text-anchor": "middle",
    });
    label.textContent = formatValue(value);
    svg.appendChild(label);

    const xLabel = svgEl("text", {
      class: "axis-label",
      x: slotX + barSlot / 2,
      y: height - 8,
      "text-anchor": "middle",
    });
    xLabel.textContent = row.report_year;
    svg.appendChild(xLabel);

    // Hit target wider than the bar itself (whole slot), per interaction spec.
    const hit = svgEl("rect", {
      class: "bar-hit",
      x: slotX,
      y: padding.top,
      width: barSlot,
      height: plotHeight,
      tabindex: 0,
      role: "img",
      "aria-label": `${row.report_year}: ${formatValue(value)}`,
    });

    const showTooltip = (evt) => {
      path.classList.add("is-active");
      tooltipValue.textContent = formatValue(value);
      tooltipLabel.textContent = row.report_year;
      tooltip.classList.add("is-visible");
      const bounds = container.getBoundingClientRect();
      const svgBounds = svg.getBoundingClientRect();
      const scale = svgBounds.width / width;
      const left = svgBounds.left - bounds.left + (slotX + barSlot / 2) * scale;
      const top = svgBounds.top - bounds.top + barY * scale;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };
    const hideTooltip = () => {
      path.classList.remove("is-active");
      tooltip.classList.remove("is-visible");
    };

    hit.addEventListener("pointerenter", showTooltip);
    hit.addEventListener("pointermove", showTooltip);
    hit.addEventListener("pointerleave", hideTooltip);
    hit.addEventListener("focus", showTooltip);
    hit.addEventListener("blur", hideTooltip);

    svg.appendChild(hit);
  });

  container.querySelectorAll("svg").forEach((old) => old.remove());
  container.insertBefore(svg, container.firstChild);
}

function renderStatTiles(container, focusRows) {
  const latest = focusRows[focusRows.length - 1];
  const prior = focusRows[focusRows.length - 2];
  const reportsDelta = latest.total_reports - prior.total_reports;
  const reportsDeltaPct = ((reportsDelta / prior.total_reports) * 100).toFixed(1);

  const tiles = [
    {
      label: `Total reports, ${latest.report_year}`,
      value: latest.total_reports.toLocaleString(),
      delta: `${reportsDelta >= 0 ? "+" : ""}${reportsDelta.toLocaleString()} (${reportsDeltaPct >= 0 ? "+" : ""}${reportsDeltaPct}%) vs ${prior.report_year}`,
    },
    {
      label: `Reporting facilities, ${latest.report_year}`,
      value: latest.reporting_facilities.toLocaleString(),
      delta: `${latest.reporting_facilities - prior.reporting_facilities >= 0 ? "+" : ""}${latest.reporting_facilities - prior.reporting_facilities} vs ${prior.report_year}`,
    },
    {
      label: "Reports per facility",
      value: (latest.total_reports / latest.reporting_facilities).toFixed(1),
      delta: `${latest.report_year} average`,
    },
  ];

  tiles.forEach((t) => {
    const tile = el("div", { class: "stat-tile" });
    const label = el("p", { class: "stat-label" });
    label.textContent = t.label;
    const value = el("p", { class: "stat-value" });
    value.textContent = t.value;
    const delta = el("p", { class: "stat-delta" });
    delta.textContent = t.delta;
    tile.append(label, value, delta);
    container.appendChild(tile);
  });
}

function renderTable(rows) {
  const tbody = document.querySelector("#data-table tbody");
  rows.forEach((row) => {
    const tr = el("tr", {});
    const cells = [row.report_year, row.total_reports.toLocaleString(), row.reporting_facilities.toLocaleString()];
    cells.forEach((text) => {
      const td = el("td", {});
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// Facility lookup
let facilityData = null;

function performSearch() {
  const searchInput = document.getElementById("facility-search");
  const yearSelect = document.getElementById("year-select");
  const resultsDiv = document.getElementById("search-results");

  const query = searchInput.value.trim();
  const selectedYear = yearSelect.value;

  if (!facilityData) {
    resultsDiv.innerHTML = '<p class="search-hint">Loading facility data...</p>';
    return;
  }

  if (query.length < 2) {
    resultsDiv.innerHTML = '<p class="search-hint">Enter at least 2 characters to search</p>';
    return;
  }

  // Split query into keywords and search for facilities that contain ALL keywords
  const keywords = query.toLowerCase().trim().split(/\s+/);
  const matches = facilityData.facilities.filter(f => {
    const nameLower = f.name.toLowerCase();
    return keywords.every(keyword => nameLower.includes(keyword));
  });

  if (matches.length === 0) {
    resultsDiv.innerHTML = `<p class="search-no-results">No facilities found matching "${query}"</p>`;
    return;
  }

  const displayMatches = matches.slice(0, 50);
  const hasMore = matches.length > 50;

  let html = '<div class="results-list">';

  displayMatches.forEach(facility => {
    const reported = facility.years[selectedYear];
    const statusClass = reported ? "status-reported" : "status-not-reported";
    const statusText = reported ? "Reported WPV incidents" : "Did not report WPV incidents";

    html += `
      <div class="result-item">
        <div class="result-name">${facility.name}</div>
        <div class="result-details">
          <span class="result-id">HCAI ID: ${facility.oshpd_id}</span>
          <span class="result-status ${statusClass}">${statusText}</span>
        </div>
      </div>
    `;
  });

  html += '</div>';

  if (hasMore) {
    html += `<p class="search-hint">Showing first 50 of ${matches.length.toLocaleString()} results. Refine your search to see more.</p>`;
  } else if (matches.length > 1) {
    html += `<p class="search-hint">${matches.length} facilities found</p>`;
  }

  resultsDiv.innerHTML = html;
}

async function main() {
  const res = await fetch("data/wpv_summary.json");
  const payload = await res.json();
  const focusRows = payload.years.filter((r) => payload.focus_years.includes(r.report_year));

  renderStatTiles(document.getElementById("stat-row"), focusRows);

  renderBarChart(document.getElementById("chart-reports"), focusRows, {
    key: "total_reports",
    valueLabel: "Total WPV reports by year",
    formatValue: (v) => v.toLocaleString(),
  });

  renderBarChart(document.getElementById("chart-facilities"), focusRows, {
    key: "reporting_facilities",
    valueLabel: "Reporting facilities by year",
    formatValue: (v) => v.toLocaleString(),
  });

  renderTable(payload.years);

  document.getElementById("generated-at").textContent = new Date(payload.generated_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Load facility lookup
  const lookupRes = await fetch("data/facility_lookup.json");
  facilityData = await lookupRes.json();

  // Setup search event listeners
  const searchButton = document.getElementById("search-button");
  const searchInput = document.getElementById("facility-search");
  const yearSelect = document.getElementById("year-select");

  searchButton.addEventListener("click", performSearch);
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") performSearch();
  });
  yearSelect.addEventListener("change", () => {
    if (searchInput.value.trim().length >= 2) performSearch();
  });
}

main();
