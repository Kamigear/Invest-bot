# Graph Report - Investation  (2026-08-02)

## Corpus Check
- 25 files · ~13,464 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 92 nodes · 118 edges · 12 communities (8 shown, 4 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e7824d5f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- executor.js
- Investment Calendar Simulator
- index.js
- dependencies
- app.js
- package.json
- bot_status.js
- AGENTS.md
- Invest Bot
- graphify.md
- graphify.md

## God Nodes (most connected - your core abstractions)
1. `Investment Calendar Simulator` - 12 edges
2. `runDailyJob()` - 9 edges
3. `runTask1()` - 6 edges
4. `sendAlert()` - 5 edges
5. `serverTimestamp()` - 5 edges
6. `start()` - 4 edges
7. `FirebaseDB` - 4 edges
8. `db` - 3 edges
9. `getDoc()` - 3 edges
10. `setDoc()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `runDailyJob()` --calls--> `getDoc()`  [EXTRACTED]
  Board/executor.js → Board/firebase.js
- `runDailyJob()` --calls--> `runTransaction()`  [EXTRACTED]
  Board/executor.js → Board/firebase.js
- `runDailyJob()` --calls--> `setDoc()`  [EXTRACTED]
  Board/executor.js → Board/firebase.js
- `runDailyJob()` --calls--> `executeInvest()`  [EXTRACTED]
  Board/executor.js → Board/investor.js
- `runDailyJob()` --calls--> `sendAlert()`  [EXTRACTED]
  Board/executor.js → Board/alert.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Simulation Engine Core** — js_engine_calculator, js_engine_ledger, js_engine_optimizer, js_engine_simulator [EXTRACTED 1.00]
- **UI Presentation Layer** — js_ui_calendar, js_ui_detail, js_ui_summary, js_ui_comparison [EXTRACTED 1.00]
- **Firebase Data Sync** — js_firebase, board_index, firebase_firestore [INFERRED 0.80]

## Communities (12 total, 4 thin omitted)

### Community 0 - "executor.js"
Cohesion: 0.20
Nodes (10): { db, runTransaction, serverTimestamp, getDoc, setDoc }, { executeInvest }, { sendAlert }, admin, db, getDoc(), runTransaction(), setDoc() (+2 more)

### Community 1 - "Investment Calendar Simulator"
Cohesion: 0.10
Nodes (12): Firebase Firestore, Investment Calendar Simulator, Calculator, Ledger, Optimizer, ExportCSV, ExportExcel, ExportPDF (+4 more)

### Community 2 - "index.js"
Cohesion: 0.20
Nodes (15): axios, sendAlert(), runDailyJob(), serverTimestamp(), cron, { db, serverTimestamp }, openBrowser(), puppeteer (+7 more)

### Community 3 - "dependencies"
Cohesion: 0.18
Nodes (11): axios, dependencies, axios, dotenv, firebase-admin, node-cron, puppeteer, dotenv (+3 more)

### Community 4 - "app.js"
Cohesion: 0.36
Nodes (6): App, setupPassword(), syncToFirebase(), tryLogin(), Simulator, FirebaseDB

### Community 5 - "package.json"
Cohesion: 0.29
Nodes (6): description, main, name, scripts, start, version

### Community 9 - "Invest Bot"
Cohesion: 0.50
Nodes (3): Architecture & Logic, Invest Bot, Setup di OrangePi

## Knowledge Gaps
- **39 isolated node(s):** `axios`, `{ db, runTransaction, serverTimestamp, getDoc, setDoc }`, `{ sendAlert }`, `{ executeInvest }`, `admin` (+34 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Investment Calendar Simulator` connect `Investment Calendar Simulator` to `app.js`?**
  _High betweenness centrality (0.281) - this node is a cross-community bridge._
- **Why does `Firebase Firestore` connect `Investment Calendar Simulator` to `index.js`?**
  _High betweenness centrality (0.239) - this node is a cross-community bridge._
- **What connects `axios`, `{ db, runTransaction, serverTimestamp, getDoc, setDoc }`, `{ sendAlert }` to the rest of the system?**
  _39 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Investment Calendar Simulator` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._