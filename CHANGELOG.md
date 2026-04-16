# Changelog

All notable changes to **Claude Usage** will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] — 2026-04-17

### Fixed
- **Weekly quota preserved on session reset** — when the 5-hour window resets and a fresh quota fetch returns without a `7d-utilization` header, the previous weekly utilization is now carried forward instead of being zeroed out

### Changed
- **Faster quota updates** — quota now refreshes ~1 second after each Claude Code API response (triggered by JSONL file writes), down from a fixed 5-minute poll. The 5-minute interval remains as a fallback when Claude Code is idle.

---

## [2.0.0] — 2026-04-10

### Changed
- Status bar now shows 5h session time remaining alongside quota percentage: `$(graph) $3.70  5h:46% $(clock)1h23m  7d:6%`

### Fixed
- **Instant load on startup** — last known usage and quota are cached in `globalState` and restored immediately when VS Code opens, so the status bar is never blank while waiting for network/disk
- **Stale quota after reset** — if a quota window's reset time already passed while VS Code was closed, utilization is shown as 0% on restore rather than the old cached value

---

## [1.0.2] — 2026-04-03

### Changed
- README images updated to absolute GitHub raw URLs so they render correctly on the VS Code Marketplace page
- Added dashboard screenshot to README

---

## [1.0.1] — 2026-04-03

### Fixed
- **Quota auto-reset** — extension now schedules a refresh exactly 2 seconds after each quota window resets, so the UI clears itself immediately instead of waiting up to 5 minutes
- **429 handling** — when the API returns 429 with no rate-limit headers, quota is correctly marked as "Limit reached" with a red bar rather than silently showing `< 0.1%`
- **Bar overflow** — quota progress bar is now capped at 100% width; over-limit state shows "Limit reached" label in red
- **Status bar over-limit** — status bar now shows `5h:maxed` instead of a percentage above 100%

---

## [1.0.0] — 2026-04-03

### Added
- Professional marketplace icon featuring Claude AI sparkle mark
- Full README with feature documentation, pricing reference, and privacy policy

### Fixed
- **Accurate cost calculation** — intermediate streaming messages (`stop_reason: null`) were being counted alongside final messages, inflating costs by ~1.5–2×. Only final messages are now counted.
- **Sub-1% quota display** — quota utilisation values below 1% were rounded to "0% used". They now display with one decimal place (e.g. "0.3% used") or "< 0.1%" for very small values.

### Changed
- Status bar now shows live session and weekly quota percentages instead of token count: `$(graph) $3.70  5h:46%  7d:6%`
- Status bar icon changed from `$(hubot)` to `$(graph)`
- Hover tooltip reformatted as aligned Markdown tables with quota reset times

---

## [0.1.0] — 2026-04-03

### Added
- **Status bar item** — shows today's cost and live quota at a glance; click to open the dashboard
- **Dashboard webview** — full-screen panel with:
  - Hero cards: all-time, today, this week, this month spend
  - Live quota cards: current session (5 h) and weekly utilisation pulled directly from Anthropic API response headers — no manual configuration required
  - Token breakdown: input, output, cache read, cache write with percentage bars
  - Projects table sorted by cost
  - Per-model breakdown cards
  - Recent sessions list with relative timestamps
- **Auto-refresh** — file-system watcher on `~/.claude/projects/**/*.jsonl` triggers a refresh within 500 ms of any new Claude Code activity
- **Quota polling** — quota data is re-fetched from the Anthropic API every 5 minutes using the OAuth token stored in `~/.claude/.credentials.json`
- **Zero configuration** — reads Claude Code's own credential and project files; nothing to set up
- Cross-platform support: Linux, macOS, Windows (including WSL)
