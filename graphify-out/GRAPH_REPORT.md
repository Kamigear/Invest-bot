# Graph Report - .  (2026-08-03)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 153 nodes · 150 edges · 21 communities (12 shown, 9 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.62)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1e327277`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.html
- index.js
- package.json
- Plan: Date-Based Transaction System
- app.js
- Plan: Fix Bot State Balance Being Used as Saldo Awal
- Plan: Day-Specific Manual Income Entries
- Plan: Live "Actual follows Predicted" Balance Mode (Option A)
- graphify
- kilo.json
- Invest Bot
- investor.js
- AGENTS.md
- graphify.md
- bot_status.js
- CallMeBot API
- Real-time Data Synchronization
- Saldo Aktual (Actual Balance)
- Saldo Awal (Initial Balance)
- Manual Income Data Model

## God Nodes (most connected - your core abstractions)
1. `Plan: Live "Actual follows Predicted" Balance Mode (Option A)` - 8 edges
2. `Plan: Date-Based Transaction System` - 8 edges
3. `Plan: Day-Specific Manual Income Entries` - 7 edges
4. `runTask1()` - 6 edges
5. `graphify` - 6 edges
6. `Plan: Fix Bot State Balance Being Used as Saldo Awal` - 6 edges
7. `Tasks` - 6 edges
8. `Solution Implemented` - 6 edges
9. `start()` - 4 edges
10. `Changes` - 4 edges

## Surprising Connections (you probably didn't know these)
- `graphify workflow` --conceptually_related_to--> `graphify`  [INFERRED]
  .agents/workflows/graphify.md → .agents/rules/graphify.md
- `start()` --calls--> `sendAlert()`  [EXTRACTED]
  Board/index.js → Board/alert.js
- `runTask1()` --calls--> `serverTimestamp()`  [EXTRACTED]
  Board/index.js → Board/firebase.js
- `start()` --calls--> `runDailyJob()`  [EXTRACTED]
  Board/index.js → Board/executor.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Real-Time Finance Tracking Flow** — js_ui_dailylog, js_firebase, js_app [INFERRED 0.85]
- **Simulation Engine Core** — js_engine_calculator, js_engine_ledger, js_engine_optimizer, js_engine_simulator [EXTRACTED 0.90]
- **UI Presentation Layer** — js_ui_calendar, js_ui_detail, js_ui_summary, js_ui_comparison [EXTRACTED 0.90]

## Communities (21 total, 9 thin omitted)

### Community 0 - "index.html"
Cohesion: 0.09
Nodes (9): admin, db, Chart.js, Firebase SDK, Ledger, DetailUI, jsPDF, Plan: Real-Time Finance Tracker (+1 more)

### Community 1 - "index.js"
Cohesion: 0.15
Nodes (17): axios, sendAlert(), { db, runTransaction, serverTimestamp, getDoc, setDoc }, { executeInvest }, runDailyJob(), { sendAlert }, serverTimestamp(), cron (+9 more)

### Community 2 - "package.json"
Cohesion: 0.11
Nodes (17): axios, dependencies, axios, dotenv, firebase-admin, node-cron, puppeteer, description (+9 more)

### Community 3 - "Plan: Date-Based Transaction System"
Cohesion: 0.14
Nodes (13): 1. Simulator runs from initialBalance (unchanged), 2. Transactions are visual adjustments on specific days, 3. Added `Ledger.getStateAsOfDate(config, targetDate)` in `js/engine/ledger.js`, 4. Firebase Sync Button in `js/app.js`, 5. Removed old live mode injection logic, Affected Files, Goal, How It Works Now (+5 more)

### Community 4 - "app.js"
Cohesion: 0.17
Nodes (8): App, LiveMode, tryLogin(), Simulator, CalendarUI, Date-Based Transaction System Plan, Fix Bot State as Saldo Awal Plan, Live Predicted Balance Mode Plan

### Community 5 - "Plan: Fix Bot State Balance Being Used as Saldo Awal"
Cohesion: 0.17
Nodes (11): 1. Remove debug logging (cleanup from investigation), 2. Stop using Firebase bot state as Saldo Awal, 3. Stop auto-updating Saldo Awal on `onSnapshot` events, 4. Add explicit "Sync Saldo Awal from Bot" button (opt-in), 5. Fix LiveMode plan doc reference (informational), Architecture: Saldo Awal vs Saldo Aktual, Plan: Fix Bot State Balance Being Used as Saldo Awal, Problem (+3 more)

### Community 6 - "Plan: Day-Specific Manual Income Entries"
Cohesion: 0.18
Nodes (10): 1. `js/app.js` — Config & UI, 2. `js/engine/simulator.js` — Simulation Injection, 3. `js/app.js` — Results Display, Background, Changes, Data Model, Goal, Plan: Day-Specific Manual Income Entries (+2 more)

### Community 7 - "Plan: Live "Actual follows Predicted" Balance Mode (Option A)"
Cohesion: 0.22
Nodes (8): Data Flow, Goal, Key Decisions, Open Questions, Plan: Live "Actual follows Predicted" Balance Mode (Option A), Risks & Edge Cases, Tasks (ordered), Validation

### Community 8 - "graphify"
Cohesion: 0.25
Nodes (7): GRAPH_REPORT.md, graphify explain CLI, graphify-out directory, graphify query CLI, graphify skill, graphify workflow, graphify

### Community 9 - "kilo.json"
Cohesion: 0.40
Nodes (4): plugin, $schema, snapshot, file:///D:/Investation/.kilo/plugins/graphify.js

### Community 10 - "Invest Bot"
Cohesion: 0.50
Nodes (3): Architecture & Logic, Invest Bot, Setup di OrangePi

## Knowledge Gaps
- **84 isolated node(s):** `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot`, `axios`, `admin` (+79 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot` to the rest of the system?**
  _84 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.html` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Plan: Date-Based Transaction System` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._