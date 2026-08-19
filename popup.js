// ── Constants ─────────────────────────────────────────────────────────────────
const FLASH_ANIMATION_DURATION_MS = 1000;  // Must match background.js

// ── DOM Elements ──────────────────────────────────────────────────────────────
const status = document.getElementById("status");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const statusIndicator = document.getElementById("statusIndicator");
const pauseButton = document.getElementById("pauseButton");
const pauseIcon = document.getElementById("pauseIcon");
const quickAccessGroup = document.getElementById("quickAccessGroup");
const quickAccessContainer = document.getElementById("quickAccessContainer");
const versionLabel = document.getElementById("version");

// Read the version from the manifest so the badge can't drift out of sync.
// Trailing zero components (e.g. "1.0" -> "1") are dropped for display,
// since there's no point release to distinguish yet.
function formatVersion(version) {
  const parts = version.split('.');
  while (parts.length > 1 && parts[parts.length - 1] === '0') {
    parts.pop();
  }
  return parts.join('.');
}

versionLabel.textContent = `v${formatVersion(chrome.runtime.getManifest().version)}`;

// All checkboxes
const checkboxes = {
  mergeTickets: document.getElementById("mergeTickets"),
  mergeViews: document.getElementById("mergeViews"),
  mergeSearch: document.getElementById("mergeSearch"),
  mergeGeneral: document.getElementById("mergeGeneral"),
  tabHighlight: document.getElementById("tabHighlight"),
};

let saveTimer = null;

// Latest counts from the service worker, cached so the status-indicator click
// handler can swap views without another round trip. showAllTime is not
// persisted — every popup opens on today's count.
let latestStats = { tabsSavedToday: 0, tabsSavedAllTime: 0 };
let showAllTime = false;

const DEFAULT_SETTINGS = {
  mergeTickets: true,
  mergeViews: true,
  mergeSearch: true,
  mergeGeneral: true,
  isPaused: false,
  tabHighlight: false,
};

// ── Load saved settings ───────────────────────────────────────────────────────
chrome.storage.sync.get(DEFAULT_SETTINGS, items => {
  // Set checkbox states
  Object.keys(checkboxes).forEach(key => {
    checkboxes[key].checked = items[key];
  });

  // Set pause button and status indicator state
  updatePauseButtonUI(items.isPaused);
  updateStatusIndicator(items.isPaused);

  // Create quick access chips
  createQuickAccessButtons();

  // Load and display stats
  loadStats();
});

// ── Save on checkbox change ───────────────────────────────────────────────────
Object.keys(checkboxes).forEach(key => {
  checkboxes[key].addEventListener("change", () => {
    chrome.storage.sync.set({ [key]: checkboxes[key].checked }, () => {
      showSavedStatus();
    });
  });
});

// ── Pause button ──────────────────────────────────────────────────────────────
pauseButton.addEventListener("click", () => {
  chrome.storage.sync.get(DEFAULT_SETTINGS, items => {
    const newPausedState = !items.isPaused;
    chrome.storage.sync.set({ isPaused: newPausedState }, () => {
      updatePauseButtonUI(newPausedState);
      loadStats(); // Reload stats to update status bar with current count
      // Don't show "Settings saved" for pause/resume - status bar already shows state
    });
  });
});

// ── Quick access ───────────────────────────────────────────────────────────────

/**
 * Builds one chip per open Zendesk account. There's no primary/default
 * instance to fall back on — with no Zendesk tabs open there's nothing
 * useful to jump to, so the whole group stays hidden.
 */
