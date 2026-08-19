// Zendesk Tab Merge — background.js
//
// Merges Zendesk agent tabs so that clicking a ticket, view, or search link
// reuses your existing tab for that Zendesk instance instead of opening a
// duplicate. Works with any *.zendesk.com instance — there is no "primary"
// or internal instance; every subdomain is treated the same way.

// ── Constants ─────────────────────────────────────────────────────────────────

const NEW_TAB_THRESHOLD_MS = 5000;  // Tab URL change within 5s = likely from link click
const INFLIGHT_GUARD_TIMEOUT_MS = 1000;  // How long to block concurrent reuse operations
const FLASH_ANIMATION_DURATION_MS = 1000;  // Visual feedback flash duration

// Matches any https://*.zendesk.com/agent/tickets/{id} URL,
// including sub-paths like /events after the ticket ID.
// Capture group 1 → full host   (e.g. "acme.zendesk.com")
// Capture group 2 → ticket ID   (e.g. "12345")
// Capture group 3 → sub-path    (e.g. "/events", optional)
const TICKET_REGEX = /^https:\/\/([\w-]+\.zendesk\.com)\/agent\/tickets\/(\d+)(\/.*)?$/;

// Matches any https://*.zendesk.com/agent/search/* URL,
// including query parameters for saved searches.
const SEARCH_REGEX = /^https:\/\/([\w-]+\.zendesk\.com)\/agent\/search\/.*$/;

// Matches any https://*.zendesk.com/agent/filters/* URL (views).
const VIEW_REGEX = /^https:\/\/([\w-]+\.zendesk\.com)\/agent\/filters\/.*$/;

// Matches any other https://*.zendesk.com/agent/* URL (dashboard, reports, etc.)
// but excludes restricted routes (chat, talk, admin).
const GENERAL_AGENT_REGEX = /^https:\/\/([\w-]+\.zendesk\.com)\/agent\/(?!tickets|search|filters|chat|talk|admin).*$/;

// Routes that should NEVER be merged (chat, talk, admin, print pages, etc.)
const RESTRICTED_REGEX = /^https:\/\/([\w-]+\.zendesk\.com)\/(agent\/(chat|talk|admin)\/.*|tickets\/\d+\/(print|comments\/\d+\/original_email)\/.*)/;

// Matches any Zendesk agent URL - used to detect when restoration would trigger merge loop
const AGENT_URL_REGEX = /^https:\/\/[\w-]+\.zendesk\.com\/agent\//;

// ── In-flight guard ───────────────────────────────────────────────────────────
const inFlightTabReuses = new Set();

// ── Tab creation tracking ─────────────────────────────────────────────────────
const tabCreationTimes = new Map();
const tabFirstUrlChange = new Map();
const tabPreviousUrls = new Map();
const currentUrls = new Map();

