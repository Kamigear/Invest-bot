# Plan: Live "Actual follows Predicted" Balance Mode (Option A)

## Goal
Add a wall-clock **live mode** so the displayed *actual balance* continuously flows/follows the *predicted* (projected) balance as simulation days advance in real time, and add/subtract (ledger) or a bot balance snapshot triggers an immediate recalculation.

Current state: simulation is a static 90-day batch run once on load / bot-balance snapshot / ledger edit (`js/app.js:runSimulation`, `js/engine/simulator.js:Simulator.run`). The predicted balance already exists per day (`records[i].balanceAfter`, produced by `Calculator.projectFutureBalance` via `Optimizer.doLookahead`). The missing piece is a continuous runner + a single "actual = projected at today" reconciliation.

## Key Decisions
1. **Advancement = wall-clock.** `currentSimDay = floor((todayReal - liveStartDate) / 86400000)`, clamped to `[0, simulationDays]`. Recompute lazily on every simulation run; no high-frequency ticker needed (each `runSimulation` is cheap over 90 days).
2. **Displayed "Saldo Aktual" = projected balance at the live day.** `records[currentSimDay].balanceAfter` becomes the live actual balance. (Alternative available: `totalAssets` = cash + active expected returns; default to `balanceAfter`.)
3. **Bot-scraped balance = ground-truth anchor.** `FirebaseDB.onBalanceUpdate` (`js/firebase.js:153`) sets `initialBalance` AND resets `liveStartDate = today`, restarting the projection forward from today. Live projection only advances *between* bot snapshots. (Bot itself is untouched — display-side only.)
4. **Add/subtract already recalculates.** `js/app.js:bindLedgerEvents` (Tambah / quickset / delete) already calls `runSimulation()`. No new trigger needed; just ensure live mode stays active across the rerun.
5. **Persist live state** to `localStorage` key `investcalc_livemode_v1` = `{ enabled, liveStartDate }`.
6. **Out of scope:** pushing the live projection back to the bot (Board runs headless on OrangePi; sync already flows bot→browser).

## Data Flow
```
[bot scrape] Board/index.js:runTask1 → Firestore botState/balance
        │ onSnapshot (js/firebase.js:153)
        ▼
App.init → onBalanceUpdate callback
        │ sets initialBalance + liveStartDate=today          (anchor actual)
        ▼
buildRuntimeConfig() (+ Ledger.getState) → Simulator.run
        │ produces records[] with balanceAfter per day
        ▼
currentSimDay = floor((today - liveStartDate)/86400000)     (advancement)
liveActual   = records[min(currentSimDay, N)].balanceAfter   (actual follows predicted)
        ▼
renderResults() → summary bar "Saldo Aktual" = liveActual   (continuous update)
```

## Tasks (ordered)
1. **`js/app.js` — add `LiveMode` module** (IIFE alongside `App`):
   - `start()`: set `liveStartDate = today` if unset, persist state, mark enabled.
   - `stop()`: persist `enabled=false`, clear.
   - `currentSimDay(config)`: `floor(daysElapsed(today, liveStartDate))`, clamped to `[0, config.simulationDays]`.
   - `projectedActual(records, day)`: returns `records[day].balanceAfter` (with `totalAssets` fallback option).
   - `persist()` / `restore()`: localStorage `investcalc_livemode_v1`.
2. **`js/app.js` — wire into `init()`**:
   - Restore persisted `enabled` + `liveStartDate`.
   - If enabled, kick off a lightweight `setInterval` (60s) that just calls `runSimulation()` (advancement is recomputed lazily inside). Clear on disable.
3. **`js/app.js` — `buildRuntimeConfig()`**: pass `liveStartDate` and `currentSimDay` through config so Simulator/optimizer can annotate which days are "actualized" vs "future" (informational flags, optional).
4. **`js/app.js` — `runSimulation()` / `renderResults()`**: after `_baseResult` is computed, if live mode enabled, set the **Saldo Aktual** summary-bar value to `LiveMode.projectedActual(records, currentSimDay)`; show a "🔴 Live" badge + the current sim-day number. Keep the Ledger card showing ledger `currentBalance` (manual entries).
5. **`js/app.js` — `onBalanceUpdate` callback** (`App.init`): on a new bot snapshot, if live mode active, reset `liveStartDate = today` (anchor real actual), then `runSimulation()`.
6. **`js/app.js` — `bindLedgerEvents`**: unchanged behavior (already calls `runSimulation()`); ensure live state is preserved (no `stop()` on add/subtract).
7. **`js/ui/summary.js`** (if it owns the summary bar): surface `liveActual` in the "Saldo Aktual" slot; add live-mode toggle UI in `renderConfigPanel` (checkbox bound to `LiveMode.start/stop`).
8. **`graphify update .`**: refresh the knowledge graph after edits (AST-only, no API cost) so cross-file edges stay accurate.

## Risks & Edge Cases
- `liveStartDate` null/future → `currentSimDay = 0` (start at day 1).
- Elapsed days > `simulationDays` → clamp to last day; show "Simulation selesai."
- Bot snapshot arriving during live projection → must anchor (Decision 3) or live value fights the bot. Implementation MUST reset `liveStartDate` on bot snapshot.
- Performance: `Simulator.run` is O(days × lookaheadDays × sweetSpotSearch). 90 days is fine; 60s tick acceptable. If sluggish, switch tick to daily.
- `projectFutureBalance` assumes no investment during projection — consistent with current `doLookahead`, but `totalAssets` may differ from `balanceAfter` because active investments aren't mature yet. Document this to the user.
- No test framework exists; validate in-browser only.

## Validation
- Open `index.html` in a browser:
  - Toggle "Live Mode" on → "🔴 Live" badge + "Hari X" appear; advancing the browser clock (or waiting) moves the day and "Saldo Aktual" follows `records[day].balanceAfter`.
  - Add a ledger transaction (Tambah) → simulation reruns immediately, "Saldo Aktual" realigns.
  - Simulate a bot balance snapshot (manually write Firestore `botState/balance` or stub `onBalanceUpdate`) → `liveStartDate` resets to today and projection restarts.
  - Live state survives reload (persisted in localStorage).
- Run `graphify update .` after edits and confirm no `GRAPH HEALTH WARNING`.

## Open Questions
- **Display metric:** default `balanceAfter` vs `totalAssets` (includes unrealized returns from active investments) for "Saldo Aktual". **Recommended:** `balanceAvailable` (`balanceAfter`) as primary; show `totalAssets` as a secondary label. (Marked for user confirmation in-browser, but default proceeds.)
- Live tick granularity: 60s is the default; can be reduced to daily if performance warrants.
