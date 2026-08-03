# Plan: Fix Bot State Balance Being Used as Saldo Awal

**Status: IMPLEMENTED** ✅

## Problem

The headless bot (`Board/index.js:runTask1`) scrapes the website's current balance and writes it to Firestore as `botState/balance`. The frontend (`js/app.js`) then reads this bot-scraped balance as **Saldo Awal** (initial balance), overwriting the user's manually-configured starting balance on every page load and every Firestore snapshot.

Since the bot's scraped balance fluctuates over time (it reflects the actual running balance after all investments/income/gains), Saldo Awal keeps reverting to whatever the bot last saw (e.g., 169), instead of the user's intended starting balance.

## Architecture: Saldo Awal vs Saldo Aktual

| Concept | Source | Purpose | Current Bug |
|---|---|---|---|
| **Saldo Awal** (initial balance) | User input → `localStorage` (`investcalc_config_v1.initialBalance`) | Starting balance for simulation projections | Overwritten by Firebase bot state → reverts to bot's scraped value |
| **Saldo Aktual** (actual balance) | Firestore `botState/balance` (bot-scraped) | Real-world current balance from the website | Displayed in Ledger card via `Ledger.getState()` → derived from `initialBalance + ledger transactions` |

**Key insight:** `Ledger.getState()` in `js/engine/ledger.js:73` computes `currentBalance = initialBalance + netActual`. Since `initialBalance` is being set to the bot's scraped balance, the "Saldo Aktual" shown in the ledger card is also contaminated.

## Tasks

### 1. Remove debug logging (cleanup from investigation)

Remove all `[DEBUG]` console.log lines added during the investigation from `js/app.js`:

- `init()`: line ~182 `console.log('[DEBUG] App.init() called')`
- `loadConfig()`: lines 173, 175 `console.log('[DEBUG] loadConfig...')`
- `saveConfig()`: line 163 `console.log('[DEBUG] saveConfig...')`
- Firebase fetch block: lines 197, 199, 204, 206 `console.log/error('[DEBUG]...')`
- `renderConfigPanel()`: line 268 `console.log('[DEBUG] renderConfigPanel...')`
- Listener setup: line 209 `console.log('[DEBUG] Setting up Firestore...')`
- `onBalanceUpdate` callback: lines 221, 224, 226, 242 `console.log('[DEBUG]...')`
- `tryLogin()`: line 1000 `console.log('[DEBUG] checkPassword result...')`
- `readConfig()`: line 611 `console.log('[DEBUG] readConfig...')`
- `DOMContentLoaded`: line ~975 `console.log('[DEBUG] DOMContentLoaded...')`

### 2. Stop using Firebase bot state as Saldo Awal

**File:** `js/app.js` — `App.init()` (lines 187-200)

Remove the automatic `getCurrentBalance()` → `initialBalance` override entirely. Saldo Awal should come ONLY from:
1. `loadConfig()` (localStorage restore)
2. User editing the `#cfg-initial` input field
3. Explicit user action (e.g., a sync button — see Task 4)

```js
// BEFORE (remove):
const fbBalance = await FirebaseDB.getCurrentBalance();
if (fbBalance !== null && fbBalance !== _config.initialBalance) {
  _config.initialBalance = fbBalance;
  saveConfig();
}

// AFTER (remove the entire Firebase-init-balance block)
```

### 3. Stop auto-updating Saldo Awal on `onSnapshot` events

**File:** `js/app.js` — `App.init()` (lines 216-259)

Remove the `initialBalance` mutation from the `onBalanceUpdate` callback. The bot's real-time balance snapshot should update **Saldo Aktual** display, not overwrite **Saldo Awal**.

Keep the `onBalanceUpdate` listener, but change its callback to:
- Update a separate `_config.botActualBalance` field (if desired for display)
- NOT touch `_config.initialBalance`
- If LiveMode is enabled, call `LiveMode.resetAnchor()` and `runSimulation()`

```js
// AFTER:
FirebaseDB.onBalanceUpdate((balance) => {
  console.log("Realtime balance update from bot:", balance);
  // Bot balance is Saldo Aktual — do NOT overwrite Saldo Awal (initialBalance)
  _config.botActualBalance = balance;
  // Trigger live mode re-anchor + simulation if enabled
  if (LiveMode.enabled) {
    LiveMode.resetAnchor();
    runSimulation();
  }
});
```

### 4. Add explicit "Sync Saldo Awal from Bot" button (opt-in)

**File:** `js/app.js` — `renderConfigPanel()`

Add a button next to the "Saldo Awal" input that lets the user explicitly sync the Firebase bot balance into Saldo Awal, if they choose to.

In the config panel HTML template, add:
```html
<div class="param-group" style="display:flex; gap:4px;">
  <input type="number" id="cfg-initial" value="${_config.initialBalance}" min="0" step="10" style="flex:1;"/>
  <button type="button" id="btn-sync-initial-from-bot" title="Sync Saldo Awal from bot balance" style="...">🔄</button>
</div>
```

In `bindConfigEvents()`, add handler:
```js
panel.querySelector('#btn-sync-initial-from-bot')?.addEventListener('click', async () => {
  if (!FirebaseDB || typeof FirebaseDB.getCurrentBalance !== 'function') return;
  try {
    const botBalance = await FirebaseDB.getCurrentBalance();
    if (botBalance !== null) {
      _config.initialBalance = botBalance;
      saveConfig();
      const initialInput = panel.querySelector('#cfg-initial');
      if (initialInput) initialInput.value = botBalance;
      renderConfigPanel();
      runSimulation();
    }
  } catch (e) {
    console.error('Failed to sync Saldo Awal from bot:', e);
  }
});
```

### 5. Fix LiveMode plan doc reference (informational)

**File:** `.kilo/plans/1785669327659-live-predicted-balance-mode.md`

The plan doc (line 11, Decision 3) states: "Bot-scraped balance = ground-truth anchor. `onBalanceUpdate` sets `initialBalance` AND resets `liveStartDate`."

This design decision is the root cause of the bug. The bot balance should be the **actual balance display**, not the **initial balance** for simulation projections. This doc should be updated to reflect the corrected architecture.

## Risks & Edge Cases

- **Existing localStorage values** already polluted with bot balance (e.g., 169). The user may need to manually reset Saldo Awal after the fix. Consider adding a one-time migration: if `initialBalance` equals `botActualBalance`, keep the existing value (user's intent was to start at that amount).
- **LiveMode projections** will now start from the user's Saldo Awal (stable) instead of the bot's current balance. This is the correct behavior per the plan doc — the simulation projects forward from the user's stated starting balance.
- **Offline mode**: If Firebase is unreachable, the bot-sync button will fail gracefully.

## Validation

1. Open browser DevTools → Application → Local Storage. Verify `investcalc_config_v1` does **not** get overwritten with bot balance on page load.
2. Set Saldo Awal to a specific value (e.g., 520), refresh the page → Saldo Awal should remain 520, not revert to bot's scraped balance (169).
3. Click the "🔄 Sync Saldo Awal from Bot" button → Saldo Awal should update to the bot's current balance from Firestore.
4. Verify "Saldo Aktual" card in the config panel still shows `initialBalance + ledger transactions` (derived from `Ledger.getState()`).
5. If LiveMode is enabled, verify it still anchors on bot balance updates (but does NOT overwrite Saldo Awal).