chrome.tabs.onCreated.addListener((tab) => {
  tabCreationTimes.set(tab.id, Date.now());
  if (tab.url && tab.url !== 'chrome://newtab/' && !tab.url.startsWith('chrome://')) {
    tabPreviousUrls.set(tab.id, tab.url);
    currentUrls.set(tab.id, tab.url);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabCreationTimes.delete(tabId);
  tabFirstUrlChange.delete(tabId);
  tabPreviousUrls.delete(tabId);
  currentUrls.delete(tabId);
  inFlightTabReuses.delete(tabId);
});

// ── Stats tracking ────────────────────────────────────────────────────────────

// Track merge statistics. tabsSavedToday resets at midnight; tabsSavedAllTime
// only ever grows and is surfaced by clicking the popup's status indicator.
//
// Both counters live in chrome.storage.local because an MV3 service worker is
// killed after ~30s idle — in-memory state does not survive between merges, so
// every read goes through storage rather than a module-level variable.
let tabsSavedToday = 0;
let tabsSavedAllTime = 0;

// Resolves once the initial storage read completes. recordMerge() and the
// getStats handler await this so a merge that wakes the worker can never
// increment a counter that hasn't been loaded yet.
const statsReady = loadStats();

async function loadStats() {
  const stored = await chrome.storage.local.get([
    'tabsSavedToday',
    'lastResetDate',
    'tabsSavedAllTime',
  ]);

  const today = new Date().toDateString();
  const writes = {};

  tabsSavedAllTime = stored.tabsSavedAllTime ?? 0;
  if (stored.tabsSavedAllTime === undefined) {
    tabsSavedAllTime = stored.tabsSavedToday ?? 0;
    writes.tabsSavedAllTime = tabsSavedAllTime;
  }

  if (stored.lastResetDate === today) {
    tabsSavedToday = stored.tabsSavedToday ?? 0;
  } else {
    tabsSavedToday = 0;
    writes.tabsSavedToday = 0;
    writes.lastResetDate = today;
  }

  if (Object.keys(writes).length > 0) {
    await chrome.storage.local.set(writes);
  }
}

async function checkAndResetDailyCounter() {
  const today = new Date().toDateString();
  const { lastResetDate } = await chrome.storage.local.get('lastResetDate');
  if (lastResetDate !== today) {
    tabsSavedToday = 0;
    await chrome.storage.local.set({ tabsSavedToday: 0, lastResetDate: today });
  }
}

/**
 * Records a successful merge for stats.
 *
 * Never rejects: callers invoke this inside try/catch blocks that treat any
 * throw as "the tab was already closed", so a storage failure here would be
 * logged as something it isn't. Stats are also not worth failing a merge over.
 */
async function recordMerge() {
  try {
    await statsReady;
    await checkAndResetDailyCounter();
    tabsSavedToday++;
    tabsSavedAllTime++;
    await chrome.storage.local.set({ tabsSavedToday, tabsSavedAllTime });
  } catch (err) {
    console.log('[Tab Merge for Zendesk] Could not record merge stat:', err.message);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStats') {
    (async () => {
      await statsReady;
      await checkAndResetDailyCounter();
      sendResponse({ tabsSavedToday, tabsSavedAllTime });
    })();
    return true;   // keep the message channel open for the async response
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  mergeTickets: true,
  mergeViews: true,
  mergeSearch: true,
  mergeGeneral: true,
  isPaused: false,
  tabHighlight: false,
};

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, items => {
      resolve(items);
    });
  });
}

// ── Visual feedback ──────────────────────────────────────────────────────────

/**
 * Shows a visual flash animation around the browser window edges to indicate
 * that a tab has been focused/reused. Features a gradient effect with corner
 * emphasis, color temperature shift, and breathing motion.
 */
async function showTabFocusFlash(tabId) {
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
    console.error('[Tab Merge for Zendesk] Flash failed:', err.message);
  }
}

// ── Icon management ───────────────────────────────────────────────────────────

async function updateIcon() {
  const settings = await getSettings();

  let iconState = 'active';

  if (settings.isPaused) {
    iconState = 'paused';
  } else if (!settings.mergeTickets && !settings.mergeViews &&
             !settings.mergeSearch && !settings.mergeGeneral) {
    iconState = 'disabled';
  }

  chrome.action.setIcon({
    path: {
      "16": `images/icon-${iconState}-16.png`,
      "19": `images/icon-${iconState}-19.png`,
      "38": `images/icon-${iconState}-38.png`,
      "48": `images/icon-${iconState}-48.png`
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    updateIcon();
  }
});

async function initialize() {
  await updateIcon();

  // Initialize currentUrls AND tabPreviousUrls for all existing tabs (http/https only)
  // This prevents pre-existing tabs from being closed when used for the first time
  const allTabs = await chrome.tabs.query({});
  allTabs.forEach(tab => {
    if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      currentUrls.set(tab.id, tab.url);
      tabPreviousUrls.set(tab.id, tab.url);  // Mirror onCreated behavior
    }
  });
}

