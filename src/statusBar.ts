import * as vscode from 'vscode';
import { UsageSummary, formatCost, formatTokenCount } from './aggregator';
import { QuotaData } from './quota';

export class StatusBarController {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = 'cusage.openPanel';
    this.item.text = '$(graph) Claude...';
    this.item.tooltip = 'Claude Usage — click to open dashboard';
    this.item.show();
  }

  update(summary: UsageSummary, quota: QuotaData | null): void {
    const cost = formatCost(summary.todayCost);
    const fmtPct = (v: number) =>
      v < 0.0005 ? '0%' :
      v < 0.001  ? '<0.1%' :
      v < 0.1    ? `${(v * 100).toFixed(1)}%` :
                   `${Math.round(v * 100)}%`;

    // Status bar: $(graph) $3.70  5h:46%  7d:6%
    if (quota) {
      this.item.text = `$(graph) ${cost}  5h:${fmtPct(quota.fiveHourUtilization)}  7d:${fmtPct(quota.sevenDayUtilization)}`;
    } else {
      this.item.text = `$(graph) ${cost}`;
    }

    // Tooltip
    const quotaLines: string[] = quota ? [
      ``,
      `| Quota | Used | Resets |`,
      `|---|---|---|`,
      `| Session (5h) | **${fmtPct(quota.fiveHourUtilization)}** | ${timeUntil(quota.fiveHourResetAt)} |`,
      `| Weekly (7d)  | **${fmtPct(quota.sevenDayUtilization)}** | ${timeUntil(quota.sevenDayResetAt)} |`,
    ] : [];

    const lines = [
      `**Claude Usage — Today**`,
      ``,
      `| | |`,
      `|---|---|`,
      `| Cost | ${formatCost(summary.todayCost)} |`,
      `| Tokens | ${formatTokenCount(summary.todayTokens)} |`,
      `| Input | ${formatTokenCount(summary.tokenBreakdown.input)} |`,
      `| Output | ${formatTokenCount(summary.tokenBreakdown.output)} |`,
      ...quotaLines,
      ``,
      `All-time: **${formatCost(summary.allTimeCost)}**`,
      ``,
      `*Click to open full dashboard*`,
    ];

    const md = new vscode.MarkdownString(lines.join('\n'));
    md.isTrusted = true;
    this.item.tooltip = md;
  }

  dispose(): void {
    this.item.dispose();
  }
}

function timeUntil(date: Date): string {
  const diff = date.getTime() - Date.now();
  if (diff <= 0) return 'soon';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
