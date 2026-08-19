# Tab Merge for Zendesk

A Chrome extension that automatically consolidates Zendesk tabs so you're never drowning in duplicates — no matter how many ticket, view, or search links you open throughout your day.

**Version 1.0.0** • Chrome Manifest V3

---

## What It Does

Tab Merge for Zendesk prevents tab clutter by routing all Zendesk agent links into a single tab per Zendesk instance. Click a ticket link from Slack, email, or anywhere else — instead of opening a new tab, it navigates your existing tab for that instance to the new page and closes the duplicate.

Works with any Zendesk account — `yourcompany.zendesk.com` — with no setup required.

**Result:** Clean tab bar, faster workflow, zero configuration needed.

---

## Key Features

### 🚀 Quick Access
- **Instance chips** — A compact row of chips, one per open Zendesk account
  - Each chip is labeled by subdomain (e.g. "acme" for `acme.zendesk.com`)
  - The most recently active instance is the primary (filled); the rest are outlined
  - Only appears when you have Zendesk tabs open — nothing to show otherwise
  - Wraps to a second line rather than growing the popup, however many are open
  - Click a chip to jump straight to that tab, across any window

### 🎯 Granular Control
Toggle merging for each page type independently:
- **Tickets** — `/agent/tickets/*`
- **Views** — `/agent/filters/*`
- **Search** — `/agent/search/*`
- **Other** — Dashboard, reporting, org and user records

Hover any toggle for a one-line explanation, or use the **What's this?** link in
the popup. See [Merge Types Explained](#merge-types-explained) for the full
reference on what each one matches.

### 🎨 Visual Feedback
- **Dynamic icons** — Extension icon changes color based on state:
  - 🟢 Green background = Active and merging
  - 🟡 Amber background = Paused
  - ⚪ Gray background = Disabled
- **Header status indicator** — Colored dot + text shows "On", "Paused", or "5 tabs saved today"
  - Click it to reveal the all-time total ("1,204 tabs all time"); click again for today's count
- **Tab highlight effect** — Optional gradient pulse animation that confirms which tab was reused
  - **Off by default** — opt in via the "Tab highlight effect" toggle in settings
  - Recommended for multi-monitor setups, where a merged tab can land on a different screen
- **Dark mode** — Follows your OS theme automatically
- **Respects reduced motion** — Honors `prefers-reduced-motion`, suppressing the highlight effect entirely

### ⏸️ Pause/Resume
One-click pause button (in header) temporarily disables all merging without losing settings. Perfect for:
- Comparing multiple tickets side-by-side
- Working on complex issues needing reference tabs
- Quick troubleshooting sessions

### 🪟 Smart Merging
- **Any Zendesk instance** — Works with whatever `*.zendesk.com` account you use, no configuration needed
- **Cross-window** — Finds tabs across ALL browser windows, not just current
- **Pinned tab support** — Pinned tabs work as merge targets
- **SPA navigation** — Uses the History API to avoid page reloads when switching tickets
- **Protected routes** — Chat, talk, admin, and print pages never merge

### 🔐 Zero Tracking
- No URLs, tickets, or browsing data collected
- No external servers contacted
- Settings stored via `chrome.storage.sync`, stats via `chrome.storage.local` — both stay in your browser
- All processing happens client-side

---

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top-right toggle)
4. Click "Load unpacked" and select the extension folder
5. Extension activates immediately with all merge types enabled

---

## Usage

### Default Behavior
Works automatically out of the box on any Zendesk account. All merge types are enabled by default:
- ✅ Tickets merge
- ✅ Views merge
- ✅ Search merge
- ✅ Other agent pages merge
- ⬜ Tab highlight effect (opt-in)

### Customize Settings
Click the extension icon to:
1. Use the instance chips (if any Zendesk tabs are open) for quick access
2. Toggle individual merge types (2×2 grid: Tickets, Views, Search, Other) — hover
   one for a quick explanation, or click **What's this?** for the full reference
3. Toggle tab highlight animation on/off
4. Pause/resume all merging with the header button
5. Access documentation and feedback links in the footer

### Visual Status
Check the extension icon color or open the popup:
- **Icon: Green** → Active and merging tabs
- **Icon: Amber** → Paused (temporarily disabled)
- **Icon: Gray** → All merge types disabled
- **Popup header** → Shows status dot + "On", "Paused", or "X tabs saved today" (click for the all-time total)

---

## Merge Types Explained

The four toggles under **Merge types** control which kinds of Zendesk agent pages
get consolidated into your existing tab. Each one is independent — turning off
Tickets does not affect Views, and so on. When a type is **off**, links of that
kind open in a new tab like normal.

### Tickets

Individual ticket pages.

| | |
|---|---|
| **Matches** | `/agent/tickets/{id}` and any sub-path |
| **Examples** | `/agent/tickets/12345`<br>`/agent/tickets/12345/events`<br>`/agent/tickets/12345/requester` |
| **Turn off if** | You regularly compare two tickets side by side |

