# Plan: Real-Time Finance Tracker — Daily Income/Expense Panel

## Goal
Transform InvestCalc from a simulation/prediction tool into a **real-time finance tracker** with:
- No auth overlay (single user, load directly)
- Stacked left sidebar: **Settings (top)** + **Daily Log (bottom)**
- Real-time income/expense entries with categories, synced to Firebase
- Completely separate from 90-day simulation (which keeps `manualIncome` for day-based prediction)

---

## Key Decisions (Resolved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth | **None** — remove password overlay entirely | Single user, no barrier |
| Sidebar Layout | **Stacked left** — Settings panel + Daily Log panel | Keeps familiar layout, both accessible |
| Transaction Model | **Structured** — `{ id, date, type, amount, note, category, createdAt }` | Categories enable filtering/reports |
| Sync | **Full Firebase (Firestore)** — auto-sync on every change | Cross-device, real-time persistence |
| Simulation Integration | **Completely separate** — simulation uses `manualIncome` (day-based); real-time uses date-based transactions | Clean separation of concerns |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        index.html                                │
├─────────────────────────────────────────────────────────────────┤
│  LEFT SIDEBAR (280px)          │  MAIN CONTENT                  │
│  ┌─────────────────────────┐   │  ┌─────────────────────────┐  │
│  │ SETTINGS PANEL          │   │  │ Calendar / Summary /    │  │
│  │ (was config-panel)      │   │  │ What If / Bot Status    │  │
│  │ - Simulation params     │   │  │ (simulation results)    │  │
│  │ - Algorithm config      │   │  └─────────────────────────┘  │
│  │ - Live Mode toggle      │   │                                │
│  └─────────────────────────┘   │                                │
│  ┌─────────────────────────┐   │                                │
│  │ DAILY LOG PANEL         │   │                                │
│  │ (NEW: DailyTransactions)│   │                                │
│  │ - Quick add income/exp  │   │                                │
│  │ - List with filters     │   │                                │
│  │ - Category chips        │   │                                │
│  │ - Monthly summary       │   │                                │
│  └─────────────────────────┘   │                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### 1. Real-Time Transactions (Firestore: `users/{uid}/transactions/{id}`)
```js
{
  id: "txn_abc123",           // auto-generated
  date: "2026-08-03",         // ISO date (real calendar date)
  type: "income",             // "income" | "expense"
  amount: 50000,              // positive number
  note: "Gaji bulan Agustus", // optional
  category: "gaji",           // "gaji" | "bonus" | "makan" | "transport" | "lainnya"
  createdAt: Timestamp,       // server timestamp
  updatedAt: Timestamp        // server timestamp
}
```

### 2. Categories (constant, local)
```js
const TRANSACTION_CATEGORIES = {
  income: [
    { id: 'gaji', label: '💰 Gaji', color: '#10b981' },
    { id: 'bonus', label: '🎁 Bonus', color: '#f59e0b' },
    { id: 'investasi', label: '📈 Investasi', color: '#8b5cf6' },
    { id: 'lainnya', label: '📦 Lainnya', color: '#64748b' }
  ],
  expense: [
    { id: 'makan', label: '🍽️ Makan', color: '#ef4444' },
    { id: 'transport', label: '🚌 Transport', color: '#f97316' },
    { id: 'belanja', label: '🛍️ Belanja', color: '#ec4899' },
    { id: 'tagihan', label: '📄 Tagihan', color: '#dc2626' },
    { id: 'lainnya', label: '📦 Lainnya', color: '#64748b' }
  ]
};
```

### 3. Simulation `manualIncome` (unchanged, localStorage)
```js
// Kept for prediction/simulation only
manualIncome: [
  { day: 4, amount: 100, note: "Bonus hari ke-4" }
]
```

---

## File Changes

### 1. `index.html` — Remove auth overlay, add right panel structure
- **Remove**: `#auth-overlay` (lines 39-49)
- **Modify**: `.app-shell` to support three-column layout (left sidebar | main | right sidebar for daily log)  
  *Actually: user chose stacked left sidebar, so keep two-column but sidebar has two stacked panels*

