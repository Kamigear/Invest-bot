# Plan: Day-Specific Manual Income Entries

## Goal

Allow users to manually add income for a specific simulation day (e.g., day 4) without changing the initial balance (Saldo Awal). These entries are injected into the simulation loop alongside automated daily income.

## Background

The simulator loop in `js/engine/simulator.js` adds automated daily income at Step 1 (line 53). There is no mechanism to inject manual/one-time income on a specific day. The existing "Enhance Ledger Realtime Plan" (1785685336852) planned broader ledger functionality but has not been implemented. This plan covers the narrower, immediate need: day-specific income entries.

## Data Model

Add a `manualIncome` array to the config, persisted in localStorage alongside other config:

```js
manualIncome: [
  { day: 4, amount: 100, note: "Bonus hari ke-4" },
  { day: 10, amount: 50, note: "Tambahan pendapatan" }
]
```

Each entry: `day` (1-based simulation day), `amount` (number), `note` (optional string).

## Changes

### 1. `js/app.js` — Config & UI

**Default config** (~line 115): Add `manualIncome: []` to `DEFAULT_CONFIG`.

**Config panel UI** (~line 243, after daily income section): Add an "Income Harian Tambahan" section with:
- Input for day number (`#cfg-manual-day`, type number, min 1)
- Input for amount (`#cfg-manual-amount`, type number, min 0, step 1)
- Input for note (`#cfg-manual-note`, type text, optional)
- "Tambah" button to add the entry
- A list below showing added entries with a "Hapus" button per entry

**`readConfig()`** (~line 484): Read `manualIncome` from the config panel inputs and store in `_config.manualIncome`.

**`renderConfigPanel()`**: Render the manual income section and the list of entries.

### 2. `js/engine/simulator.js` — Simulation Injection

**Step 1.5** (after daily income, before weekly bonus): After line 55, add a block that checks `config.manualIncome` for entries matching the current `day` and adds them to `balance`:

```js
const dayManualIncome = (config.manualIncome || [])
  .filter(entry => entry.day === day)
  .reduce((sum, entry) => sum + entry.amount, 0);
balance += dayManualIncome;
```

Also track `totalManualIncome` in the summary accumulators and include it in the day record.

### 3. `js/app.js` — Results Display

**`renderResults()`** (~line 654): Include `manualIncome` total in the Saldo Aktual bar or in a breakdown section so the user can see which days had manual income added.

## Validation

1. Set Saldo Awal to 520, simulation days to 90
2. Add manual income of 100 on day 4
3. Run simulation → day 4 balance should include the +100
4. Verify Saldo Awal (initialBalance) remains 520 in config and summary
5. Reload page → manual income entries persist in localStorage
6. Remove an entry → re-run → entry no longer applies
7. Add entry for day 0 or negative day → should be rejected or ignored

## Risks

- Manual income entries for days already past (relative to today in live mode) should still apply in simulation — this is intentional, the simulation is forward-looking from day 1.
- No duplicate-day guard — user can add multiple entries for the same day; they will stack. This is acceptable for flexibility.
- The `manualIncome` array is stored in localStorage config; large arrays could bloat storage but are unlikely to be a practical concern.