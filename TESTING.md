# Testing Guide

This guide helps you test Merge for Zendesk locally before publishing.

Examples below use `acme.zendesk.com` as a stand-in for your own Zendesk
account — substitute your real subdomain when testing.

## Installation for Testing

### Load Unpacked Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `customer-tab-merge` directory
5. Extension should now appear with its current version

### Verify Installation

- Extension icon appears in Chrome toolbar
- Click icon → popup shows:
  - "Merge for Zendesk" header
  - 4 checkboxes for merge types (all checked by default)
  - 1 checkbox for the tab highlight effect (unchecked by default)
  - Pause/Resume button in the header

## Test Cases

### Test 1: Ticket Merging (Default Behavior)

**Setup:**
- All settings enabled (default)
- Not paused

**Steps:**
1. Open `https://acme.zendesk.com/agent/tickets/12345`
2. Open `https://acme.zendesk.com/agent/tickets/67890` from a new tab

**Expected:**
- Second ticket opens in the first tab
- Only one tab remains
- Tab navigates to ticket 67890

**Console log should show:**
```
[Merge for Zendesk] ticket on acme.zendesk.com (67890) → reused tab X, closed tab Y
```

### Test 2: View Merging

**Setup:**
- All settings enabled
- Not paused

**Steps:**
1. Open `https://acme.zendesk.com/agent/filters/360000123456`
2. From an external link, open `https://acme.zendesk.com/agent/filters/360000789012`

**Expected:**
- Second view opens in the first tab
- Only one tab remains
- Tab navigates to the second view

**Console log should show:**
```
[Merge for Zendesk] view on acme.zendesk.com (view) → reused tab X, closed tab Y
```

### Test 3: Search Merging

**Setup:**
- All settings enabled
- Not paused

**Steps:**
1. Open `https://acme.zendesk.com/agent/search/1`
2. Open `https://acme.zendesk.com/agent/search/2?query=test`

**Expected:**
- Second search opens in the first tab
- Only one tab remains

**Console log should show:**
```
[Merge for Zendesk] search on acme.zendesk.com (search) → reused tab X, closed tab Y
```

### Test 4: General Agent Pages

**Setup:**
- All settings enabled
- Not paused

**Steps:**
1. Open `https://acme.zendesk.com/agent/dashboard`
2. Open `https://acme.zendesk.com/agent/reports/analytics`

**Expected:**
- Second page opens in the first tab
- Only one tab remains

**Console log should show:**
```
[Merge for Zendesk] general on acme.zendesk.com (agent) → reused tab X, closed tab Y
```

### Test 5: Selective Merging

**Setup:**
- Enable: Tickets ✅, Views ❌, Search ✅, Other ❌
- Not paused

**Steps:**
1. Open ticket link → should merge ✅
2. Open view link → should NOT merge (new tab) ❌
3. Open search link → should merge ✅
4. Open dashboard link → should NOT merge (new tab) ❌

**Expected:**
- Tickets merge into one tab
- Views open in separate tabs
- Search merges into one tab
- Dashboard opens in a separate tab

### Test 6: Pause Feature

**Setup:**
- All settings enabled
- Click the pause button (⏸) in the header

**Steps:**
1. Verify the button turns amber and the panel dims
2. Open multiple ticket links

**Expected:**
- All ticket links open in separate tabs (no merging)
- Multiple tabs remain open

**Steps to resume:**
1. Click the resume button (▶)
2. Panel returns to normal
3. Open ticket links again

**Expected:**
- Merging resumes normally
- Tabs consolidate as before

### Test 7: Protected Routes

**Setup:**
- All settings enabled
- Not paused

**Steps:**
1. Open `https://acme.zendesk.com/agent/chat/12345`
2. Open `https://acme.zendesk.com/agent/talk/conversations/67890`
3. Open `https://acme.zendesk.com/agent/admin/settings`

**Expected:**
- Each opens in a NEW tab (never merges)
- Multiple tabs remain
- No console logs from the extension

### Test 8: Multiple Zendesk Accounts

**Setup:**
- All settings enabled
- Not paused

**Steps:**
1. Open `https://acme.zendesk.com/agent/tickets/111`
2. Open `https://widgets.zendesk.com/agent/tickets/222`
3. Open a second ticket for each account

**Expected:**
- `acme.zendesk.com` tickets merge with each other
- `widgets.zendesk.com` tickets merge with each other
- The two accounts never merge into each other's tab

### Test 8b: Quick Access Chips

**Setup:**
- Tabs open for two different Zendesk accounts (from Test 8)

**Steps:**
1. Open the popup with no Zendesk tabs open — verify the "Quick Access" group is absent
2. Open one Zendesk tab, then reopen the popup
3. Open a second Zendesk tab for a different account, then reopen the popup
4. Click each chip

**Expected:**
- No "Quick Access" group when no Zendesk tabs are open
- One chip per open account, labeled by subdomain
- Every chip is styled identically — none is visually emphasized over another
- Clicking a chip focuses that tab and its window, then closes the popup