async function createQuickAccessButtons() {
  const tabs = await chrome.tabs.query({
    url: "https://*.zendesk.com/agent/*"
  });

  // Group tabs by host, keeping the first tab seen per host
  const instanceMap = new Map();
  tabs.forEach(tab => {
    const match = tab.url.match(/https:\/\/([\w-]+\.zendesk\.com)/);
    if (match) {
      const host = match[1];
      if (!instanceMap.has(host)) {
        instanceMap.set(host, tab);
      }
    }
  });

  quickAccessContainer.innerHTML = '';

  if (instanceMap.size === 0) {
    quickAccessGroup.hidden = true;
    return;
  }

  quickAccessGroup.hidden = false;

  // Deterministic ordering: alphabetical by host
  const instances = Array.from(instanceMap.entries())
    .sort(([hostA], [hostB]) => hostA.localeCompare(hostB));

  instances.forEach(([host, tab]) => {
    const label = host.replace('.zendesk.com', '');

    const chip = createChip(label, tab);
    quickAccessContainer.appendChild(chip);
  });
}

/**
 * Builds one instance chip that focuses its tab when clicked. Every chip is
 * styled identically — unlike the internal extension, there's no primary
 * instance here, so no chip should carry more visual weight than another.
 */
function createChip(label, tab) {
  const button = document.createElement('button');
  button.className = 'instance-chip';
  button.textContent = label;
  button.title = `Switch to ${label}`;
  button.setAttribute('aria-label', `Switch to ${label} tab`);

  button.addEventListener('click', async () => {
    try {
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });

      const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
      if (settings.tabHighlight) {
        await showFlash(tab.id);
      }
    } catch (err) {
      // Tab may have been closed - ignore silently
      console.log(`[Tab Merge for Zendesk] Error switching tab:`, err);
    }

    window.close();
  });

  return button;
}

async function showFlash(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // A full-viewport pulsing overlay is exactly what this opts out of.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        const existing = document.getElementById('zendesk-tab-merge-flash');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'zendesk-tab-merge-flash';
        overlay.style.cssText = `
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          pointer-events: none !important;
          z-index: 2147483647 !important;
          border-radius: 0 !important;
        `;

        const corners = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
        corners.forEach(corner => {
          const accent = document.createElement('div');
          accent.className = `zendesk-flash-corner ${corner}`;
          const [v, h] = corner.split('-');
          accent.style.cssText = `
            position: absolute !important;
            ${v}: 0 !important;
            ${h}: 0 !important;
            width: 120px !important;
            height: 120px !important;
            pointer-events: none !important;
            opacity: 0 !important;
            background: radial-gradient(
              circle at ${h === 'left' ? '0' : '100'}% ${v === 'top' ? '0' : '100'}%,
              rgba(3, 125, 142, 0.3) 0%,
              rgba(3, 125, 142, 0.15) 40%,
              transparent 70%
            ) !important;
            animation: corner-glow 1.0s cubic-bezier(0.34, 0.8, 0.4, 1) forwards !important;
          `;
          overlay.appendChild(accent);
        });

        const border = document.createElement('div');
        border.className = 'zendesk-flash-border';
        border.style.cssText = `
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          pointer-events: none !important;
          animation: border-breathe 1.0s cubic-bezier(0.34, 0.8, 0.4, 1) forwards !important;
        `;
        overlay.appendChild(border);

        const style = document.createElement('style');
        style.textContent = `
          @keyframes border-breathe {
            0% {
              box-shadow:
                inset 0 0 0 0px rgba(3, 125, 142, 0),
                inset 0 0 0 0px rgba(3, 145, 166, 0),
                inset 0 0 40px 0px rgba(3, 125, 142, 0);
            }
            12% {
              box-shadow:
                inset 0 0 0 20px rgba(3, 125, 142, 0.28),
                inset 0 0 0 36px rgba(3, 145, 166, 0.12),
                inset 0 0 80px 8px rgba(3, 125, 142, 0.4);
            }
            25% {
              box-shadow:
                inset 0 0 0 28px rgba(3, 135, 156, 0.38),
                inset 0 0 0 48px rgba(16, 155, 180, 0.16),
                inset 0 0 110px 16px rgba(3, 145, 166, 0.55);
            }
            45% {
              box-shadow:
                inset 0 0 0 32px rgba(3, 145, 166, 0.42),
                inset 0 0 0 56px rgba(22, 165, 190, 0.18),
                inset 0 0 130px 24px rgba(16, 155, 180, 0.6);
            }
            65% {
              box-shadow:
                inset 0 0 0 24px rgba(3, 135, 156, 0.3),
                inset 0 0 0 44px rgba(3, 145, 166, 0.12),
                inset 0 0 90px 16px rgba(3, 135, 156, 0.42);
            }
            85% {
              box-shadow:
                inset 0 0 0 12px rgba(3, 125, 142, 0.14),
                inset 0 0 0 24px rgba(3, 135, 156, 0.06),
                inset 0 0 50px 8px rgba(3, 125, 142, 0.18);
            }
            100% {
              box-shadow:
                inset 0 0 0 0px rgba(3, 125, 142, 0),
                inset 0 0 0 0px rgba(3, 135, 156, 0),
                inset 0 0 20px 0px rgba(3, 125, 142, 0);
            }
          }

          @keyframes corner-glow {
            0% {
              opacity: 0;
              transform: scale(0.8);
            }
            20% {
              opacity: 0.7;
              transform: scale(1);
            }
            50% {
              opacity: 1;
              transform: scale(1.1);
            }
            75% {
              opacity: 0.5;
              transform: scale(1.05);
            }
            100% {
              opacity: 0;
              transform: scale(1);
            }
          }
        `;
        document.head.appendChild(style);
        document.body.appendChild(overlay);

        setTimeout(() => {
          overlay.remove();
          style.remove();
        }, 1000);
      }
    });
  } catch (err) {
    // Tab may not be scriptable - ignore
  }
}

