# Graph Report - .  (2026-08-02)

## Corpus Check
- Corpus is ~14,278 words - fits in a single context window. You may not need a graph.

## Summary
- 38 nodes · 34 edges · 12 communities (5 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Live Balance Mode
- Graphify Documentation
- Board Package Config
- HTTP Client
- Environment Config
- Firebase Admin
- Task Scheduler
- Browser Automation
- Firestore Index
- Board README
- CallMeBot API

## God Nodes (most connected - your core abstractions)
1. `Live Mode` - 7 edges
2. `graphify` - 5 edges
3. `Predicted Balance` - 3 edges
4. `scripts` - 2 edges
5. `axios` - 2 edges
6. `dotenv` - 2 edges
7. `firebase-admin` - 2 edges
8. `node-cron` - 2 edges
9. `puppeteer` - 2 edges
10. `graphify workflow` - 2 edges

## Surprising Connections (you probably didn't know these)
- `graphify workflow` --conceptually_related_to--> `graphify`  [INFERRED]
  .agents/workflows/graphify.md → .agents/rules/graphify.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Firebase Data Sync** — js_firebase, board_index, firebase_firestore [INFERRED 0.80]
- **Simulation Engine Core** — js_engine_calculator, js_engine_ledger, js_engine_optimizer, js_engine_simulator [EXTRACTED 1.00]
- **UI Presentation Layer** — js_ui_calendar, js_ui_detail, js_ui_summary, js_ui_comparison [EXTRACTED 1.00]

## Communities (12 total, 7 thin omitted)

### Community 0 - "Live Balance Mode"
Cohesion: 0.36
Nodes (8): Actual Balance, Bot Balance Scrape, Firestore botState, graphify update, Live Mode, localStorage persistence, Predicted Balance, Simulation Engine

### Community 1 - "Graphify Documentation"
Cohesion: 0.29
Nodes (7): GRAPH_REPORT.md, graphify, graphify explain CLI, graphify-out directory, graphify query CLI, graphify skill, graphify workflow

### Community 2 - "Board Package Config"
Cohesion: 0.29
Nodes (6): description, main, name, scripts, start, version

### Community 3 - "HTTP Client"
Cohesion: 0.67
Nodes (3): axios, dependencies, axios

## Knowledge Gaps
- **21 isolated node(s):** `name`, `version`, `description`, `main`, `start` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `HTTP Client` to `Board Package Config`, `Environment Config`, `Firebase Admin`, `Task Scheduler`, `Browser Automation`?**
  _High betweenness centrality (0.165) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._