### Test 9: Multi-Window Support

**Setup:**
- All settings enabled
- Not paused

**Steps:**
1. Open a ticket in Window 1
2. Create Window 2
3. In Window 2, open another ticket for the same account

**Expected:**
- Window 1 focuses automatically
- Ticket navigates in Window 1
- Window 2's new tab closes

### Test 10: SPA Navigation

**Setup:**
- All settings enabled
- Not paused
- One existing Zendesk tab already open

**Steps:**
1. Open a ticket link from an external source
2. Watch the existing tab

**Expected:**
- Tab URL changes WITHOUT a full page reload
- No white flash/flicker
- Smooth transition
- If SPA navigation fails, a full navigation occurs (with a console warning)

### Test 11: Tab Highlight Effect

**Setup:**
- Enable "Tab highlight effect" in Options
- Not paused

**Steps:**
1. Open a ticket link that reuses an existing tab
2. Watch the reused tab

**Expected:**
- A brief gradient pulse appears around the tab's viewport
- With "Tab highlight effect" left at its default (off), no pulse appears
- With the OS-level "reduce motion" setting on, no pulse appears even if enabled

### Test 12: Tabs Saved Counter

**Setup:**
- All settings enabled
- Not paused

**Steps:**
1. Trigger several merges (see Tests 1-4)
2. Open the popup and check the header status text
3. Click the status indicator

**Expected:**
- Status text reads "N tabs today"
- Clicking the indicator swaps to "N tabs all time"; clicking again swaps back
- Reopening the popup always starts on "today"

## Settings Persistence

### Test Settings Sync

**Steps:**
1. Change settings in the popup
2. Verify "Saved ✓" appears
3. Close the popup
4. Reopen the popup

**Expected:**
- Settings are preserved
- All checkboxes reflect the saved state
- Pause button reflects the saved state

### Test Across Browser Restarts

**Steps:**
1. Set custom settings (e.g., disable views)
2. Close Chrome completely
3. Reopen Chrome
4. Check extension settings

**Expected:**
- Custom settings persist
- Not reset to defaults

## Common Issues

### Issue: Tabs Not Merging

**Check:**
1. Is the extension paused? (amber icon)
2. Is the specific merge type enabled?
3. Check console for `[Merge for Zendesk]` logs
4. Verify the URL matches the expected pattern

### Issue: Settings Not Saving

**Check:**
1. Is Chrome sync enabled?
2. Check the browser console for errors
3. Try `chrome://sync-internals/` to verify sync status

### Issue: Popup Not Opening

**Check:**
1. Extension is enabled in `chrome://extensions/`
2. No JavaScript errors in the extension popup (right-click → Inspect)

### Issue: Protected Routes Merging

**Check:**
1. Verify the URL contains `/agent/chat/`, `/agent/talk/`, or `/agent/admin/`
2. Check `RESTRICTED_REGEX` in `background.js`
3. Should see NO console log for these URLs

## Performance Check

### Memory Usage

**Steps:**
1. Open Chrome Task Manager (Shift+Esc)
2. Find "Merge for Zendesk"
3. Check memory usage

**Expected:**
- < 10 MB memory
- Minimal CPU usage when idle

### Large Tab Count

**Steps:**
1. Open 20+ Zendesk tabs rapidly
2. Verify all merge correctly
3. Check for any errors

**Expected:**
- All tabs merge as configured
- No errors or stuck states
- The in-flight guard prevents race conditions

## Validation Checklist

Before considering a release complete, verify:

- [ ] All 4 URL regex patterns work correctly
- [ ] Each merge type toggle works independently
- [ ] Pause/resume works without losing settings
- [ ] Protected routes never merge
- [ ] Multiple Zendesk accounts merge independently of each other
- [ ] Settings persist across sessions
- [ ] Multi-window merging works
- [ ] SPA navigation works (or falls back gracefully)
- [ ] Console logs are informative
- [ ] No JavaScript errors in console
- [ ] Popup UI looks correct in both light and dark mode
- [ ] "Saved ✓" confirmation appears
- [ ] Memory usage is reasonable

## Debugging Tips

### Enable Verbose Logging

Check the browser console (F12) for:
```
[Merge for Zendesk] <urlType> on <host> (<itemId>) → reused tab X, closed tab Y
[Merge for Zendesk] SPA navigation failed for tab X, falling back to full navigation
```

### Inspect Extension

1. Go to `chrome://extensions/`
2. Find "Merge for Zendesk"
3. Click "Inspect views: service worker"
4. Console shows `background.js` logs

### Inspect Popup

1. Open the extension popup
2. Right-click inside the popup
3. Select "Inspect"
4. Console shows `popup.js` activity

## Next Steps

Once testing is complete:
1. Document any issues found
2. Fix bugs if needed
3. Package the extension for distribution
4. Update the version history in the README
5. Create release notes
