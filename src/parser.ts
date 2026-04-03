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
  cacheWriteTokens: number;
  costUSD: number;
}

// Per-million-token prices: [input, output, cacheWrite, cacheRead]
const PRICING_TABLE: Array<[string, number, number, number, number]> = [
  ['claude-opus-4',   15,   75,   18.75, 1.50],
  ['claude-sonnet-4', 3,    15,   3.75,  0.30],
  ['claude-haiku-4',  0.8,  4,    1.00,  0.08],
  ['claude-3-opus',   15,   75,   18.75, 1.50],
  ['claude-3-5-sonnet', 3,  15,   3.75,  0.30],
  ['claude-3-5-haiku', 0.8, 4,    1.00,  0.08],
  ['claude-3-sonnet', 3,    15,   3.75,  0.30],
  ['claude-3-haiku',  0.25, 1.25, 0.3125, 0.025],
];
const DEFAULT_PRICING: [number, number, number, number] = [3, 15, 3.75, 0.30];

function getPricing(model: string): [number, number, number, number] {
  for (const [prefix, input, output, cacheWrite, cacheRead] of PRICING_TABLE) {
    if (model.startsWith(prefix)) {
      return [input, output, cacheWrite, cacheRead];
    }
  }
  return DEFAULT_PRICING;
}

function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens: number,
  cacheReadTokens: number
): number {
  const [inputPrice, outputPrice, cacheWritePrice, cacheReadPrice] = getPricing(model);
  const M = 1_000_000;
  return (
    (inputTokens * inputPrice) / M +
    (outputTokens * outputPrice) / M +
    (cacheWriteTokens * cacheWritePrice) / M +
    (cacheReadTokens * cacheReadPrice) / M
  );
}

async function readJsonlFile(filePath: string, projectPath: string): Promise<UsageRecord[]> {
  const records: UsageRecord[] = [];

  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.type !== 'assistant') continue;

      const msg = obj.message;
      if (!msg?.usage) continue;

      // Only count final messages. Intermediate streaming messages (stop_reason === null)
      // carry the same input/cache token counts as the final message, so counting both
      // inflates costs by ~1.5–2x.
      if (msg.stop_reason === null || msg.stop_reason === undefined) continue;

      const usage = msg.usage;
      const inputTokens = usage.input_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? 0;
      const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
      const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

      if (inputTokens === 0 && outputTokens === 0 && cacheWriteTokens === 0 && cacheReadTokens === 0) {
        continue;
      }

      // Use cwd from the record if available for more accurate project path
      const projectDir = obj.cwd ?? projectPath;
      const model: string = msg.model ?? 'unknown';

      const costUSD = computeCost(model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens);

      records.push({
        timestamp: new Date(obj.timestamp ?? Date.now()),
        sessionId: obj.sessionId ?? '',
        projectPath: projectDir,
        model,
        inputTokens,
        outputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        costUSD,
      });
    } catch {
      // Skip malformed lines
    }
  }

  return records;
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

    let files: string[];
    try {
      files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = path.join(dirPath, file);
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
