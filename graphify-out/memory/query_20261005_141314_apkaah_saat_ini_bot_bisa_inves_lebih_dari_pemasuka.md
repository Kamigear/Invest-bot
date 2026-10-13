---
type: "query"
date: "2026-10-05T14:13:14.884136+00:00"
question: "apkaah saat ini bot bisa inves lebih dari pemasukan?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["decisionEngine.js", "executor.js"]
---

# Q: apkaah saat ini bot bisa inves lebih dari pemasukan?

## Answer

Tidak bisa. Sesuai Rule 4.5 Daily Income Cap di Board/decisionEngine.js, nominal investasi dibatasi maksimal 80% dari pemasukan 24 jam (growth24h).

## Outcome

- Signal: useful

## Source Nodes

- decisionEngine.js
- executor.js