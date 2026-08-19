# Changelog

All notable changes to Tab Merge for Zendesk will be documented in this file.

---

## [1] - 2026-08-19

Initial public release.

### Added
- Tab merging for Zendesk ticket, view, search, and other agent pages, with an
  independent toggle for each type
- Works with any `*.zendesk.com` account — no primary/secondary instance
  distinction, no per-instance configuration
- Quick Access chip row in the popup — one chip per open Zendesk account,
  labeled by subdomain, for jumping straight to that tab
- Cross-window matching — reuses a tab in any open window, not just the
  current one
- Pinned-tab support as merge targets
- SPA navigation via the History API to avoid full page reloads when
  switching between tickets
- Protected routes (chat, talk, admin, print, original-email views) are never
  merged
- Pause/resume button that disables all merging without losing settings
- Optional tab highlight animation confirming which tab was reused — off by
  default, recommended for multi-monitor setups
- "Tabs saved" counter — today's count and an all-time total (click the
  status indicator to switch between them)
- Dark mode support, following the OS theme
- `prefers-reduced-motion` support
- In-popup merge type documentation via hover tooltips and a "What's this?"
  link to the README
- WCAG AA text contrast throughout the popup, in both themes
