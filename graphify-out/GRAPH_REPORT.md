# Graph Report - Investation  (2026-08-04)

## Corpus Check
- 32 files · ~21,191 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 211 nodes · 239 edges · 29 communities (16 shown, 13 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d0b7c002`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- logger.js
- package.json
- executor.js
- app.js
- index.js
- graphify Rules
- calculator.js
- kilo.json
- exporters.js
- ledger.js
- bot_status.js
- calendar.js
- comparison.js
- detail.js
- AGENTS.md
- Live Mode
- Real-Time Finance Tracker
- Plan: Date-Based Transaction System
- Plan: Real-Time Finance Tracker
- Plan: Fix Bot State Balance
- Plan: Live Predicted Balance Mode
- Plan: Day-Specific Manual Income Entries
- Plan: Day-Specific Manual Income Entries
- Plan: Live "Actual follows Predicted" Balance Mode (Option A)
- File Changes
- AGENTS.md
- graphify.md
- graphify.md

## God Nodes (most connected - your core abstractions)
1. `Plan: Real-Time Finance Tracker — Daily Income/Expense Panel` - 12 edges
2. `graphify Rules` - 10 edges
3. `runDailyJob()` - 9 edges
4. `Plan: Live "Actual follows Predicted" Balance Mode (Option A)` - 8 edges
5. `Plan: Date-Based Transaction System` - 8 edges
6. `sendAlert()` - 7 edges
7. `Logger` - 7 edges
8. `Plan: Day-Specific Manual Income Entries` - 7 edges
9. `File Changes` - 7 edges
10. `Implementation Tasks (Ordered)` - 7 edges

## Surprising Connections (you probably didn't know these)
- `graphify Rules` --references--> `graphify-out/graph.json`  [EXTRACTED]
  .agents/rules/graphify.md → graphify-out/graph.json
- `graphify Rules` --references--> `graphify-out/GRAPH_REPORT.md`  [EXTRACTED]
  .agents/rules/graphify.md → graphify-out/GRAPH_REPORT.md
- `graphify Workflow` --conceptually_related_to--> `graphify Rules`  [INFERRED]
  .agents/workflows/graphify.md → .agents/rules/graphify.md
- `runDailyJob()` --calls--> `sendAlert()`  [EXTRACTED]
  Board/executor.js → Board/alert.js
- `runDailyJob()` --calls--> `serverTimestamp()`  [EXTRACTED]
  Board/executor.js → Board/firebase.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **graphify Tooling Suite** — _agents_rules_graphify_graphify_query, _agents_rules_graphify_query_graph, _agents_rules_graphify_graphify_path, _agents_rules_graphify_shortest_path, _agents_rules_graphify_graphify_explain, _agents_rules_graphify_get_node, _agents_rules_graphify_graphify_update [EXTRACTED 1.00]
- **Simulation Engine Core** — js_engine_calculator, js_engine_optimizer, js_engine_simulator, js_engine_ledger [EXTRACTED 0.95]

## Communities (29 total, 13 thin omitted)

### Community 0 - "logger.js"
Cohesion: 0.31
Nodes (8): COLORS, formatLine(), formatMeta(), getHostname(), getTimestamp(), LEVEL_ICONS, LOG_LEVELS, os

### Community 1 - "package.json"
Cohesion: 0.11
Nodes (17): axios, dependencies, axios, dotenv, firebase-admin, node-cron, puppeteer, description (+9 more)

### Community 2 - "executor.js"
Cohesion: 0.17
Nodes (14): { db, runTransaction, serverTimestamp, getDoc, setDoc }, { executeInvest }, { Logger }, runDailyJob(), { sendAlert }, admin, db, getDoc() (+6 more)

### Community 3 - "app.js"
Cohesion: 0.17
Nodes (11): Architecture & Logic, Invest Bot, Setup di OrangePi, App, LiveMode, setupPassword(), syncFromFirebase(), syncToFirebase() (+3 more)

### Community 4 - "index.js"
Cohesion: 0.12
Nodes (24): axios, https, httpsAgent, { Logger }, sendAlert(), stripEmoji(), claimDailyReward(), { Logger } (+16 more)

### Community 5 - "graphify Rules"
Cohesion: 0.18
Nodes (11): get_node, graphify Rules, graphify explain, graphify path, graphify query, graphify update, query_graph, shortest_path (+3 more)

### Community 6 - "calculator.js"
Cohesion: 0.40
Nodes (3): Calculator, Optimizer, Simulator

### Community 7 - "kilo.json"
Cohesion: 0.40
Nodes (4): plugin, $schema, snapshot, file:///D:/Investation/.kilo/plugins/graphify.js

### Community 8 - "exporters.js"
Cohesion: 0.50
Nodes (3): ExportCSV, ExportExcel, ExportPDF

### Community 15 - "AGENTS.md"
Cohesion: 0.10
Nodes (20): 1. `index.html` — Remove auth overlay, add right panel structure, 1. Real-Time Transactions (Firestore: `users/{uid}/transactions/{id}`), 2. Categories (constant, local), 2. `css/style.css` — Layout & Daily Log Panel Styles, 3. `js/app.js` — Core Orchestration, 3. Simulation `manualIncome` (unchanged, localStorage), 4. `js/firebase.js` — Extended for Transactions, 5. `js/ui/dailyLog.js` — NEW FILE (+12 more)

### Community 18 - "Plan: Date-Based Transaction System"
Cohesion: 0.14
Nodes (13): 1. Simulator runs from initialBalance (unchanged), 2. Transactions are visual adjustments on specific days, 3. Added `Ledger.getStateAsOfDate(config, targetDate)` in `js/engine/ledger.js`, 4. Firebase Sync Button in `js/app.js`, 5. Removed old live mode injection logic, Affected Files, Goal, How It Works Now (+5 more)

### Community 22 - "Plan: Day-Specific Manual Income Entries"
Cohesion: 0.17
Nodes (11): 1. Remove debug logging (cleanup from investigation), 2. Stop using Firebase bot state as Saldo Awal, 3. Stop auto-updating Saldo Awal on `onSnapshot` events, 4. Add explicit "Sync Saldo Awal from Bot" button (opt-in), 5. Fix LiveMode plan doc reference (informational), Architecture: Saldo Awal vs Saldo Aktual, Plan: Fix Bot State Balance Being Used as Saldo Awal, Problem (+3 more)

### Community 23 - "Plan: Day-Specific Manual Income Entries"
Cohesion: 0.18
Nodes (10): 1. `js/app.js` — Config & UI, 2. `js/engine/simulator.js` — Simulation Injection, 3. `js/app.js` — Results Display, Background, Changes, Data Model, Goal, Plan: Day-Specific Manual Income Entries (+2 more)

### Community 24 - "Plan: Live "Actual follows Predicted" Balance Mode (Option A)"
Cohesion: 0.22
Nodes (8): Data Flow, Goal, Key Decisions, Open Questions, Plan: Live "Actual follows Predicted" Balance Mode (Option A), Risks & Edge Cases, Tasks (ordered), Validation

### Community 25 - "File Changes"
Cohesion: 0.29
Nodes (7): Implementation Tasks (Ordered), Phase 1: Remove Auth & Restructure Sidebar, Phase 2: Firebase Anonymous Auth & Transactions Collection, Phase 3: DailyLog Module & Panel UI, Phase 4: Wire DailyLog into App, Phase 5: Settings Panel Cleanup, Phase 6: Polish & Validation

## Knowledge Gaps
- **129 isolated node(s):** `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot`, `axios`, `https` (+124 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Plan: Real-Time Finance Tracker — Daily Income/Expense Panel` connect `AGENTS.md` to `File Changes`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot` to the rest of the system?**
  _129 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11965811965811966 - nodes in this community are weakly interconnected._
- **Should `AGENTS.md` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `Plan: Date-Based Transaction System` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._