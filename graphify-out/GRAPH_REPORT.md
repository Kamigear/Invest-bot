# Graph Report - Investation  (2026-08-03)

## Corpus Check
- 30 files · ~20,028 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 174 nodes · 200 edges · 16 communities (12 shown, 4 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `36be5796`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.html
- index.js
- Invest Bot
- package.json
- Plan: Real-Time Finance Tracker — Daily Income/Expense Panel
- Plan: Date-Based Transaction System
- kilo.json
- bot_status.js
- Plan: Fix Bot State Balance Being Used as Saldo Awal
- Plan: Day-Specific Manual Income Entries
- Plan: Live "Actual follows Predicted" Balance Mode (Option A)
- Implementation Tasks (Ordered)
- AGENTS.md
- graphify.md
- graphify.md

## God Nodes (most connected - your core abstractions)
1. `Plan: Real-Time Finance Tracker — Daily Income/Expense Panel` - 12 edges
2. `runDailyJob()` - 9 edges
3. `Plan: Live "Actual follows Predicted" Balance Mode (Option A)` - 8 edges
4. `Plan: Date-Based Transaction System` - 8 edges
5. `Plan: Day-Specific Manual Income Entries` - 7 edges
6. `File Changes` - 7 edges
7. `Implementation Tasks (Ordered)` - 7 edges
8. `runTask1()` - 6 edges
9. `Plan: Fix Bot State Balance Being Used as Saldo Awal` - 6 edges
10. `Tasks` - 6 edges

## Surprising Connections (you probably didn't know these)
- `setupPassword()` --references--> `FirebaseDB`  [EXTRACTED]
  js/app.js → js/firebase.js
- `syncToFirebase()` --references--> `FirebaseDB`  [EXTRACTED]
  js/app.js → js/firebase.js
- `runDailyJob()` --calls--> `sendAlert()`  [EXTRACTED]
  Board/executor.js → Board/alert.js
- `start()` --calls--> `sendAlert()`  [EXTRACTED]
  Board/index.js → Board/alert.js
- `runDailyJob()` --calls--> `getDoc()`  [EXTRACTED]
  Board/executor.js → Board/firebase.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Simulation Engine Core** — js_engine_calculator, js_engine_optimizer, js_engine_simulator, js_engine_ledger [EXTRACTED 1.00]

## Communities (16 total, 4 thin omitted)

### Community 0 - "index.html"
Cohesion: 0.09
Nodes (21): App, LiveMode, setupPassword(), syncFromFirebase(), syncToFirebase(), tryLogin(), Calculator, Ledger (+13 more)

### Community 1 - "index.js"
Cohesion: 0.13
Nodes (24): axios, sendAlert(), { db, runTransaction, serverTimestamp, getDoc, setDoc }, { executeInvest }, runDailyJob(), { sendAlert }, admin, db (+16 more)

### Community 2 - "Invest Bot"
Cohesion: 0.50
Nodes (3): Architecture & Logic, Invest Bot, Setup di OrangePi

### Community 3 - "package.json"
Cohesion: 0.11
Nodes (17): axios, dependencies, axios, dotenv, firebase-admin, node-cron, puppeteer, description (+9 more)

### Community 4 - "Plan: Real-Time Finance Tracker — Daily Income/Expense Panel"
Cohesion: 0.10
Nodes (20): 1. `index.html` — Remove auth overlay, add right panel structure, 1. Real-Time Transactions (Firestore: `users/{uid}/transactions/{id}`), 2. Categories (constant, local), 2. `css/style.css` — Layout & Daily Log Panel Styles, 3. `js/app.js` — Core Orchestration, 3. Simulation `manualIncome` (unchanged, localStorage), 4. `js/firebase.js` — Extended for Transactions, 5. `js/ui/dailyLog.js` — NEW FILE (+12 more)

### Community 5 - "Plan: Date-Based Transaction System"
Cohesion: 0.14
Nodes (13): 1. Simulator runs from initialBalance (unchanged), 2. Transactions are visual adjustments on specific days, 3. Added `Ledger.getStateAsOfDate(config, targetDate)` in `js/engine/ledger.js`, 4. Firebase Sync Button in `js/app.js`, 5. Removed old live mode injection logic, Affected Files, Goal, How It Works Now (+5 more)

### Community 6 - "kilo.json"
Cohesion: 0.40
Nodes (4): plugin, $schema, snapshot, file:///D:/Investation/.kilo/plugins/graphify.js

### Community 9 - "Plan: Fix Bot State Balance Being Used as Saldo Awal"
Cohesion: 0.17
Nodes (11): 1. Remove debug logging (cleanup from investigation), 2. Stop using Firebase bot state as Saldo Awal, 3. Stop auto-updating Saldo Awal on `onSnapshot` events, 4. Add explicit "Sync Saldo Awal from Bot" button (opt-in), 5. Fix LiveMode plan doc reference (informational), Architecture: Saldo Awal vs Saldo Aktual, Plan: Fix Bot State Balance Being Used as Saldo Awal, Problem (+3 more)

### Community 10 - "Plan: Day-Specific Manual Income Entries"
Cohesion: 0.18
Nodes (10): 1. `js/app.js` — Config & UI, 2. `js/engine/simulator.js` — Simulation Injection, 3. `js/app.js` — Results Display, Background, Changes, Data Model, Goal, Plan: Day-Specific Manual Income Entries (+2 more)

### Community 11 - "Plan: Live "Actual follows Predicted" Balance Mode (Option A)"
Cohesion: 0.22
Nodes (8): Data Flow, Goal, Key Decisions, Open Questions, Plan: Live "Actual follows Predicted" Balance Mode (Option A), Risks & Edge Cases, Tasks (ordered), Validation

### Community 12 - "Implementation Tasks (Ordered)"
Cohesion: 0.29
Nodes (7): Implementation Tasks (Ordered), Phase 1: Remove Auth & Restructure Sidebar, Phase 2: Firebase Anonymous Auth & Transactions Collection, Phase 3: DailyLog Module & Panel UI, Phase 4: Wire DailyLog into App, Phase 5: Settings Panel Cleanup, Phase 6: Polish & Validation

## Knowledge Gaps
- **101 isolated node(s):** `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot`, `axios`, `{ db, runTransaction, serverTimestamp, getDoc, setDoc }` (+96 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Plan: Real-Time Finance Tracker — Daily Income/Expense Panel` connect `Plan: Real-Time Finance Tracker — Daily Income/Expense Panel` to `Implementation Tasks (Ordered)`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `Implementation Tasks (Ordered)` connect `Implementation Tasks (Ordered)` to `Plan: Real-Time Finance Tracker — Daily Income/Expense Panel`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot` to the rest of the system?**
  _101 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.html` be split into smaller, more focused modules?**
  _Cohesion score 0.08522727272727272 - nodes in this community are weakly interconnected._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12873563218390804 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Plan: Real-Time Finance Tracker — Daily Income/Expense Panel` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._