initialize();
chrome.runtime.onInstalled.addListener(details => {
  initialize();
});

// ── SPA navigation ────────────────────────────────────────────────────────────

/**
 * Attempts to navigate a tab using the History API rather than a full Chrome
 * navigation, avoiding a hard page reload.
 *
 * Runs in the MAIN world so Zendesk's Ember router (running in the page
 * context) receives the popstate event and handles the route transition.
 *
 * Returns true if the script executed successfully, false if the tab was
 * not scriptable or an error occurred — callers should fall back to
 * chrome.tabs.update on false.
 */
async function navigateTabSpa(tabId, url) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',   // run in page context so Ember's router receives the event
      func: (targetUrl) => {
        try {
          const parsed   = new URL(targetUrl);
          const path     = parsed.pathname + parsed.search + parsed.hash;

          window.history.pushState({}, '', path);
          window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));

          return true;
        } catch {
          return false;
        }
      },
      args: [url],
    });

    return results?.[0]?.result === true;

  } catch {
    return false;
  }
}

// ── Core reuse logic ──────────────────────────────────────────────────────────

async function tryReuseTab(tabId, url) {
  const settings = await getSettings();

  if (settings.isPaused) return;
  if (RESTRICTED_REGEX.test(url)) return;

  let match, host, itemId, urlType;

  if ((match = url.match(TICKET_REGEX))) {
    if (!settings.mergeTickets) return;
    host = match[1];
    itemId = match[2];
    urlType = 'ticket';
  } else if ((match = url.match(SEARCH_REGEX))) {
    if (!settings.mergeSearch) return;
    host = match[1];
    itemId = 'search';
    urlType = 'search';
  } else if ((match = url.match(VIEW_REGEX))) {
    if (!settings.mergeViews) return;
    host = match[1];
    itemId = 'view';
    urlType = 'view';
  } else if ((match = url.match(GENERAL_AGENT_REGEX))) {
    if (!settings.mergeGeneral) return;
    host = match[1];
    itemId = 'agent';
    urlType = 'general';
  } else {
    return;
  }

  if (inFlightTabReuses.has(tabId)) return;

  let targetId = null;

  try {
    inFlightTabReuses.add(tabId);

    // Find any Zendesk agent tab for this host across ALL windows
    const tabs = await chrome.tabs.query({
      url: `https://${host}/agent/*`,
    });

    // Exclude the newly-opened tab and discarded tabs.
    // Pinned tabs are included so pinned Zendesk sessions work as merge targets.
    const candidates = tabs.filter(t =>
      t.id    !== tabId &&
      !t.discarded
    );

    if (candidates.length === 0) {
      inFlightTabReuses.delete(tabId);
      return;
    }

    const availableCandidates = candidates.filter(t => !inFlightTabReuses.has(t.id));

    if (availableCandidates.length === 0) {
      inFlightTabReuses.delete(tabId);
      return;
    }

    const target = availableCandidates.find(t => t.url === url) ?? availableCandidates[0];
    targetId = target.id;

    inFlightTabReuses.add(targetId);

    await chrome.tabs.update(targetId, { active: true });
    await chrome.windows.update(target.windowId, { focused: true });

    if (target.url !== url) {
      console.log('[Tab Merge for Zendesk] Attempting SPA navigation for tab', targetId, 'to', url);
      const navigated = await navigateTabSpa(targetId, url);

      if (!navigated) {
        console.log('[Tab Merge for Zendesk] SPA navigation failed, using full navigation');
        await chrome.tabs.update(targetId, { url });
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (settings.tabHighlight) {
      await showTabFocusFlash(targetId);
    }

    // Distinguish between:
    // - New tab from link: close it
    // - Navigation in existing tab (bookmark/address bar): keep it

    if (!tabFirstUrlChange.has(tabId)) {
      tabFirstUrlChange.set(tabId, Date.now());
    }

    const tabCreationTime = tabCreationTimes.get(tabId);
    const urlChangeTime = tabFirstUrlChange.get(tabId);

    let shouldClose = false;
    let reason = '';

    if (!tabCreationTime) {
      shouldClose = false;
      reason = 'pre-existing tab';
    } else {
      const tabAge = Date.now() - tabCreationTime;
      const timeSinceCreation = urlChangeTime - tabCreationTime;

      if (timeSinceCreation < NEW_TAB_THRESHOLD_MS) {
        shouldClose = true;
        reason = `new tab (URL changed ${Math.round(timeSinceCreation/1000)}s after creation)`;
      } else {
        shouldClose = false;
        reason = `existing tab (${Math.round(tabAge/1000)}s old)`;
      }
    }

    if (shouldClose) {
      try {
        await chrome.tabs.remove(tabId);
        await recordMerge();
        console.log(
          `[Tab Merge for Zendesk] ${urlType} on ${host} (${itemId})` +
          ` → reused tab ${targetId}, closed tab ${tabId} (${reason})`
        );
      } catch (err) {
        console.log(`[Tab Merge for Zendesk] Tab ${tabId} already closed`);
      }
    } else {
      const previousUrl = tabPreviousUrls.get(tabId);

      if (!previousUrl || previousUrl === 'chrome://newtab/' || previousUrl.startsWith('chrome://')) {
        try {
          await chrome.tabs.remove(tabId);
          await recordMerge();
          console.log(
            `[Tab Merge for Zendesk] ${urlType} on ${host} (${itemId})` +
            ` → reused tab ${targetId}, closed tab ${tabId} (was new tab page)`
          );
        } catch (err) {
          console.log(`[Tab Merge for Zendesk] Tab ${tabId} already closed`);
        }
      } else if (previousUrl !== url) {
        const isAgentUrl = AGENT_URL_REGEX.test(previousUrl);

        if (isAgentUrl) {
          try {
            await chrome.tabs.remove(tabId);
            await recordMerge();
            console.log(
              `[Tab Merge for Zendesk] ${urlType} on ${host} (${itemId})` +
              ` → reused tab ${targetId}, closed tab ${tabId} (previous URL was agent URL, would cause loop)`
            );
          } catch (err) {
            console.log(`[Tab Merge for Zendesk] Tab ${tabId} already closed`);
          }
        } else {
          try {
            await chrome.tabs.update(tabId, { url: previousUrl });
            console.log(
              `[Tab Merge for Zendesk] ${urlType} on ${host} (${itemId})` +
              ` → reused tab ${targetId}, restored tab ${tabId} to ${previousUrl} (${reason})`
            );
          } catch (err) {
            console.log(`[Tab Merge for Zendesk] Tab ${tabId} no longer exists`);
          }
        }
      } else {
        console.log(
          `[Tab Merge for Zendesk] ${urlType} on ${host} (${itemId})` +
          ` → reused tab ${targetId}, kept tab ${tabId} (${reason}, already on same URL)`
        );
      }
    }

    setTimeout(() => {
      inFlightTabReuses.delete(tabId);
      inFlightTabReuses.delete(targetId);
    }, INFLIGHT_GUARD_TIMEOUT_MS);

  } catch (err) {
    console.error("[Tab Merge for Zendesk] Error in tryReuseTab:", err);
    inFlightTabReuses.delete(tabId);
    if (targetId !== null) inFlightTabReuses.delete(targetId);
  }
}

// ── Listener ──────────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    const previousUrl = currentUrls.get(tabId);

    if (previousUrl && previousUrl !== changeInfo.url) {
      tabPreviousUrls.set(tabId, previousUrl);
    }

    currentUrls.set(tabId, changeInfo.url);

    tryReuseTab(tabId, changeInfo.url);
  }
});
