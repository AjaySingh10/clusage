# Changelog

## [1.0.0] — 2026-04-03

### Added
- Professional marketplace icon featuring Claude AI sparkle mark
- Full README with feature documentation, pricing reference, and privacy policy

### Changed
- Status bar tooltip reformatted as aligned Markdown tables
- Fixed "Quotasa" typo → "Quota" in tooltip
- Version bumped to 1.0.0 for initial marketplace release

---


All notable changes to **Claude Usage** will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.1] — 2026-04-03

### Fixed
- **Accurate cost calculation** — intermediate streaming messages (`stop_reason: null`) were being counted alongside final messages, inflating costs by ~1.5–2×. Only final messages are now counted.
- **Sub-1% quota display** — quota utilisation values below 1% were rounded to "0% used". They now display with one decimal place (e.g. "0.3% used") or "< 0.1%" for very small values.

### Changed
- Status bar now shows live session and weekly quota percentages instead of token count: `$(graph) $3.70  5h:46%  7d:6%`
- Status bar icon changed from `$(hubot)` to `$(graph)`
- Hover tooltip reformatted as a Markdown table with quota reset times

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
