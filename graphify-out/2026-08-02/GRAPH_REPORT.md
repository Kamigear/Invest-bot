# Graph Report - Investation  (2026-08-02)

## Corpus Check
- 28 files · ~17,260 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 148 nodes · 156 edges · 25 communities (12 shown, 13 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.54)
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
- ledger.js
- optimizer.js
- simulator.js
- bot_status.js
- calendar.js
- comparison.js
- detail.js
- summary.js

## God Nodes (most connected - your core abstractions)
1. `runDailyJob()` - 9 edges
2. `Plan: Live "Actual follows Predicted" Balance Mode (Option A)` - 8 edges
3. `Plan: Enhance Ledger Realtime Integration + Income/Outcome Tabs + Export` - 8 edges
4. `Live Mode` - 7 edges
5. `runTask1()` - 6 edges
6. `graphify` - 6 edges
7. `Plan: Fix Bot State Balance Being Used as Saldo Awal` - 6 edges
8. `Tasks` - 6 edges
9. `Tasks (Ordered)` - 6 edges
10. `sendAlert()` - 5 edges

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
- **Firebase Data Sync** — js_firebase, board_index, firebase_firestore [INFERRED 0.80]
- **Simulation Engine Core** — js_engine_calculator, js_engine_ledger, js_engine_optimizer, js_engine_simulator [EXTRACTED 1.00]
- **UI Presentation Layer** — js_ui_calendar, js_ui_detail, js_ui_summary, js_ui_comparison [EXTRACTED 1.00]

## Communities (25 total, 13 thin omitted)

### Community 0 - "Live Predicted Balance"
Cohesion: 0.36
Nodes (8): Actual Balance, Bot Balance Scrape, Firestore botState, graphify update, Live Mode, localStorage persistence, Predicted Balance, Simulation Engine

### Community 1 - "Graphify Config"
Cohesion: 0.25
Nodes (7): GRAPH_REPORT.md, graphify explain CLI, graphify-out directory, graphify query CLI, graphify skill, graphify workflow, graphify

### Community 2 - "Board Package Config"
Cohesion: 0.17
Nodes (11): 1. Remove debug logging (cleanup from investigation), 2. Stop using Firebase bot state as Saldo Awal, 3. Stop auto-updating Saldo Awal on `onSnapshot` events, 4. Add explicit "Sync Saldo Awal from Bot" button (opt-in), 5. Fix LiveMode plan doc reference (informational), Architecture: Saldo Awal vs Saldo Aktual, Plan: Fix Bot State Balance Being Used as Saldo Awal, Problem (+3 more)

### Community 3 - "Axios Dependency"
Cohesion: 0.11
Nodes (17): axios, dependencies, axios, dotenv, firebase-admin, node-cron, puppeteer, description (+9 more)

### Community 4 - "Dotenv Dependency"
Cohesion: 0.13
Nodes (24): axios, sendAlert(), { db, runTransaction, serverTimestamp, getDoc, setDoc }, { executeInvest }, runDailyJob(), { sendAlert }, admin, db (+16 more)

### Community 5 - "Plan: Enhance Ledger Realtime Integration + Income/Outcome Tabs + Export"
Cohesion: 0.14
Nodes (13): Affected Files, Data Flow (After), Goal, Out of Scope (v2), Phase 1: Core Simulation Integration, Phase 2: Income/Outcome Tabs, Phase 3: Export/Import (Sustainability), Phase 4: CSS (+5 more)

### Community 6 - "Node Cron"
Cohesion: 0.22
Nodes (8): Data Flow, Goal, Key Decisions, Open Questions, Plan: Live "Actual follows Predicted" Balance Mode (Option A), Risks & Edge Cases, Tasks (ordered), Validation

### Community 7 - "Puppeteer"
Cohesion: 0.31
Nodes (7): App, LiveMode, NOTE: Bot balance (botState/balance) is Saldo Aktual — it must NOT overwrite Sal, setupPassword(), syncToFirebase(), tryLogin(), FirebaseDB

### Community 10 - "Board README"
Cohesion: 0.50
Nodes (3): Architecture & Logic, Invest Bot, Setup di OrangePi

### Community 12 - "kilo.json"
Cohesion: 0.40
Nodes (4): plugin, $schema, snapshot, file:///D:/Investation/.kilo/plugins/graphify.js

### Community 13 - "exporters.js"
Cohesion: 0.50
Nodes (3): ExportCSV, ExportExcel, ExportPDF

## Knowledge Gaps
- **78 isolated node(s):** `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot`, `axios`, `{ db, runTransaction, serverTimestamp, getDoc, setDoc }` (+73 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot` to the rest of the system?**
  _78 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Axios Dependency` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Dotenv Dependency` be split into smaller, more focused modules?**
  _Cohesion score 0.12873563218390804 - nodes in this community are weakly interconnected._
- **Should `Plan: Enhance Ledger Realtime Integration + Income/Outcome Tabs + Export` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._