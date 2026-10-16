import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as os from 'os';

export interface UsageRecord {
  timestamp: Date;
  sessionId: string;
  projectPath: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;   // total: 5m + 1h (for display/aggregation)
  cacheWrite5mTokens: number; // priced at 1.25× base input
  cacheWrite1hTokens: number; // priced at 2.0× base input
  costUSD: number;
}

// Per-million-token prices: [input, output, cacheWrite5m, cacheWrite1h, cacheRead]
// Only the currently-accessible models are listed here — everything else
// (Opus 4.x, Sonnet 4.x, Haiku 3.x, Claude 3.x, ...) has been retired.
// Matched by prefix in order, so a newer point release must come before its
// base model ("claude-opus-5-5" before "claude-opus-5").
type Pricing = [number, number, number, number, number];
const PRICING_TABLE: Array<[string, ...Pricing]> = [
  // Fable 5.1 - $10 / $50, cache reads 0.025x input
  ['claude-fable-5-1',  10,    50,  12.50,  20,   0.25],
  // Fable 5 - $10 / $50
  ['claude-fable-5',    10,    50,  12.50,  20,   1.00],
  // Opus 5.5 - $4 / $20, cache reads 0.05x input
  ['claude-opus-5-5',    4,    20,   5.00,   8,   0.20],
  // Opus 5 - $5 / $25
  ['claude-opus-5',      5,    25,   6.25,  10,   0.50],
  // Sonnet 5.5 - $2 / $10, cache reads 0.05x input
  ['claude-sonnet-5-5',  2,    10,   2.50,   4,   0.10],
  // Sonnet 5 - $2 / $10 (the launch "introductory" rate became the standard
  // price; the increase to $3 / $15 scheduled for 2026-09-01 was cancelled)
  ['claude-sonnet-5',    2,    10,   2.50,   4,   0.20],
  // Haiku 4.5 - $1 / $5
  ['claude-haiku-4-5',   1,     5,   1.25,   2,   0.10],
];
const DEFAULT_PRICING: Pricing = [3, 15, 3.75, 6, 0.30];

// Haiku 5.5 has two rate cards chosen per request by prompt length: every input
// token counts toward the threshold, including cache reads and cache writes.
const HAIKU_5_5_LONG_PROMPT_TOKENS = 100_000;
const HAIKU_5_5_PRICING: Pricing      = [0.10, 0.50, 0.125, 0.20, 0.01];
const HAIKU_5_5_LONG_PRICING: Pricing = [0.50, 2.50, 0.625, 1.00, 0.05];

function getPricing(model: string, promptTokens: number): Pricing {
  if (model.startsWith('claude-haiku-5-5')) {
    return promptTokens > HAIKU_5_5_LONG_PROMPT_TOKENS ? HAIKU_5_5_LONG_PRICING : HAIKU_5_5_PRICING;
  }
  for (const [prefix, ...pricing] of PRICING_TABLE) {
    if (model.startsWith(prefix)) return pricing;
  }
  return DEFAULT_PRICING;
}

function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheWrite5mTokens: number,
  cacheWrite1hTokens: number,
  cacheReadTokens: number
): number {
  const [inputPrice, outputPrice, cacheWrite5mPrice, cacheWrite1hPrice, cacheReadPrice] = getPricing(
    model, inputTokens + cacheWrite5mTokens + cacheWrite1hTokens + cacheReadTokens
  );
  const M = 1_000_000;
  return (
    (inputTokens        * inputPrice)       / M +
    (outputTokens       * outputPrice)      / M +
    (cacheWrite5mTokens * cacheWrite5mPrice) / M +
    (cacheWrite1hTokens * cacheWrite1hPrice) / M +
    (cacheReadTokens    * cacheReadPrice)   / M
  );
}

async function readJsonlFile(filePath: string, projectPath: string): Promise<UsageRecord[]> {
  const records: UsageRecord[] = [];
  // Claude Code appends the same final assistant message multiple times under different
  // outer UUIDs. Deduplicate by the inner message.id so each API response is counted once.
  const seenMsgIds = new Set<string>();

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type !== 'assistant') continue;

      const msg = obj.message;
      if (!msg?.usage) continue;

      // Skip streaming intermediates - stop_reason is null until the final chunk.
      if (msg.stop_reason === null || msg.stop_reason === undefined) continue;

      // Skip duplicates - Claude Code writes the same final message several times.
      const msgId: string = msg.id ?? '';
      if (msgId) {
        if (seenMsgIds.has(msgId)) continue;
        seenMsgIds.add(msgId);
      }

      const usage = msg.usage;
      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

      // Split cache writes by tier - 1h writes cost 2× base input, 5m writes cost 1.25×.
      // Claude Code exclusively uses 1h caching; the sub-object is present in all known
      // JSONL versions, but we fall back gracefully when it's absent.
      const cc = usage.cache_creation ?? {};
      const cacheWrite5mTokens: number = cc.ephemeral_5m_input_tokens ?? 0;
      const cacheWrite1hTokens: number = cc.ephemeral_1h_input_tokens ?? (usage.cache_creation_input_tokens ?? 0);
      const cacheWriteTokens = cacheWrite5mTokens + cacheWrite1hTokens;

      if (inputTokens === 0 && outputTokens === 0 && cacheWriteTokens === 0 && cacheReadTokens === 0) {
        continue;
      }

      const projectDir = obj.cwd ?? projectPath;
      const model: string = msg.model ?? 'unknown';
      const timestamp = new Date(obj.timestamp ?? Date.now());

      const costUSD = computeCost(model, inputTokens, outputTokens, cacheWrite5mTokens, cacheWrite1hTokens, cacheReadTokens);

      records.push({
        timestamp,
        sessionId: obj.sessionId ?? '',
        projectPath: projectDir,
        model,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        cacheWrite5mTokens,
        cacheWrite1hTokens,
        costUSD,
      });
    } catch {
      // Skip malformed lines
    }
  }

  return records;
}

// Recursively collect every *.jsonl under a project directory. Claude Code
// nests subagent transcripts under <sessionId>/subagents/, so a flat readdir
// would miss them.
function collectJsonlFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsonlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      out.push(full);
    }
  }
  return out;
}

export async function scanAllProjects(): Promise<UsageRecord[]> {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');

  let projectDirs: string[];
  try {
    projectDirs = fs.readdirSync(claudeDir).filter(d =>
      fs.statSync(path.join(claudeDir, d)).isDirectory()
    );
  } catch {
    return [];
  }

  const allRecords: UsageRecord[] = [];

  for (const projectDir of projectDirs) {
    const projectPath = '/' + projectDir.replace(/^-/, '').replace(/-/g, '/');
    const dirPath = path.join(claudeDir, projectDir);

    for (const filePath of collectJsonlFiles(dirPath)) {
      try {
        const records = await readJsonlFile(filePath, projectPath);
        allRecords.push(...records);
      } catch {
        // Skip unreadable files
      }
    }
  }

  return allRecords;
}
