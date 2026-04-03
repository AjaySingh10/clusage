import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { scanAllProjects } from './parser';
import { aggregate, UsageSummary } from './aggregator';
import { StatusBarController } from './statusBar';
import { showDashboard, refreshDashboard } from './webview';
import { fetchQuota, QuotaData } from './quota';

let statusBar: StatusBarController | undefined;
let lastSummary: UsageSummary | undefined;
let lastQuota: QuotaData | null = null;

async function refreshUsage(): Promise<void> {
  try {
    const records = await scanAllProjects();
    lastSummary = aggregate(records);
    statusBar?.update(lastSummary, lastQuota);
    refreshDashboard(lastSummary, lastQuota);
  } catch (err) {
    console.error('[cusage] usage refresh error:', err);
  }
}

let resetRefreshTimer: ReturnType<typeof setTimeout> | undefined;

async function refreshQuota(): Promise<void> {
  try {
    lastQuota = await fetchQuota();
    if (lastSummary) {
      statusBar?.update(lastSummary, lastQuota);
      refreshDashboard(lastSummary, lastQuota);
    }

    // Schedule an automatic re-fetch right after whichever reset is soonest,
    // so the UI clears itself the moment the quota window rolls over.
    if (resetRefreshTimer) clearTimeout(resetRefreshTimer);
    if (lastQuota) {
      const now = Date.now();
      const candidates = [
        lastQuota.fiveHourResetAt.getTime(),
        lastQuota.sevenDayResetAt.getTime(),
      ].filter(t => t > now);

      if (candidates.length > 0) {
        const nextReset = Math.min(...candidates);
        const delay = nextReset - now + 2000; // 2 s buffer after the reset
        resetRefreshTimer = setTimeout(() => refreshQuota(), delay);
      }
    }
  } catch (err) {
    console.error('[cusage] quota refresh error:', err);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  statusBar = new StatusBarController();
  context.subscriptions.push(statusBar);

  // Open dashboard command
  const openCmd = vscode.commands.registerCommand('cusage.openPanel', () => {
    if (lastSummary) {
      showDashboard(context, lastSummary, lastQuota);
    } else {
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Loading Claude usage data…' },
        async () => {
          await Promise.all([refreshUsage(), refreshQuota()]);
          if (lastSummary) showDashboard(context, lastSummary, lastQuota);
        }
      );
    }
  });
  context.subscriptions.push(openCmd);

  // Watch for new JSONL data
  const claudeGlob = new vscode.RelativePattern(
    vscode.Uri.file(path.join(os.homedir(), '.claude', 'projects')),
    '**/*.jsonl'
  );
  const watcher = vscode.workspace.createFileSystemWatcher(claudeGlob);
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const debouncedRefresh = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => refreshUsage(), 500);
  };
  watcher.onDidChange(debouncedRefresh, null, context.subscriptions);
  watcher.onDidCreate(debouncedRefresh, null, context.subscriptions);
  context.subscriptions.push(watcher);

  // Poll quota every 5 minutes
  const quotaInterval = setInterval(() => refreshQuota(), 5 * 60 * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(quotaInterval) });

  // Initial load — quota first so the panel shows it immediately
  refreshUsage();
  refreshQuota();
}

export function deactivate(): void {
  statusBar?.dispose();
}
