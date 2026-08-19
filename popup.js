// ── Constants ─────────────────────────────────────────────────────────────────
const FLASH_ANIMATION_DURATION_MS = 1000;  // Must match background.js

// ── DOM Elements ──────────────────────────────────────────────────────────────
const status = document.getElementById("status");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const statusIndicator = document.getElementById("statusIndicator");
const pauseButton = document.getElementById("pauseButton");
const pauseIcon = document.getElementById("pauseIcon");
const versionLabel = document.getElementById("version");

// Read the version from the manifest so the badge can't drift out of sync
versionLabel.textContent = `v${chrome.runtime.getManifest().version}`;

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