// ── Helper functions ──────────────────────────────────────────────────────────
function showSavedStatus() {
  status.classList.add("visible");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => status.classList.remove("visible"), 1800);
}

function updatePauseButtonUI(isPaused) {
  if (isPaused) {
    pauseButton.classList.add("paused");
    pauseIcon.textContent = "▶";
    pauseButton.setAttribute('title', 'Resume merging');
    document.body.classList.add("paused");
  } else {
    pauseButton.classList.remove("paused");
    pauseIcon.textContent = "⏸";
    pauseButton.setAttribute('title', 'Pause merging');
    document.body.classList.remove("paused");
  }
}

function updateStatusIndicator(isPaused, tabsSaved) {
  if (isPaused) {
    statusDot.classList.add("paused");
    statusText.textContent = "Paused";
  } else {
    statusDot.classList.remove("paused");
    if (tabsSaved !== undefined && tabsSaved > 0) {
      const count = tabsSaved.toLocaleString();
      const unit = `tab${tabsSaved === 1 ? '' : 's'}`;
      // Both views name their period so neither can be mistaken for the other.
      statusText.textContent = showAllTime
        ? `${count} ${unit} all time`
        : `${count} ${unit} saved today`;
    } else {
      statusText.textContent = showAllTime ? "0 tabs all time" : "On";
    }
  }
}

// ── Stats display ─────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getStats' });
    latestStats = {
      tabsSavedToday: response.tabsSavedToday ?? 0,
      tabsSavedAllTime: response.tabsSavedAllTime ?? 0,
    };

    // Update status indicator with count
    chrome.storage.sync.get(DEFAULT_SETTINGS, items => {
      renderStats(items.isPaused);
    });

  } catch (err) {
    console.log('Could not load stats:', err);
  }
}

function renderStats(isPaused) {
  const count = showAllTime ? latestStats.tabsSavedAllTime : latestStats.tabsSavedToday;
  updateStatusIndicator(isPaused, count);
  statusIndicator.setAttribute(
    'title',
    showAllTime ? "Click for today's count" : 'Click for all-time total'
  );
}

// Easter egg: clicking the status indicator swaps today's count for the
// all-time total. Not persisted — every popup opens on today's view.
statusIndicator.addEventListener('click', () => {
  showAllTime = !showAllTime;
  chrome.storage.sync.get(DEFAULT_SETTINGS, items => {
    renderStats(items.isPaused);
  });
});
