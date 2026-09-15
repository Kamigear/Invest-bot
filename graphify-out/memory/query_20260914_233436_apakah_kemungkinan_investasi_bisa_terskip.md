---
type: "query"
date: "2026-09-14T23:34:36.605266+00:00"
question: "apakah kemungkinan investasi bisa terskip?"
contributor: "graphify"
source_nodes: ["markNetworkSkipped", "scheduleRetry", "executeInvest", "executor.js"]
---

# Q: apakah kemungkinan investasi bisa terskip?

## Answer

Investasi dapat dilewati (SKIPPED/tidak dieksekusi) dalam beberapa kondisi: 1. INVEST_ENABLED=false di ENV (executor.js:L170). 2. Kegagalan jaringan berulang hingga melewati RETRY_MAX_ATTEMPTS via markNetworkSkipped() (index.js:L531). 3. Saldo tidak mencukupi (availableToInvest < minInvest) menghasilkan status NO_SCHEDULE (executor.js:L71). 4. Transaksi sudah tercatat DONE atau EXECUTING untuk mencegah double execution (executor.js:L108, L142).

## Source Nodes

- markNetworkSkipped
- scheduleRetry
- executeInvest
- executor.js