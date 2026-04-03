import { UsageRecord } from './parser';

export interface TokenBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ProjectSummary {
  projectPath: string;
  displayName: string;
  sessionCount: number;
  totalTokens: number;
  costUSD: number;
  breakdown: TokenBreakdown;
}

export interface ModelSummary {
  model: string;
  totalTokens: number;
  costUSD: number;
  requestCount: number;
}

export interface SessionSummary {
  sessionId: string;
  projectPath: string;
  displayName: string;
  timestamp: Date;
  totalTokens: number;
  costUSD: number;
  model: string;
}

export interface QuotaWindow {
  cost: number;
  tokens: number;
  label: string;
  windowMs: number;
}

export interface UsageSummary {
  allTimeCost: number;
  todayCost: number;
  monthCost: number;
  weekCost: number;
  todayTokens: number;
  allTimeTokens: number;
  tokenBreakdown: TokenBreakdown;
  byProject: ProjectSummary[];
  byModel: ModelSummary[];
  recentSessions: SessionSummary[];
  lastUpdated: Date;
  // Rolling windows for quota display
  lastHour: QuotaWindow;
  lastFiveHours: QuotaWindow;
  lastWeek: QuotaWindow;
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(2)}¢`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(0)}`;
}

function projectDisplayName(projectPath: string): string {
  const parts = projectPath.split('/').filter(Boolean);
  if (parts.length === 0) return projectPath;
  if (parts.length === 1) return parts[0];
  // Show last 2 segments: "user/project"
  return parts.slice(-2).join('/');
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfMonth(d: Date): Date {
  const r = new Date(d);
  r.setDate(1);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - day);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function aggregate(records: UsageRecord[]): UsageSummary {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const weekStart = startOfWeek(now).getTime();
  const monthStart = startOfMonth(now).getTime();

  let allTimeCost = 0;
  let todayCost = 0;
  let monthCost = 0;
  let weekCost = 0;
  let todayTokens = 0;
  let allTimeTokens = 0;
  const tokenBreakdown: TokenBreakdown = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  // Maps for grouping
  const projectMap = new Map<string, ProjectSummary>();
  const modelMap = new Map<string, ModelSummary>();
  // For sessions: group by sessionId
  const sessionMap = new Map<string, SessionSummary>();

  for (const r of records) {
    const t = r.timestamp.getTime();
    const tokens = r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens;

    allTimeCost += r.costUSD;
    allTimeTokens += tokens;
    tokenBreakdown.input += r.inputTokens;
    tokenBreakdown.output += r.outputTokens;
    tokenBreakdown.cacheRead += r.cacheReadTokens;
    tokenBreakdown.cacheWrite += r.cacheWriteTokens;

    if (t >= todayStart) {
      todayCost += r.costUSD;
      todayTokens += tokens;
    }
    if (t >= weekStart) weekCost += r.costUSD;
    if (t >= monthStart) monthCost += r.costUSD;

    // Project grouping
    const projectKey = r.projectPath;
    if (!projectMap.has(projectKey)) {
      projectMap.set(projectKey, {
        projectPath: r.projectPath,
        displayName: projectDisplayName(r.projectPath),
        sessionCount: 0,
        totalTokens: 0,
        costUSD: 0,
        breakdown: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      });
    }
    const proj = projectMap.get(projectKey)!;
    proj.totalTokens += tokens;
    proj.costUSD += r.costUSD;
    proj.breakdown.input += r.inputTokens;
    proj.breakdown.output += r.outputTokens;
    proj.breakdown.cacheRead += r.cacheReadTokens;
    proj.breakdown.cacheWrite += r.cacheWriteTokens;

    // Model grouping
    if (!modelMap.has(r.model)) {
      modelMap.set(r.model, { model: r.model, totalTokens: 0, costUSD: 0, requestCount: 0 });
    }
    const mod = modelMap.get(r.model)!;
    mod.totalTokens += tokens;
    mod.costUSD += r.costUSD;
    mod.requestCount += 1;

    // Session grouping - keep only last record per session for timestamp/model
    if (!sessionMap.has(r.sessionId)) {
      sessionMap.set(r.sessionId, {
        sessionId: r.sessionId,
        projectPath: r.projectPath,
        displayName: projectDisplayName(r.projectPath),
        timestamp: r.timestamp,
        totalTokens: 0,
        costUSD: 0,
        model: r.model,
      });
    }
    const sess = sessionMap.get(r.sessionId)!;
    sess.totalTokens += tokens;
    sess.costUSD += r.costUSD;
    if (r.timestamp > sess.timestamp) {
      sess.timestamp = r.timestamp;
      sess.model = r.model;
    }
  }

  // Count sessions per project
  for (const sess of sessionMap.values()) {
    const proj = projectMap.get(sess.projectPath);
    if (proj) proj.sessionCount++;
  }

  // Rolling windows
  const HOUR_MS = 60 * 60 * 1000;
  const FIVE_HOUR_MS = 5 * HOUR_MS;
  const WEEK_MS = 7 * 24 * HOUR_MS;
  const nowMs = now.getTime();

  const lastHour: QuotaWindow   = { cost: 0, tokens: 0, label: 'Last hour',    windowMs: HOUR_MS };
  const lastFiveHours: QuotaWindow = { cost: 0, tokens: 0, label: 'Last 5 hours', windowMs: FIVE_HOUR_MS };
  const lastWeek: QuotaWindow   = { cost: 0, tokens: 0, label: 'This week',    windowMs: WEEK_MS };

  for (const r of records) {
    const age = nowMs - r.timestamp.getTime();
    const tok = r.inputTokens + r.outputTokens + r.cacheReadTokens + r.cacheWriteTokens;
    if (age <= HOUR_MS)      { lastHour.cost += r.costUSD;      lastHour.tokens += tok; }
    if (age <= FIVE_HOUR_MS) { lastFiveHours.cost += r.costUSD; lastFiveHours.tokens += tok; }
    if (age <= WEEK_MS)      { lastWeek.cost += r.costUSD;      lastWeek.tokens += tok; }
  }

  const byProject = Array.from(projectMap.values())
    .sort((a, b) => b.costUSD - a.costUSD);

  const byModel = Array.from(modelMap.values())
    .sort((a, b) => b.costUSD - a.costUSD);

  const recentSessions = Array.from(sessionMap.values())
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 20);

  return {
    allTimeCost,
    todayCost,
    monthCost,
    weekCost,
    todayTokens,
    allTimeTokens,
    tokenBreakdown,
    byProject,
    byModel,
    recentSessions,
    lastUpdated: now,
    lastHour,
    lastFiveHours,
    lastWeek,
  };
}
