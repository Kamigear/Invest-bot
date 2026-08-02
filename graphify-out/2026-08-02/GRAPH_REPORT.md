# Graph Report - Investation  (2026-08-02)

## Corpus Check
- 26 files · ~14,820 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 121 nodes · 131 edges · 25 communities (12 shown, 13 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `097dc7f6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Live Predicted Balance
- Graphify Config
- Board Package Config
- Axios Dependency
- Dotenv Dependency
- Firebase Admin
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
3. `Live Mode` - 7 edges
4. `runTask1()` - 6 edges
5. `graphify` - 6 edges
6. `sendAlert()` - 5 edges
7. `serverTimestamp()` - 5 edges
8. `start()` - 4 edges
9. `FirebaseDB` - 4 edges
10. `db` - 3 edges

## Surprising Connections (you probably didn't know these)
- `graphify workflow` --conceptually_related_to--> `graphify`  [INFERRED]
  .agents/workflows/graphify.md → .agents/rules/graphify.md
- `runTask1()` --calls--> `serverTimestamp()`  [EXTRACTED]
  Board/index.js → Board/firebase.js
- `runDailyJob()` --calls--> `sendAlert()`  [EXTRACTED]
  Board/executor.js → Board/alert.js
- `start()` --calls--> `sendAlert()`  [EXTRACTED]
  Board/index.js → Board/alert.js
- `runDailyJob()` --calls--> `getDoc()`  [EXTRACTED]
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
Cohesion: 0.29
Nodes (6): description, main, name, scripts, start, version

### Community 3 - "Axios Dependency"
Cohesion: 0.18
Nodes (11): axios, dependencies, axios, dotenv, firebase-admin, node-cron, puppeteer, dotenv (+3 more)

### Community 4 - "Dotenv Dependency"
Cohesion: 0.17
Nodes (15): axios, sendAlert(), { db, runTransaction, serverTimestamp, getDoc, setDoc }, { executeInvest }, runDailyJob(), { sendAlert }, admin, db (+7 more)

### Community 5 - "Firebase Admin"
Cohesion: 0.29
Nodes (9): cron, { db, serverTimestamp }, openBrowser(), puppeteer, { runDailyJob }, runTask1(), { sendAlert }, sleep() (+1 more)

### Community 6 - "Node Cron"
Cohesion: 0.22
Nodes (8): Data Flow, Goal, Key Decisions, Open Questions, Plan: Live "Actual follows Predicted" Balance Mode (Option A), Risks & Edge Cases, Tasks (ordered), Validation

### Community 7 - "Puppeteer"
Cohesion: 0.36
Nodes (6): App, LiveMode, setupPassword(), syncToFirebase(), tryLogin(), FirebaseDB

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
- **58 isolated node(s):** `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot`, `axios`, `{ db, runTransaction, serverTimestamp, getDoc, setDoc }` (+53 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Axios Dependency` to `Board Package Config`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `runDailyJob()` connect `Dotenv Dependency` to `Firebase Admin`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `$schema`, `file:///D:/Investation/.kilo/plugins/graphify.js`, `snapshot` to the rest of the system?**
  _58 weakly-connected nodes found - possible documentation gaps or missing edges._