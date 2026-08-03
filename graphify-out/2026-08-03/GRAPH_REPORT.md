# Graph Report - Investation  (2026-08-03)

## Corpus Check
- 30 files · ~19,148 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 185 nodes · 188 edges · 29 communities (14 shown, 15 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.6)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `66cfcd59`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Live Predicted Balance
- Graphify Config
- Board Package Config
- Axios Dependency
- Dotenv Dependency
- Plan: Enhance Ledger Realtime Integration + Income/Outcome Tabs + Export
- Node Cron
- Puppeteer
- Firebase Firestore
- Agents
- Board README
- CallMeBot API
- kilo.json
- exporters.js
- graphify.md
- calculator.js
- Saldo Aktual (Actual Balance)
- optimizer.js
- simulator.js
- calendar.js
- comparison.js
- detail.js
- summary.js
- Manual Income Data Model
- Plan: Real-Time Finance Tracker — Daily Income/Expense Panel
- Implementation Tasks (Ordered)
- dailyLog.js
- ledger.js

## God Nodes (most connected - your core abstractions)
1. `Plan: Real-Time Finance Tracker — Daily Income/Expense Panel` - 12 edges
2. `runDailyJob()` - 9 edges
3. `Plan: Live "Actual follows Predicted" Balance Mode (Option A)` - 8 edges
4. `Plan: Date-Based Transaction System` - 8 edges
5. `Plan: Day-Specific Manual Income Entries` - 7 edges
6. `File Changes` - 7 edges
7. `Implementation Tasks (Ordered)` - 7 edges
8. `runTask1()` - 6 edges
9. `graphify` - 6 edges
10. `Plan: Fix Bot State Balance Being Used as Saldo Awal` - 6 edges

## Surprising Connections (you probably didn't know these)
- `graphify workflow` --conceptually_related_to--> `graphify`  [INFERRED]
  .agents/workflows/graphify.md → .agents/rules/graphify.md
- `runDailyJob()` --calls--> `sendAlert()`  [EXTRACTED]
  Board/executor.js → Board/alert.js
- `start()` --calls--> `sendAlert()`  [EXTRACTED]
  Board/index.js → Board/alert.js
- `runDailyJob()` --calls--> `getDoc()`  [EXTRACTED]
  Board/executor.js → Board/firebase.js
- `runDailyJob()` --calls--> `runTransaction()`  [EXTRACTED]
  Board/executor.js → Board/firebase.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Simulation Engine Core** — js_engine_calculator, js_engine_optimizer, js_engine_simulator [EXTRACTED 1.00]

## Communities (29 total, 15 thin omitted)

### Community 0 - "Live Predicted Balance"
Cohesion: 0.13
Nodes (24): axios, sendAlert(), { db, runTransaction, serverTimestamp, getDoc, setDoc }, { executeInvest }, runDailyJob(), { sendAlert }, admin, db (+16 more)

### Community 1 - "Graphify Config"
Cohesion: 0.11
Nodes (17): axios, dependencies, axios, dotenv, firebase-admin, node-cron, puppeteer, description (+9 more)

### Community 2 - "Board Package Config"
Cohesion: 0.10
Nodes (20): 1. `index.html` — Remove auth overlay, add right panel structure, 1. Real-Time Transactions (Firestore: `users/{uid}/transactions/{id}`), 2. Categories (constant, local), 2. `css/style.css` — Layout & Daily Log Panel Styles, 3. `js/app.js` — Core Orchestration, 3. Simulation `manualIncome` (unchanged, localStorage), 4. `js/firebase.js` — Extended for Transactions, 5. `js/ui/dailyLog.js` — NEW FILE (+12 more)

### Community 3 - "Axios Dependency"
Cohesion: 0.14
Nodes (13): 1. Simulator runs from initialBalance (unchanged), 2. Transactions are visual adjustments on specific days, 3. Added `Ledger.getStateAsOfDate(config, targetDate)` in `js/engine/ledger.js`, 4. Firebase Sync Button in `js/app.js`, 5. Removed old live mode injection logic, Affected Files, Goal, How It Works Now (+5 more)

### Community 4 - "Dotenv Dependency"
Cohesion: 0.21
Nodes (10): Real-time Data Synchronization, App, LiveMode, setupPassword(), syncToFirebase(), tryLogin(), FirebaseDB, Fix Bot State as Saldo Awal Plan (+2 more)

### Community 5 - "Plan: Enhance Ledger Realtime Integration + Income/Outcome Tabs + Export"
Cohesion: 0.17
Nodes (11): 1. Remove debug logging (cleanup from investigation), 2. Stop using Firebase bot state as Saldo Awal, 3. Stop auto-updating Saldo Awal on `onSnapshot` events, 4. Add explicit "Sync Saldo Awal from Bot" button (opt-in), 5. Fix LiveMode plan doc reference (informational), Architecture: Saldo Awal vs Saldo Aktual, Plan: Fix Bot State Balance Being Used as Saldo Awal, Problem (+3 more)

### Community 6 - "Node Cron"
Cohesion: 0.18
Nodes (10): 1. `js/app.js` — Config & UI, 2. `js/engine/simulator.js` — Simulation Injection, 3. `js/app.js` — Results Display, Background, Changes, Data Model, Goal, Plan: Day-Specific Manual Income Entries (+2 more)

### Community 7 - "Puppeteer"
Cohesion: 0.22
Nodes (8): Data Flow, Goal, Key Decisions, Open Questions, Plan: Live "Actual follows Predicted" Balance Mode (Option A), Risks & Edge Cases, Tasks (ordered), Validation

### Community 8 - "Firebase Firestore"
Cohesion: 0.25
Nodes (7): GRAPH_REPORT.md, graphify explain CLI, graphify-out directory, graphify query CLI, graphify skill, graphify workflow, graphify

### Community 9 - "Agents"
Cohesion: 0.40
Nodes (4): plugin, $schema, snapshot, file:///D:/Investation/.kilo/plugins/graphify.js

### Community 10 - "Board README"
Cohesion: 0.50
Nodes (3): Architecture & Logic, Invest Bot, Setup di OrangePi

### Community 11 - "CallMeBot API"
Cohesion: 0.50
Nodes (3): ExportCSV, ExportExcel, ExportPDF

### Community 27 - "dailyLog.js"
Cohesion: 0.29
Nodes (7): Implementation Tasks (Ordered), Phase 1: Remove Auth & Restructure Sidebar, Phase 2: Firebase Anonymous Auth & Transactions Collection, Phase 3: DailyLog Module & Panel UI, Phase 4: Wire DailyLog into App, Phase 5: Settings Panel Cleanup, Phase 6: Polish & Validation

## Knowledge Gaps
- **111 isolated node(s):** `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot`, `axios`, `{ db, runTransaction, serverTimestamp, getDoc, setDoc }` (+106 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Plan: Real-Time Finance Tracker — Daily Income/Expense Panel` connect `Board Package Config` to `dailyLog.js`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `Implementation Tasks (Ordered)` connect `dailyLog.js` to `Board Package Config`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot` to the rest of the system?**
  _111 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Live Predicted Balance` be split into smaller, more focused modules?**
  _Cohesion score 0.12873563218390804 - nodes in this community are weakly interconnected._
- **Should `Graphify Config` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Board Package Config` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `Axios Dependency` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._