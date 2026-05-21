// Dashboard for crawler traffic and MCP usage.
//
// Two data sources, both Cloudflare Analytics Engine datasets:
//   cg_agent_log — AI/search crawler hits, written by functions/_shared/bot-detect.js
//   cg_mcp_log   — calls to the /mcp server, written by functions/mcp.js
//
// Access to /admin/* is gated by Cloudflare Access at the edge, so this
// function assumes the caller is already authenticated. It queries the
// Analytics Engine SQL API with a token stored as a Pages secret.

const AGENT = 'cg_agent_log';
const MCP = 'cg_mcp_log';

export async function onRequest(context) {
  const { env } = context;

  const accountId = env.CF_ACCOUNT_ID;
  const token = env.CF_ANALYTICS_TOKEN;
  if (!accountId || !token) {
    return text('Missing CF_ACCOUNT_ID or CF_ANALYTICS_TOKEN env vars.', 500);
  }

  const queries = {
    // --- Crawlers ---------------------------------------------------------
    agent_hourly: `
      SELECT toStartOfHour(timestamp) AS hour, index1 AS bot, SUM(_sample_interval) AS count
      FROM ${AGENT}
      WHERE timestamp > NOW() - INTERVAL '1' DAY
      GROUP BY hour, bot
      ORDER BY hour ASC
    `,
    agent_top24h: `
      SELECT index1 AS bot, SUM(_sample_interval) AS count
      FROM ${AGENT}
      WHERE timestamp > NOW() - INTERVAL '1' DAY
      GROUP BY bot ORDER BY count DESC LIMIT 50
    `,
    agent_top7d: `
      SELECT index1 AS bot, SUM(_sample_interval) AS count
      FROM ${AGENT}
      WHERE timestamp > NOW() - INTERVAL '7' DAY
      GROUP BY bot ORDER BY count DESC LIMIT 50
    `,
    agent_top30d: `
      SELECT index1 AS bot, SUM(_sample_interval) AS count
      FROM ${AGENT}
      WHERE timestamp > NOW() - INTERVAL '30' DAY
      GROUP BY bot ORDER BY count DESC LIMIT 50
    `,
    agent_sources: `
      SELECT blob9 AS source, SUM(_sample_interval) AS count
      FROM ${AGENT}
      WHERE timestamp > NOW() - INTERVAL '7' DAY
      GROUP BY source ORDER BY count DESC
    `,
    agent_topPaths: `
      SELECT index1 AS bot, blob4 AS path, SUM(_sample_interval) AS count
      FROM ${AGENT}
      WHERE timestamp > NOW() - INTERVAL '7' DAY
      GROUP BY bot, path ORDER BY count DESC LIMIT 200
    `,
    // --- MCP --------------------------------------------------------------
    mcp_hourly: `
      SELECT toStartOfHour(timestamp) AS hour, SUM(_sample_interval) AS count
      FROM ${MCP}
      WHERE timestamp > NOW() - INTERVAL '1' DAY
      GROUP BY hour ORDER BY hour ASC
    `,
    mcp_tools24h: `
      SELECT blob2 AS tool, SUM(_sample_interval) AS count
      FROM ${MCP}
      WHERE blob1 = 'tools/call' AND timestamp > NOW() - INTERVAL '1' DAY
      GROUP BY tool ORDER BY count DESC LIMIT 50
    `,
    mcp_tools7d: `
      SELECT blob2 AS tool, SUM(_sample_interval) AS count
      FROM ${MCP}
      WHERE blob1 = 'tools/call' AND timestamp > NOW() - INTERVAL '7' DAY
      GROUP BY tool ORDER BY count DESC LIMIT 50
    `,
    mcp_methods: `
      SELECT blob1 AS method, SUM(_sample_interval) AS count
      FROM ${MCP}
      WHERE timestamp > NOW() - INTERVAL '7' DAY
      GROUP BY method ORDER BY count DESC
    `,
    mcp_clients: `
      SELECT blob4 AS client, blob5 AS version, SUM(_sample_interval) AS count
      FROM ${MCP}
      WHERE blob1 = 'initialize' AND timestamp > NOW() - INTERVAL '30' DAY
      GROUP BY client, version ORDER BY count DESC LIMIT 50
    `,
    mcp_protocols: `
      SELECT blob6 AS protocol, SUM(_sample_interval) AS count
      FROM ${MCP}
      WHERE timestamp > NOW() - INTERVAL '30' DAY
      GROUP BY protocol ORDER BY count DESC
    `,
    mcp_surfaces: `
      SELECT blob10 AS surface, SUM(_sample_interval) AS count
      FROM ${MCP}
      WHERE timestamp > NOW() - INTERVAL '7' DAY
      GROUP BY surface ORDER BY count DESC
    `,
    mcp_errors: `
      SELECT SUM(_sample_interval) AS count
      FROM ${MCP}
      WHERE blob1 = 'tools/call' AND blob9 = '1' AND blob10 != 'webmcp'
        AND timestamp > NOW() - INTERVAL '7' DAY
    `,
    mcp_recent: `
      SELECT timestamp AS time, blob10 AS surface, blob2 AS tool, blob3 AS args, blob9 AS error
      FROM ${MCP}
      WHERE blob1 = 'tools/call' AND timestamp > NOW() - INTERVAL '30' DAY
      ORDER BY time DESC LIMIT 100
    `,
  };

  const results = {};
  const errors = {};
  await Promise.all(
    Object.entries(queries).map(async ([key, sql]) => {
      try {
        results[key] = await queryAE(accountId, token, sql);
      } catch (err) {
        errors[key] = err.message;
      }
    })
  );

  return new Response(renderDashboard(results, errors), {
    headers: { 'Content-Type': 'text/html;charset=utf-8' },
  });
}

