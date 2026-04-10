import * as vscode from 'vscode';
import { UsageSummary, formatCost, formatTokenCount } from './aggregator';
import { QuotaData } from './quota';

let currentPanel: vscode.WebviewPanel | undefined;

export function showDashboard(context: vscode.ExtensionContext, summary: UsageSummary, quota: QuotaData | null): void {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    currentPanel.webview.html = getHtml(summary, quota);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'clusage.dashboard',
    'Claude Usage',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  currentPanel.webview.html = getHtml(summary, quota);

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  }, null, context.subscriptions);
}

export function refreshDashboard(summary: UsageSummary, quota: QuotaData | null): void {
  if (currentPanel?.visible) {
    currentPanel.webview.html = getHtml(summary, quota);
  }
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return date.toLocaleDateString();
}

function modelShortName(model: string): string {
  return model
    .replace('claude-', '')
    .replace('-20', ' 20')
    .replace(/-(\d)/, ' $1');
}

function pct(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

function getHtml(summary: UsageSummary, quota: QuotaData | null): string {
  const { tokenBreakdown, byProject, byModel, recentSessions } = summary;
  const totalBreakdownTokens =
    tokenBreakdown.input + tokenBreakdown.output + tokenBreakdown.cacheRead + tokenBreakdown.cacheWrite;

  const projectRows = byProject.slice(0, 10).map((p, i) => {
    const barWidth = byProject[0].costUSD > 0 ? pct(p.costUSD, byProject[0].costUSD) : 0;
    return `
      <tr class="project-row" style="animation-delay:${i * 30}ms">
        <td class="project-name">
          <span class="project-icon">⬡</span>
          <span>${escHtml(p.displayName)}</span>
        </td>
        <td class="center muted">${p.sessionCount}</td>
        <td class="right">${formatTokenCount(p.totalTokens)}</td>
        <td class="right cost">${formatCost(p.costUSD)}</td>
        <td class="bar-cell">
          <div class="bar-bg"><div class="bar-fill" style="width:${barWidth}%"></div></div>
        </td>
      </tr>`;
  }).join('');

  const modelCards = byModel.map((m, i) => {
    const share = pct(m.costUSD, summary.allTimeCost);
    return `
      <div class="model-card" style="animation-delay:${i * 40}ms">
        <div class="model-name">${escHtml(modelShortName(m.model))}</div>
        <div class="model-stat">${formatCost(m.costUSD)}</div>
        <div class="model-sub">${formatTokenCount(m.totalTokens)} tok · ${m.requestCount.toLocaleString()} req</div>
        <div class="model-bar-bg"><div class="model-bar-fill" style="width:${share}%"></div></div>
      </div>`;
  }).join('');

  const sessionRows = recentSessions.map((s, i) => `
    <div class="session-item" style="animation-delay:${i * 20}ms">
      <div class="session-left">
        <span class="session-project">${escHtml(s.displayName)}</span>
        <span class="session-model tag">${escHtml(modelShortName(s.model))}</span>
      </div>
      <div class="session-right">
        <span class="session-cost">${formatCost(s.costUSD)}</span>
        <span class="session-tokens muted">${formatTokenCount(s.totalTokens)} tok</span>
        <span class="session-time muted">${relativeTime(s.timestamp)}</span>
      </div>
    </div>`).join('');

  const inputPct = pct(tokenBreakdown.input, totalBreakdownTokens);
  const outputPct = pct(tokenBreakdown.output, totalBreakdownTokens);
  const cacheReadPct = pct(tokenBreakdown.cacheRead, totalBreakdownTokens);
  const cacheWritePct = pct(tokenBreakdown.cacheWrite, totalBreakdownTokens);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Usage</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:         #0f0f11;
    --surface:    #18181c;
    --surface2:   #1e1e24;
    --border:     #2a2a35;
    --accent:     #7c6af7;
    --accent2:    #5eead4;
    --green:      #4ade80;
    --amber:      #fbbf24;
    --rose:       #f87171;
    --blue:       #60a5fa;
    --text:       #e2e2ec;
    --muted:      #71717a;
    --radius:     10px;
    --radius-sm:  6px;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    padding: 24px;
    min-height: 100vh;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 28px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--border);
  }
  .header-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .header-icon {
    width: 32px; height: 32px;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
  }
  .header h1 { font-size: 16px; font-weight: 600; color: var(--text); }
  .header-sub { font-size: 11px; color: var(--muted); margin-top: 1px; }
  .last-updated { font-size: 11px; color: var(--muted); }

  /* ── Hero stats ── */
  .hero-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 24px;
  }
  .hero-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 18px;
    animation: fadeUp 0.3s ease both;
  }
  .hero-label {
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
  }
  .hero-value {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .hero-card:nth-child(1) .hero-value { color: var(--accent); }
  .hero-card:nth-child(2) .hero-value { color: var(--green); }
  .hero-card:nth-child(3) .hero-value { color: var(--accent2); }
  .hero-card:nth-child(4) .hero-value { color: var(--blue); }
  .hero-sub {
    font-size: 11px;
    color: var(--muted);
    margin-top: 4px;
  }

  /* ── Token breakdown ── */
  .section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    margin-bottom: 12px;
  }
  .section { margin-bottom: 28px; }

  .token-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  .token-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    animation: fadeUp 0.3s ease both;
  }
  .token-label {
    font-size: 11px;
    color: var(--muted);
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .token-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .token-value {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
  }
  .token-pct {
    font-size: 11px;
    color: var(--muted);
    margin-top: 2px;
  }
  .token-bar {
    height: 3px;
    background: var(--border);
    border-radius: 2px;
    margin-top: 10px;
    overflow: hidden;
  }
  .token-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  /* ── Projects table ── */
  .table-wrap {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  thead tr {
    background: var(--surface2);
    border-bottom: 1px solid var(--border);
  }
  th {
    padding: 9px 14px;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    text-align: left;
  }
  th.right, td.right { text-align: right; }
  th.center, td.center { text-align: center; }
  .project-row {
    border-bottom: 1px solid var(--border);
    animation: fadeUp 0.3s ease both;
    transition: background 0.15s;
  }
  .project-row:last-child { border-bottom: none; }
  .project-row:hover { background: var(--surface2); }
  td {
    padding: 10px 14px;
    font-size: 12px;
  }
  .project-name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    max-width: 260px;
  }
  .project-name > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-icon { color: var(--accent); font-size: 10px; }
  .cost { color: var(--green); font-weight: 600; font-variant-numeric: tabular-nums; }
  .muted { color: var(--muted); }
  .bar-cell { width: 100px; padding-right: 14px; }
  .bar-bg {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  /* ── Model cards ── */
  .model-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }
  .model-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    animation: fadeUp 0.3s ease both;
  }
  .model-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 4px;
    text-transform: capitalize;
  }
  .model-stat {
    font-size: 20px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: -0.01em;
  }
  .model-sub {
    font-size: 11px;
    color: var(--muted);
    margin-top: 3px;
    margin-bottom: 10px;
  }
  .model-bar-bg {
    height: 3px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
  }
  .model-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  /* ── Sessions ── */
  .sessions-list {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .session-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    animation: fadeUp 0.3s ease both;
    transition: background 0.15s;
    gap: 12px;
  }
  .session-item:last-child { border-bottom: none; }
  .session-item:hover { background: var(--surface2); }
  .session-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .session-project {
    font-weight: 500;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
  }
  .tag {
    background: var(--surface2);
    border: 1px solid var(--border);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
  }
  .session-right {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    font-size: 12px;
  }
  .session-cost { color: var(--green); font-weight: 600; font-variant-numeric: tabular-nums; }
  .session-tokens, .session-time { font-variant-numeric: tabular-nums; }

  /* ── Empty state ── */
  .empty {
    text-align: center;
    padding: 48px 24px;
    color: var(--muted);
  }
  .empty-icon { font-size: 40px; margin-bottom: 12px; }
  .empty-title { font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 6px; }

  /* ── Quota ── */
  .quota-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .quota-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 18px;
    animation: fadeUp 0.3s ease both;
  }
  .quota-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 10px;
  }
  .quota-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .quota-cost {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--text);
  }
  .quota-tokens {
    font-size: 11px;
    color: var(--muted);
    margin-bottom: 10px;
  }
  .quota-track {
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 6px;
  }
  .quota-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.6s ease;
    min-width: 2px;
  }
  .quota-fill.ok     { background: linear-gradient(90deg, var(--accent), var(--accent2)); }
  .quota-fill.warn   { background: linear-gradient(90deg, var(--amber), #f59e0b); }
  .quota-fill.danger { background: linear-gradient(90deg, var(--rose), #ef4444); }
  .quota-budget-row {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--muted);
  }
  .quota-pct {
    font-weight: 600;
  }
  .quota-pct.ok     { color: var(--accent2); }
  .quota-pct.warn   { color: var(--amber); }
  .quota-pct.danger { color: var(--rose); }
  .quota-no-budget {
    font-size: 11px;
    color: var(--muted);
    font-style: italic;
    margin-top: 8px;
  }

  /* ── Animations ── */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-title">
    <div class="header-icon">📊</div>
    <div>
      <h1>Claude Usage</h1>
      <div class="header-sub">~/.claude/projects</div>
    </div>
  </div>
  <div class="last-updated">Updated ${new Date(summary.lastUpdated).toLocaleTimeString()}</div>
</div>

<!-- Hero stats -->
<div class="hero-grid">
  <div class="hero-card" style="animation-delay:0ms">
    <div class="hero-label">All Time</div>
    <div class="hero-value">${formatCost(summary.allTimeCost)}</div>
    <div class="hero-sub">${formatTokenCount(summary.allTimeTokens)} tokens total</div>
  </div>
  <div class="hero-card" style="animation-delay:60ms">
    <div class="hero-label">Today</div>
    <div class="hero-value">${formatCost(summary.todayCost)}</div>
    <div class="hero-sub">${formatTokenCount(summary.todayTokens)} tokens</div>
  </div>
  <div class="hero-card" style="animation-delay:120ms">
    <div class="hero-label">This Week</div>
    <div class="hero-value">${formatCost(summary.weekCost)}</div>
    <div class="hero-sub">7-day window</div>
  </div>
  <div class="hero-card" style="animation-delay:180ms">
    <div class="hero-label">This Month</div>
    <div class="hero-value">${formatCost(summary.monthCost)}</div>
    <div class="hero-sub">Calendar month</div>
  </div>
</div>

<!-- Quota / rolling windows -->
<div class="section">
  <div class="section-title">Usage Windows &amp; Quota</div>
  <div class="quota-grid">
    ${liveQuotaCard('Current session (5h)', quota?.fiveHourUtilization ?? null, quota?.fiveHourResetAt ?? null,
        summary.lastFiveHours.cost, summary.lastFiveHours.tokens, 0)}
    ${liveQuotaCard('Weekly', quota?.sevenDayUtilization ?? null, quota?.sevenDayResetAt ?? null,
        summary.lastWeek.cost, summary.lastWeek.tokens, 60)}
    ${spendCard('Last hour', summary.lastHour.cost, summary.lastHour.tokens, 120)}
  </div>
</div>

<!-- Token breakdown -->
<div class="section">
  <div class="section-title">Token Breakdown — All Time</div>
  <div class="token-grid">
    <div class="token-card" style="animation-delay:60ms">
      <div class="token-label">
        <span class="token-dot" style="background:#7c6af7"></span>Input
      </div>
      <div class="token-value">${formatTokenCount(tokenBreakdown.input)}</div>
      <div class="token-pct">${inputPct}% of total</div>
      <div class="token-bar"><div class="token-bar-fill" style="width:${inputPct}%;background:#7c6af7"></div></div>
    </div>
    <div class="token-card" style="animation-delay:90ms">
      <div class="token-label">
        <span class="token-dot" style="background:#4ade80"></span>Output
      </div>
      <div class="token-value">${formatTokenCount(tokenBreakdown.output)}</div>
      <div class="token-pct">${outputPct}% of total</div>
      <div class="token-bar"><div class="token-bar-fill" style="width:${outputPct}%;background:#4ade80"></div></div>
    </div>
    <div class="token-card" style="animation-delay:120ms">
      <div class="token-label">
        <span class="token-dot" style="background:#5eead4"></span>Cache Read
      </div>
      <div class="token-value">${formatTokenCount(tokenBreakdown.cacheRead)}</div>
      <div class="token-pct">${cacheReadPct}% of total</div>
      <div class="token-bar"><div class="token-bar-fill" style="width:${cacheReadPct}%;background:#5eead4"></div></div>
    </div>
    <div class="token-card" style="animation-delay:150ms">
      <div class="token-label">
        <span class="token-dot" style="background:#fbbf24"></span>Cache Write
      </div>
      <div class="token-value">${formatTokenCount(tokenBreakdown.cacheWrite)}</div>
      <div class="token-pct">${cacheWritePct}% of total</div>
      <div class="token-bar"><div class="token-bar-fill" style="width:${cacheWritePct}%;background:#fbbf24"></div></div>
    </div>
  </div>
</div>

<!-- Projects -->
<div class="section">
  <div class="section-title">Projects</div>
  ${byProject.length === 0 ? `<div class="empty"><div class="empty-icon">📂</div><div class="empty-title">No projects found</div></div>` : `
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Project</th>
          <th class="center">Sessions</th>
          <th class="right">Tokens</th>
          <th class="right">Cost</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${projectRows}</tbody>
    </table>
  </div>`}
</div>

<!-- Models -->
<div class="section">
  <div class="section-title">By Model</div>
  ${byModel.length === 0 ? `<div class="empty"><div class="empty-icon">🤖</div><div class="empty-title">No data yet</div></div>` : `
  <div class="model-grid">${modelCards}</div>`}
</div>

<!-- Recent sessions -->
<div class="section">
  <div class="section-title">Recent Sessions</div>
  ${recentSessions.length === 0 ? `<div class="empty"><div class="empty-icon">💬</div><div class="empty-title">No sessions yet</div></div>` : `
  <div class="sessions-list">${sessionRows}</div>`}
</div>

</body>
</html>`;
}

/** Card showing real % utilization from API response headers */
function liveQuotaCard(
  label: string,
  utilization: number | null,
  resetAt: Date | null,
  cost: number,
  tokens: number,
  delay: number
): string {
  // Use raw decimal for bar width, but show at least 1px when there's any usage
  const rawPct = utilization !== null ? utilization * 100 : null;
  const statusClass = rawPct === null ? 'ok' : rawPct >= 90 ? 'danger' : rawPct >= 70 ? 'warn' : 'ok';

  // Display label: cap display at 100%, show one decimal when < 10%
  const displayPct = rawPct !== null ? Math.min(rawPct, 100) : null;
  const pctLabel = displayPct === null
    ? `<span class="muted">—</span>`
    : rawPct! > 100
      ? `<span class="quota-pct danger">Limit reached</span>`
      : displayPct < 0.05
        ? `<span class="quota-pct ok">&lt; 0.1% used</span>`
        : displayPct < 10
          ? `<span class="quota-pct ${statusClass}">${displayPct.toFixed(1)}% used</span>`
          : `<span class="quota-pct ${statusClass}">${Math.round(displayPct)}% used</span>`;

  // Bar: capped at 100%, minimum 0.5px when any usage exists
  const barWidth = rawPct !== null ? Math.min(Math.max(rawPct, rawPct > 0 ? 0.5 : 0), 100) : 0;
  const bar = `<div class="quota-track"><div class="quota-fill ${statusClass}" style="width:${barWidth}%"></div></div>`;

  const resetLine = resetAt
    ? `<span>Resets ${timeUntil(resetAt)}</span>`
    : `<span class="muted">Fetching…</span>`;

  // If utilisation came from a 429 (no actual headers), add a note
  const inferredNote = (rawPct !== null && rawPct >= 100 && utilization !== null)
    ? `<div class="quota-no-budget" style="margin-top:4px">⚠ Rate limited — check <a href="https://claude.ai/settings/usage" style="color:var(--accent2)">claude.ai/settings/usage</a></div>`
    : ``;

  return `
    <div class="quota-card" style="animation-delay:${delay}ms">
      <div class="quota-header"><span class="quota-label">${escHtml(label)}</span></div>
      <div class="quota-cost">${formatCost(cost)}</div>
      <div class="quota-tokens">${formatTokenCount(tokens)} tokens</div>
      ${bar}
      <div class="quota-budget-row">${resetLine}${pctLabel}</div>
      ${inferredNote}
    </div>`;
}

/** Simple spend card with no API utilization (e.g. last hour) */
function spendCard(label: string, cost: number, tokens: number, delay: number): string {
  return `
    <div class="quota-card" style="animation-delay:${delay}ms">
      <div class="quota-header"><span class="quota-label">${escHtml(label)}</span></div>
      <div class="quota-cost">${formatCost(cost)}</div>
      <div class="quota-tokens">${formatTokenCount(tokens)} tokens</div>
    </div>`;
}

function timeUntil(date: Date): string {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return 'soon';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `in ${d}d ${h % 24}h`;
  }
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