### 2. `css/style.css` — Layout & Daily Log Panel Styles
- Update `.app-shell` for stacked sidebar panels
- Add `.daily-log-panel` styles
- Add transaction entry form styles
- Add category chip styles
- Add filter bar styles
- Add monthly summary card styles

### 3. `js/app.js` — Core Orchestration
**Remove:**
- `auth-overlay` logic (lines 893-958)
- `tryLogin()`, `setupPassword()`, `SESSION_KEY`
- Auto-show overlay on load

**Add:**
- `DailyLog` module (IIFE) for transaction management
- Firebase sync for transactions (`onSnapshot` listener)
- `init()` loads config → starts DailyLog listener → renders both panels

**Modify:**
- `renderConfigPanel()` → only simulation settings (no manual income section)
- Move manual income to Daily Log panel? **No** — keep separate per decision

### 4. `js/firebase.js` — Extended for Transactions
**Add:**
- `subscribeTransactions(callback)` — real-time listener on `users/{uid}/transactions`
- `addTransaction(data)` — `addDoc` with serverTimestamp
- `updateTransaction(id, data)` — `updateDoc`
- `deleteTransaction(id)` — `deleteDoc`
- Anonymous auth fallback: `signInAnonymously()` on init

### 5. `js/ui/dailyLog.js` — NEW FILE
**Daily Log Panel UI Module:**
- `init(container, callbacks)` — render panel into sidebar
- `render(transactions)` — list with date grouping
- `renderQuickAddForm()` — type selector, amount, note, category chips
- `renderFilters()` — month picker, type filter, category filter
- `renderMonthlySummary()` — income/expense/net totals
- Event bindings for add/edit/delete