async function queryAE(accountId, token, sql) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body: sql,
    }
  );
  if (!res.ok) {
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

function text(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
}

// --- Formatting helpers ---------------------------------------------------

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNum(n) {
  return new Intl.NumberFormat('en-US').format(Number(n) || 0);
}

function rowsOrEmpty(result) {
  return result && result.data ? result.data : [];
}

function firstCount(result) {
  const rows = rowsOrEmpty(result);
  return rows.length === 0 ? 0 : Number(rows[0].count) || 0;
}

function sumCounts(result) {
  return rowsOrEmpty(result).reduce((s, r) => s + (Number(r.count) || 0), 0);
}

// Renders a table. `numeric` lists headers whose cells are right-aligned
// numbers; `formatters` maps a header to a cell renderer.
function renderTable(headers, rows, { numeric = [], formatters = {} } = {}) {
  if (rows.length === 0) return `<p class="empty">No data yet.</p>`;
  const head = headers
    .map((h) => `<th${numeric.includes(h) ? ' class="num"' : ''}>${esc(h)}</th>`)
    .join('');
  const body = rows
    .map((row) => {
      const cells = headers
        .map((h) => {
          const key = h.toLowerCase().replace(/\s+/g, '_');
          const val = row[h] ?? row[key] ?? row[h.toLowerCase()];
          const fmt = formatters[h] || ((v) => esc(v));
          return `<td${numeric.includes(h) ? ' class="num"' : ''}>${fmt(val)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const countCol = { numeric: ['count'], formatters: { count: (v) => fmtNum(v) } };

// Stable-ish palette for the stacked hourly chart. First N keys by volume get
// a color; the rest fold into 'other' (gray).
const PALETTE = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#a855f7',
];
const OTHER_COLOR = '#64748b';

// Stacked horizontal bars: one bar per hour, segmented by key (bot).
function renderHourlyStacked(rows) {
  if (rows.length === 0) return `<p class="empty">No data yet.</p>`;

  const byHour = new Map();
  const totals = new Map();
  for (const r of rows) {
    const hour = String(r.hour);
    const key = String(r.bot || 'unknown');
    const count = Number(r.count) || 0;
    if (!byHour.has(hour)) byHour.set(hour, []);
    byHour.get(hour).push({ key, count });
    totals.set(key, (totals.get(key) || 0) + count);
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const topKeys = sorted.slice(0, PALETTE.length).map(([name]) => name);
  const topIndex = new Map(topKeys.map((name, i) => [name, i]));
  const colorFor = (k) => (topIndex.has(k) ? PALETTE[topIndex.get(k)] : OTHER_COLOR);

  const hours = [...byHour.entries()]
    .map(([hour, entries]) => ({
      hour,
      total: entries.reduce((s, e) => s + e.count, 0),
      entries,
    }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
  const max = Math.max(...hours.map((h) => h.total), 0);

  const bars = hours
    .map(({ hour, total, entries }) => {
      const widthPct = max > 0 ? (total / max) * 100 : 0;
      const segs = entries
        .slice()
        .sort((a, b) => {
          const ai = topIndex.has(a.key) ? topIndex.get(a.key) : Infinity;
          const bi = topIndex.has(b.key) ? topIndex.get(b.key) : Infinity;
          return ai !== bi ? ai - bi : b.count - a.count;
        })
        .map(({ key, count }) => {
          const segPct = total > 0 ? (count / total) * 100 : 0;
          return `<span class="bar-seg" style="width:${segPct.toFixed(2)}%;background:${colorFor(key)}" title="${esc(key)}: ${fmtNum(count)}"></span>`;
        })
        .join('');
      // ClickHouse returns "YYYY-MM-DD HH:MM:SS" (no T, no Z) — normalize to UTC.
      const label = new Date(hour.replace(' ', 'T') + 'Z').toISOString().slice(11, 16) + ' UTC';
      return `<div class="bar-row"><span class="bar-label">${esc(label)}</span><span class="bar"><span class="bar-stack" style="width:${widthPct.toFixed(2)}%">${segs}</span></span><span class="bar-count">${fmtNum(total)}</span></div>`;
    })
    .join('');

  const legendEntries = topKeys.map((name) => ({
    name,
    total: totals.get(name),
    color: colorFor(name),
  }));
  const otherKeys = sorted.slice(PALETTE.length);
  if (otherKeys.length > 0) {
    legendEntries.push({
      name: `other (${otherKeys.length})`,
      total: otherKeys.reduce((s, [, t]) => s + t, 0),
      color: OTHER_COLOR,
    });
  }
  const legend = legendEntries
    .map(
      (e) =>
        `<span class="legend-item"><span class="legend-swatch" style="background:${e.color}"></span>${esc(e.name)} <span class="legend-count">${fmtNum(e.total)}</span></span>`
    )
    .join('');

  return `<div class="bars">${bars}</div><div class="legend">${legend}</div>`;
}

// Single-line chart: total per hour across 24 contiguous UTC hours.
function renderHourLineChart(rows, color, ariaLabel) {
  if (rows.length === 0) return `<p class="empty">No data yet.</p>`;

  const totals = new Map();
  for (const r of rows) {
    const k = String(r.hour);
    totals.set(k, (totals.get(k) || 0) + (Number(r.count) || 0));
  }

  const lastHour = new Date();
  lastHour.setUTCMinutes(0, 0, 0);
  const grid = [];
  for (let i = 23; i >= 0; i--) {
    const t = new Date(lastHour);
    t.setUTCHours(t.getUTCHours() - i);
    const key = t.toISOString().slice(0, 19).replace('T', ' ');
    grid.push({ time: t, value: totals.get(key) || 0 });
  }

  const max = Math.max(...grid.map((p) => p.value), 1);
  const W = 600, H = 200, padL = 40, padR = 8, padT = 12, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xFor = (i) => padL + (plotW * i) / Math.max(1, grid.length - 1);
  const yFor = (v) => padT + plotH - (plotH * v) / max;

  const linePts = grid.map((p, i) => `${xFor(i).toFixed(1)},${yFor(p.value).toFixed(1)}`).join(' ');

  const yTicks = max <= 4 ? [0, max] : [0, Math.round(max / 2), max];
  const gridLines = yTicks
    .map(
      (v) =>
        `<line x1="${padL}" x2="${W - padR}" y1="${yFor(v).toFixed(1)}" y2="${yFor(v).toFixed(1)}" stroke="#1c2025" />` +
        `<text x="${padL - 6}" y="${(yFor(v) + 3).toFixed(1)}" text-anchor="end" fill="#9bb" font-size="10" font-family="ui-monospace,monospace">${fmtNum(v)}</text>`
    )
    .join('');

  const xLabels = grid
    .map((p, i) => ({ i, t: p.time }))
    .filter(({ i }) => i % 4 === 0 || i === grid.length - 1)
    .map(
      ({ i, t }) =>
        `<text x="${xFor(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#9bb" font-size="10" font-family="ui-monospace,monospace">${t.toISOString().slice(11, 13)}</text>`
    )
    .join('');

  const dots = grid
    .map(
      (p, i) =>
        `<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(p.value).toFixed(1)}" r="2.5" fill="${color}"><title>${esc(p.time.toISOString().slice(0, 16))} UTC: ${fmtNum(p.value)}</title></circle>`
    )
    .join('');

  return `<svg class="line-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(ariaLabel)}">${gridLines}<polyline points="${linePts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" />${dots}${xLabels}</svg>`;
}

function statCard(label, value) {
  return `<div class="stat"><span class="stat-num">${fmtNum(value)}</span><span class="stat-label">${esc(label)}</span></div>`;
}

// --- Page render ----------------------------------------------------------

function renderDashboard(results, errors) {
  const errorBlock =
    Object.keys(errors).length === 0
      ? ''
      : `<div class="errors"><h3>Query errors</h3><p class="errors-note">A "table not found" error is expected until the matching dataset has received its first write.</p><pre>${esc(JSON.stringify(errors, null, 2))}</pre></div>`;

  const crawlerBots = new Set(
    rowsOrEmpty(results.agent_topPaths).map((r) => String(r.bot || '')).filter(Boolean)
  );
  const mcpTools = new Set(
    rowsOrEmpty(results.mcp_recent).map((r) => String(r.tool || '')).filter(Boolean)
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Stats — admin</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background:#0b0d10; color:#e6e6e6; margin:0; padding:2rem; max-width:1100px; margin-inline:auto; }
    h1 { font-size:1.4rem; margin:0 0 .25rem; }
    h2 { font-size:1.05rem; margin:2rem 0 .75rem; color:#9bb; border-bottom:1px solid #233; padding-bottom:.25rem; }
    .sub { color:#777; margin-bottom:1.5rem; font-size:.85rem; }
    table { width:100%; border-collapse:collapse; font-size:.85rem; }
    th, td { text-align:left; padding:.4rem .6rem; border-bottom:1px solid #1c2025; }
    th { color:#9bb; font-weight:normal; text-transform:uppercase; font-size:.7rem; letter-spacing:.05em; }
    td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
    .cols { display:grid; grid-template-columns:1fr 1fr; gap:2rem; }
    @media (max-width:800px) { .cols { grid-template-columns:1fr; } }
    .empty { color:#666; font-style:italic; font-size:.85rem; }
    .bars { display:flex; flex-direction:column; gap:.15rem; }
    .bar-row { display:grid; grid-template-columns:6em 1fr 5em; gap:.5rem; align-items:center; font-size:.75rem; }
    .bar-label { color:#9bb; }
    .bar { background:#1c2025; height:1rem; border-radius:2px; overflow:hidden; }
    .bar-stack { display:flex; height:100%; }
    .bar-seg { display:block; height:100%; }
    .bar-count { text-align:right; color:#bbb; font-variant-numeric:tabular-nums; }
    .legend { display:flex; flex-wrap:wrap; gap:.5rem 1rem; margin-top:.75rem; font-size:.75rem; }
    .legend-item { display:inline-flex; align-items:center; gap:.4rem; color:#bbd; }
    .legend-swatch { display:inline-block; width:.7rem; height:.7rem; border-radius:2px; }
    .legend-count { color:#888; font-variant-numeric:tabular-nums; }
    .filter-row { display:flex; gap:.5rem; align-items:center; margin:0 0 .75rem; flex-wrap:wrap; }
    .filter-row input, .filter-row select { padding:.35rem .6rem; border:1px solid #1c2025; border-radius:3px; background:#0b0d10; color:#e6e6e6; font:inherit; font-size:.8rem; min-width:12rem; }
    .filter-row input:focus, .filter-row select:focus { outline:none; border-color:#3b82f6; }
    .filter-stats { color:#888; font-size:.75rem; }
    .errors { background:#2a1010; border:1px solid #5a2020; padding:1rem; border-radius:4px; margin:1.5rem 0; }
    .errors h3 { margin:0 0 .25rem; font-size:.9rem; }
    .errors-note { color:#caa; font-size:.75rem; margin:0 0 .5rem; }
    .errors pre { white-space:pre-wrap; word-break:break-word; font-size:.72rem; color:#fbb; margin:0; }
    .path, .args { color:#bbd; word-break:break-all; }
    .line-chart { width:100%; height:auto; max-height:220px; display:block; }
    .panel-head { display:flex; align-items:baseline; justify-content:space-between; gap:1rem; border-bottom:1px solid #233; padding-bottom:.25rem; margin:2rem 0 .75rem; }
    .panel-head h2.panel-title { border:none; margin:0; padding:0; font-size:1.05rem; color:#9bb; text-transform:none; letter-spacing:0; }
    .tabs { display:inline-flex; gap:.25rem; }
    .tab { background:transparent; color:#9bb; border:1px solid #1c2025; padding:.2rem .55rem; border-radius:3px; font:inherit; font-size:.7rem; cursor:pointer; }
    .tab:hover { background:#1c2025; }
    .tab.active { background:#3b82f6; color:#fff; border-color:#3b82f6; }
    .section-nav { display:flex; gap:.4rem; margin:0 0 1rem; }
    .section-nav .tab { font-size:.85rem; padding:.4rem 1rem; }
    .stats-row { display:flex; flex-wrap:wrap; gap:1rem; margin:0 0 .5rem; }
    .stat { background:#11141a; border:1px solid #1c2025; border-radius:4px; padding:.6rem 1rem; min-width:7rem; }
    .stat-num { display:block; font-size:1.3rem; font-variant-numeric:tabular-nums; }
    .stat-label { display:block; color:#9bb; font-size:.68rem; text-transform:uppercase; letter-spacing:.05em; margin-top:.15rem; }
    .err-flag { color:#f87171; }
  </style>
</head>
<body>
  <h1>Stats</h1>
  <p class="sub">All times UTC. Counts are Analytics Engine sample-adjusted totals.</p>

  ${errorBlock}

  <div class="section-nav tabs" data-tabs="sections">
    <button type="button" class="tab active" data-tab="section-crawlers">Crawlers</button>
    <button type="button" class="tab" data-tab="section-mcp">MCP usage</button>
  </div>

  <div id="section-crawlers" class="tab-pane">
    <div class="stats-row">
      ${statCard('Crawls 24h', sumCounts(results.agent_top24h))}
      ${statCard('Crawls 7d', sumCounts(results.agent_top7d))}
      ${statCard('Distinct bots 7d', rowsOrEmpty(results.agent_top7d).length)}
    </div>

    <div class="cols">
      <div>
        <h2>Crawls per hour — last 24h</h2>
        ${renderHourLineChart(rowsOrEmpty(results.agent_hourly), '#3b82f6', 'Crawls per hour, last 24h')}
      </div>
      <div>
        <div class="panel-head">
          <h2 class="panel-title">Top bots</h2>
          <div class="tabs" data-tabs="agent-top">
            <button type="button" class="tab active" data-tab="bots-24h">24h</button>
            <button type="button" class="tab" data-tab="bots-7d">7d</button>
            <button type="button" class="tab" data-tab="bots-30d">30d</button>
          </div>
        </div>
        <div id="bots-24h" class="tab-pane">${renderTable(['bot', 'count'], rowsOrEmpty(results.agent_top24h), countCol)}</div>
        <div id="bots-7d" class="tab-pane" hidden>${renderTable(['bot', 'count'], rowsOrEmpty(results.agent_top7d), countCol)}</div>
        <div id="bots-30d" class="tab-pane" hidden>${renderTable(['bot', 'count'], rowsOrEmpty(results.agent_top30d), countCol)}</div>
      </div>
    </div>

    <h2>Detection source — last 7d</h2>
    ${renderTable(['source', 'count'], rowsOrEmpty(results.agent_sources), countCol)}

    <h2>Requests per hour — last 24h</h2>
    ${renderHourlyStacked(rowsOrEmpty(results.agent_hourly))}

    <h2>Top paths per bot — last 7d</h2>
    <div class="filter-row" data-filter-for="agent-paths-table">
      <select data-col="0">
        <option value="">All bots</option>
        ${[...crawlerBots].sort((a, b) => a.localeCompare(b)).map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}
      </select>
      <input type="search" data-col="1" placeholder="Filter path…" autocomplete="off" spellcheck="false">
      <span class="filter-stats" data-filter-stats></span>
    </div>
    <div id="agent-paths-table">
      ${renderTable(['bot', 'path', 'count'], rowsOrEmpty(results.agent_topPaths), {
        numeric: ['count'],
        formatters: {
          path: (v) => `<span class="path">${esc(v)}</span>`,
          count: (v) => fmtNum(v),
        },
      })}
    </div>
  </div>

  <div id="section-mcp" class="tab-pane" hidden>
    <div class="stats-row">
      ${statCard('Calls 24h', sumCounts(results.mcp_hourly))}
      ${statCard('Tool calls 7d', sumCounts(results.mcp_tools7d))}
      ${statCard('Errors 7d (remote)', firstCount(results.mcp_errors))}
    </div>

    <div class="cols">
      <div>
        <h2>MCP calls per hour — last 24h</h2>
        ${renderHourLineChart(rowsOrEmpty(results.mcp_hourly), '#10b981', 'MCP calls per hour, last 24h')}
      </div>
      <div>
        <div class="panel-head">
          <h2 class="panel-title">Top tools</h2>
          <div class="tabs" data-tabs="mcp-top">
            <button type="button" class="tab active" data-tab="tools-24h">24h</button>
            <button type="button" class="tab" data-tab="tools-7d">7d</button>
          </div>
        </div>
        <div id="tools-24h" class="tab-pane">${renderTable(['tool', 'count'], rowsOrEmpty(results.mcp_tools24h), countCol)}</div>
        <div id="tools-7d" class="tab-pane" hidden>${renderTable(['tool', 'count'], rowsOrEmpty(results.mcp_tools7d), countCol)}</div>
      </div>
    </div>

    <div class="cols">
      <div>
        <h2>Methods — last 7d</h2>
        ${renderTable(['method', 'count'], rowsOrEmpty(results.mcp_methods), countCol)}
      </div>
      <div>
        <h2>Surfaces — last 7d</h2>
        ${renderTable(['surface', 'count'], rowsOrEmpty(results.mcp_surfaces).map((r) => ({ surface: r.surface || 'remote', count: r.count })), countCol)}
      </div>
    </div>

    <div class="cols">
      <div>
        <h2>Protocol versions — last 30d</h2>
        ${renderTable(['protocol', 'count'], rowsOrEmpty(results.mcp_protocols).map((r) => ({ protocol: r.protocol || '(none)', count: r.count })), countCol)}
      </div>
      <div>
        <h2>MCP clients — last 30d</h2>
        ${renderTable(['client', 'version', 'count'], rowsOrEmpty(results.mcp_clients).map((r) => ({ client: r.client || '(unknown)', version: r.version || '', count: r.count })), countCol)}
      </div>
    </div>

    <h2>Recent tool calls — last 30d</h2>
    <div class="filter-row" data-filter-for="mcp-recent-table">
      <select data-col="1">
        <option value="">All surfaces</option>
        <option value="remote">remote</option>
        <option value="webmcp">webmcp</option>
      </select>
      <select data-col="2">
        <option value="">All tools</option>
        ${[...mcpTools].sort((a, b) => a.localeCompare(b)).map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
      </select>
      <input type="search" data-col="3" placeholder="Filter arguments…" autocomplete="off" spellcheck="false">
      <span class="filter-stats" data-filter-stats></span>
    </div>
    <div id="mcp-recent-table">
      ${renderTable(['time', 'surface', 'tool', 'args', 'error'], rowsOrEmpty(results.mcp_recent), {
        formatters: {
          time: (v) => esc(String(v).slice(5, 16)),
          surface: (v) => esc(v || 'remote'),
          args: (v) => `<span class="args">${esc(v)}</span>`,
          error: (v) => (v === '1' ? '<span class="err-flag" title="returned an error">error</span>' : ''),
        },
      })}
    </div>
  </div>

  <script>
    // Tab groups: clicking a .tab toggles .active and shows its data-tab pane.
    document.querySelectorAll('.tabs').forEach((group) => {
      const buttons = group.querySelectorAll('.tab');
      buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
          buttons.forEach((b) => {
            b.classList.toggle('active', b === btn);
            const pane = document.getElementById(b.dataset.tab);
            if (pane) pane.hidden = b !== btn;
          });
        });
      });
    });

    // Generic table filters: a .filter-row[data-filter-for] drives the table
    // with that id. <select data-col> = exact match, <input data-col> = substring.
    document.querySelectorAll('[data-filter-for]').forEach((wrap) => {
      const table = document.getElementById(wrap.dataset.filterFor);
      if (!table) return;
      const controls = Array.from(wrap.querySelectorAll('[data-col]'));
      const stats = wrap.querySelector('[data-filter-stats]');
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      const total = rows.length;
      function apply() {
        let visible = 0;
        for (const r of rows) {
          const cells = r.querySelectorAll('td');
          const show = controls.every((c) => {
            const v = c.value.trim();
            if (!v) return true;
            const cellText = (cells[Number(c.dataset.col)]?.textContent || '').trim();
            return c.tagName === 'SELECT'
              ? cellText === v
              : cellText.toLowerCase().includes(v.toLowerCase());
          });
          r.style.display = show ? '' : 'none';
          if (show) visible++;
        }
        if (stats) stats.textContent = visible === total ? total + ' rows' : visible + ' of ' + total + ' rows';
      }
      controls.forEach((c) => {
        c.addEventListener('input', apply);
        c.addEventListener('change', apply);
      });
      apply();
    });
  </script>
</body>
</html>`;
}