This is the toggle most people care about — it's what stops a Slack thread full
of ticket links from becoming twelve tabs. Sub-paths are included, so jumping
from a ticket to its event log reuses the same tab.

### Views

Saved view and filter pages — your queues.

| | |
|---|---|
| **Matches** | `/agent/filters/*` |
| **Examples** | `/agent/filters/360002212345`<br>`/agent/filters/unassigned` |
| **Turn off if** | You keep a queue open in a dedicated tab while working tickets |

Note that a view and a ticket are *different* types, so with both enabled they
share one tab: clicking a ticket from a view navigates that same tab, and going
back to the view navigates it again.

### Search

Search results pages.

| | |
|---|---|
| **Matches** | `/agent/search/*` (including query parameters) |
| **Examples** | `/agent/search/1?type=ticket&q=printer`<br>Saved-search links shared from elsewhere |
| **Turn off if** | You want to keep a result set open while opening tickets from it |

### Other

Everything else under `/agent/` — the catch-all.

| | |
|---|---|
| **Matches** | Any `/agent/*` page that isn't a ticket, view, or search |
| **Examples** | `/agent/dashboard`<br>`/agent/reporting`<br>`/agent/organizations/123`<br>`/agent/users/456` |
| **Never matches** | `/agent/chat/*`, `/agent/talk/*`, `/agent/admin/*`, ticket print and original-email pages |
| **Turn off if** | You want dashboards and reports to stay put while you work |

The exclusions are deliberate and not user-configurable: chat and talk hold live
session state that a navigation would drop, admin pages are long-form work, and
print views are opened precisely because you want a separate window.

### At a glance

| Toggle | URL pattern | Typical source of the link |
|--------|-------------|----------------------------|
| **Tickets** | `/agent/tickets/{id}` | Slack, email notifications, ticket search |
| **Views** | `/agent/filters/*` | Bookmarks, sidebar queues |
| **Search** | `/agent/search/*` | Saved searches |
| **Other** | any other `/agent/*` | Dashboard, reports, org/user records |

**Interaction with other settings:** a page must pass its type toggle to merge.
**Pause** overrides all four toggles at once without changing them. If you use
more than one Zendesk account, each account gets its own tab — links only merge
with other tabs on the same `*.zendesk.com` subdomain.

---

## Multiple Zendesk Accounts

If you work across more than one Zendesk instance (for example, your own
account and a customer's), each `*.zendesk.com` subdomain gets its own tab.
Links for `acme.zendesk.com` merge with other `acme.zendesk.com` tabs; links
for `widgets.zendesk.com` merge separately. Nothing needs to be configured —
this is automatic.

Use the Quick Access chip row in the popup to jump between instances — one
chip appears per open account, labeled by subdomain.

---

## Permissions Explained

| Permission | Purpose |
|------------|---------|
| `tabs` | Read tab URLs, focus/close/update tabs for merging |
| `storage` | Save user preferences and stats locally |
| `scripting` | Inject SPA navigation script for flicker-free tab switching |
| `https://*.zendesk.com/agent/*` | Interact only with Zendesk agent pages (nowhere else) |

**No network permissions.** The extension runs entirely offline.

---

## Technical Details

### Architecture
- **Manifest V3** — Uses modern Chrome extension APIs
- **Service worker** — `background.js` runs merge logic
- **SPA navigation** — History API integration for smooth transitions
- **Storage** — `chrome.storage.sync` for cross-device settings, `chrome.storage.local` for stats

### URL Detection
5 regex patterns for precise matching:
1. `TICKET_REGEX` — Ticket pages (`/agent/tickets/{id}`)
2. `VIEW_REGEX` — View pages (`/agent/filters/*`)
3. `SEARCH_REGEX` — Search pages (`/agent/search/*`)
4. `GENERAL_AGENT_REGEX` — Dashboard, reports, other agent pages
5. `RESTRICTED_REGEX` — Protected routes (never merge)

### Files
```
customer-tab-merge/
├── background.js        # Service worker with merge logic
├── popup.html           # Compact 300px settings UI (design tokens + dark mode)
├── popup.js             # Settings management
├── manifest.json        # Extension config
├── images/               # Icon assets
├── CHANGELOG.md          # Version history
├── TESTING.md            # Test procedures
└── README.md             # This file
```

---

## Troubleshooting

**Tabs not merging?**
- Check if the extension is paused (yellow icon)
- Verify the relevant merge type is enabled in settings
- Check the browser console for `[Tab Merge for Zendesk]` logs

**Settings not saving?**
- Ensure Chrome sync is enabled
- Check `chrome://sync-internals/`

**Icon stuck on one color?**
- Close and reopen the popup
- Reload the extension in `chrome://extensions/`

---

## Support

- **Documentation:** [README.md](https://github.com/joetinter/customer-tab-merge)
- **Issues:** [GitHub Issues](https://github.com/joetinter/customer-tab-merge/issues)
- **Testing:** See `TESTING.md` for test cases

---

## License

MIT — see `LICENSE`.