### 6. `js/engine/simulator.js` — UNCHANGED
- Keeps `manualIncome` injection at Step 1.5
- No changes needed (real-time transactions don't feed simulation)

---

## Implementation Tasks (Ordered)

### Phase 1: Remove Auth & Restructure Sidebar
- [ ] 1.1 Remove `#auth-overlay` from `index.html`
- [ ] 1.2 Remove auth logic from `js/app.js` (lines 893-958)
- [ ] 1.3 Update `js/app.js::init()` to load config directly, no auth gate
- [ ] 1.4 Update CSS: `.app-shell` → stacked sidebar panels (`.config-panel` + `.daily-log-panel`)
- [ ] 1.5 Test: Page loads directly to simulation + empty daily log

### Phase 2: Firebase Anonymous Auth & Transactions Collection
- [ ] 2.1 `js/firebase.js`: Add `initAnonymousAuth()` → `signInAnonymously()`
- [ ] 2.2 `js/firebase.js`: Add `subscribeTransactions(uid, callback)` with `onSnapshot`
- [ ] 2.3 `js/firebase.js`: Add `addTransaction(uid, data)`, `updateTransaction`, `deleteTransaction`
- [ ] 2.4 Firestore rules: allow read/write on `users/{uid}/transactions` for authenticated users
- [ ] 2.5 Test: Anonymous user can write/read transactions in console

### Phase 3: DailyLog Module & Panel UI
- [ ] 3.1 Create `js/ui/dailyLog.js` with `DailyLog` IIFE
- [ ] 3.2 `DailyLog.init(container, { onAdd, onEdit, onDelete, onFilterChange })`
- [ ] 3.3 Quick-add form: type toggle (income/expense), amount input, note, category chips
- [ ] 3.4 Transaction list: grouped by date (newest first), show type badge, category, amount, note
- [ ] 3.5 Inline edit: click entry → form pre-fills → save/delete
- [ ] 3.6 Filter bar: month select, type filter (all/income/expense), category multi-select
- [ ] 3.7 Monthly summary cards: Total Income, Total Expense, Net Flow
- [ ] 3.8 CSS styles for all above (category chips, badges, date groups, summary cards)

### Phase 4: Wire DailyLog into App
- [ ] 4.1 `js/app.js`: Import `DailyLog` (script tag in index.html)
- [ ] 4.2 `App.init()`: after `loadConfig()`, call `DailyLog.init(sidebarBottom, callbacks)`
- [ ] 4.3 Callbacks:
  - `onAdd`: `FirebaseDB.addTransaction(uid, data)` → local optimistic update
  - `onEdit`: `FirebaseDB.updateTransaction(uid, id, data)`
  - `onDelete`: `FirebaseDB.deleteTransaction(uid, id)`
  - `onFilterChange`: re-render list
- [ ] 4.4 `FirebaseDB.subscribeTransactions(uid, (txns) => DailyLog.render(txns))`
- [ ] 4.5 Handle loading/error/empty states

### Phase 5: Settings Panel Cleanup
- [ ] 5.1 `js/app.js::renderConfigPanel()`: Remove "Income Harian Tambahan (Manual)" section (lines 267-285)
- [ ] 5.2 Keep `manualIncome` in `DEFAULT_CONFIG` and `readConfig()` for simulation use
- [ ] 5.3 Rename panel title: "⚙️ Pengaturan Simulasi" (was "Configuration")

### Phase 6: Polish & Validation
- [ ] 6.1 Empty state: "Belum ada catatan hari ini. Tambah pemasukan/pengeluaran pertama!"
- [ ] 6.2 Keyboard shortcuts: `Enter` to submit quick-add, `Escape` to cancel edit
- [ ] 6.3 Number formatting: `Calculator.display()` for amounts
- [ ] 6.4 Date formatting: Indonesian locale (`dd MMM yyyy`)
- [ ] 6.5 Responsive: mobile stacks panels vertically
- [ ] 6.6 `graphify update .` after all edits
- [ ] 6.7 Manual validation checklist (see below)

---

## Validation Checklist

| # | Test | Expected |
|---|------|----------|
| 1 | Open `index.html` | Loads directly, no auth overlay |
| 2 | Left sidebar shows | Top: Settings (simulation params), Bottom: Daily Log |
| 3 | Daily Log: Click "Pemasukan", enter 100000, "Gaji", category "gaji" | Entry appears in list, synced to Firestore |
| 4 | Daily Log: Click "Pengeluaran", enter 25000, "Makan siang", category "makan" | Entry appears with red badge |
| 5 | Reload page | Both entries persist (Firebase sync) |
| 6 | Edit an entry (click → change amount → save) | Updates in Firestore, UI reflects |
| 7 | Delete an entry | Removed from Firestore, UI updates |
| 8 | Filter by month/type/category | List filters correctly |
| 9 | Monthly summary shows | Income/Expense/Net totals correct |
| 10 | Run simulation (90 days) | Works unchanged, uses `manualIncome` from config |
| 11 | Simulation results don't show real-time transactions | Separate as designed |
| 12 | Open in second browser (same Firebase project) | Transactions sync in real-time |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Firestore quota exceeded (free tier: 50k reads/day) | Transactions are lightweight; anonymous auth creates one user doc; batch writes not needed |
| Offline support | Firestore SDK caches automatically; writes queue when offline |
| No user account recovery | Acceptable — single user, anonymous auth persists in browser |
| Mobile sidebar too narrow | CSS: `@media (max-width: 680px)` stacks panels, full-width inputs |
| Category list grows | Keep fixed set; "Lainnya" catches rest |

---

## Future Enhancements (Out of Scope)
- Export transactions to CSV/Excel
- Recurring transactions (monthly gaji, weekly transport)
- Budget vs actual per category
- Charts in Daily Log panel (spending trends)
- Multi-user with proper Firebase Auth
- Sync simulation `manualIncome` from real transactions (one-way import)

---

## File Summary

| File | Change Type |
|------|-------------|
| `index.html` | Remove auth overlay |
| `css/style.css` | Add daily log panel styles |
| `js/app.js` | Remove auth, wire DailyLog, cleanup config panel |
| `js/firebase.js` | Add anonymous auth + transaction CRUD + listener |
| `js/ui/dailyLog.js` | **NEW** — Daily Log UI module |
| `js/engine/simulator.js` | **UNCHANGED** |

---

## Graphify Update
After implementation, run:
```bash
graphify update .
```
Expected: graph updated with new `DailyLog` module, `firebase.js` transaction edges, removed auth nodes.