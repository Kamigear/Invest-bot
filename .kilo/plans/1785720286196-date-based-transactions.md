# Plan: Date-Based Transaction System

## Status: IMPLEMENTED

## Goal
Allow transactions to only affect their specific date during simulation, keeping Saldo Awal unchanged for all days.

## Problem
Original system used aggregated ledger balance as starting point for ALL simulation days, causing transactions to affect every day from the start.

## Solution Implemented

### 1. Simulator runs from initialBalance (unchanged)
- Simulation starts from `config.initialBalance` for ALL days
- Algorithm projection (income, bonus, generate, invest) runs normally
- Transactions do NOT feed into the algorithm's projection

### 2. Transactions are visual adjustments on specific days
- When you add an expense/income on a specific date, it only adjusts that day's displayed balance
- Future days continue following the algorithm's prediction from the unadjusted balance
- Saldo Awal stays the same for all days

### 3. Added `Ledger.getStateAsOfDate(config, targetDate)` in `js/engine/ledger.js`
- Filters transactions on or before `targetDate`
- Available for future use (e.g., displaying balance as of a specific date)

### 4. Firebase Sync Button in `js/app.js`
- Added "🔄 Sync Firebase" button in config panel
- Pulls bot balance from Firestore `botState/balance`
- Creates adjustment transaction for today only

### 5. Removed old live mode injection logic
- Removed `actualDay`/`actualBalance` from `buildRuntimeConfig()` in `js/app.js`
- Removed `simStartingBalance` and actualDay logic from `simulator.js`

## How It Works Now

Example: Saldo Awal = 520, add expense -100 on hari ke-3

| Hari | Balance | Notes |
|------|---------|-------|
| Hari 1 | 520 | Algorithm projection from initialBalance |
| Hari 2 | 520 | Algorithm projection from initialBalance |
| Hari 3 | 420 | Visual adjustment: 520 - 100 |
| Hari 4+ | Algorithm projection from 520 | Not affected by hari ke-3 expense |

## Affected Files
- `js/engine/simulator.js` — Runs from initialBalance, transactions are visual adjustments only
- `js/engine/ledger.js` — Added `getStateAsOfDate()` method (available for future use)
- `js/app.js` — Added Firebase sync button, removed old live mode injection

## Validation
1. Saldo Awal stays the same for all simulation days
2. Transactions only adjust the specific day they're added to
3. Future days follow algorithm prediction (not affected by transactions)
4. Firebase sync creates adjustment transaction for today only
5. Existing functionality preserved (export/import, income/outcome tabs, etc.)