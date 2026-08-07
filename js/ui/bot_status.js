const BotStatusUI = (() => {
    let unsubscribe = null;
    
    function getStatusBadge(status) {
        let badgeClass = '';
        let icon = '';
        
        switch (status) {
            case 'PENDING':
                badgeClass = 'badge-warning';
                icon = '⏳';
                break;
            case 'EXECUTING':
                badgeClass = 'badge-info pulse-animation';
                icon = '🔄';
                break;
            case 'DONE':
                badgeClass = 'badge-success';
                icon = '✅';
                break;
            case 'FAILED':
                badgeClass = 'badge-danger';
                icon = '❌';
                break;
            case 'RECOVERY_NEEDED':
                badgeClass = 'badge-warning flash-animation';
                icon = '⚠️';
                break;
            default:
                badgeClass = 'badge-secondary';
                icon = '❓';
                status = 'UNKNOWN';
        }
        
        return `<span class="status-badge ${badgeClass}">${icon} ${status}</span>`;
    }

    return {
        render: (container) => {
            if (!container) return;
            
            container.innerHTML = `
                <div class="bot-status-panel premium-card">
                    <div class="panel-header">
                        <h2>🤖 Bot Execution Status</h2>
                        <div class="header-actions">
                            <span id="bot-heartbeat" class="heartbeat-text">Last Heartbeat: <span>Checking...</span></span>
                            <button id="btn-refresh-status" class="btn btn-secondary">🔄 Refresh</button>
                        </div>
                    </div>
                    <div class="table-container">
                        <table class="premium-table">
                            <thead>
                                <tr>
                                    <th>Entry ID</th>
                                    <th>Invest Date</th>
                                    <th>Amount</th>
                                    <th>Expected Return</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody id="bot-status-tbody">
                                <tr><td colspan="5" class="text-center">Loading status...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <style>
                    .bot-status-panel {
                        background: var(--bg-card, #1e1e24);
                        border: 1px solid var(--border, #333);
                        border-radius: 12px;
                        padding: 24px;
                        color: #eee;
                        box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                        margin-bottom: 24px;
                    }
                    .panel-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 20px;
                        border-bottom: 1px solid var(--border, #333);
                        padding-bottom: 15px;
                    }
                    .panel-header h2 {
                        margin: 0;
                        font-size: 1.5rem;
                        color: var(--text-primary, #fff);
                    }
                    .header-actions {
                        display: flex;
                        align-items: center;
                        gap: 15px;
                    }
                    .heartbeat-text {
                        font-size: 0.9rem;
                        color: var(--text-secondary, #aaa);
                    }
                    .heartbeat-text span {
                        color: var(--accent-green, #4ade80);
                        font-family: monospace;
                    }
                    .premium-table {
                        width: 100%;
                        border-collapse: collapse;
                    }
                    .premium-table th, .premium-table td {
                        padding: 12px 15px;
                        text-align: left;
                        border-bottom: 1px solid var(--border, #333);
                    }
                    .premium-table th {
                        background: rgba(0,0,0,0.2);
                        color: var(--text-secondary, #aaa);
                        font-weight: 600;
                        text-transform: uppercase;
                        font-size: 0.85rem;
                    }
                    .premium-table tr:hover {
                        background: rgba(255,255,255,0.03);
                    }
                    .status-badge {
                        padding: 5px 10px;
                        border-radius: 20px;
                        font-size: 0.8rem;
                        font-weight: 600;
                        display: inline-flex;
                        align-items: center;
                        gap: 5px;
                    }
                    .badge-warning { background: rgba(234, 179, 8, 0.2); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.3); }
                    .badge-info { background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
                    .badge-success { background: rgba(74, 222, 128, 0.2); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); }
                    .badge-danger { background: rgba(248, 113, 113, 0.2); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); }
                    .badge-secondary { background: rgba(156, 163, 175, 0.2); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3); }
                    
                    @keyframes pulse {
                        0% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.7; transform: scale(1.05); }
                        100% { opacity: 1; transform: scale(1); }
                    }
                    .pulse-animation { animation: pulse 1.5s infinite; }
                    
                    @keyframes flash {
                        0%, 100% { background: rgba(234, 179, 8, 0.2); }
                        50% { background: rgba(234, 179, 8, 0.6); }
                    }
                    .flash-animation { animation: flash 1s infinite; color: #fff; }
                </style>
            `;
            
            document.getElementById('btn-refresh-status').addEventListener('click', () => {
                BotStatusUI.refresh();
            });
            
            BotStatusUI.refresh();
        },
        
        refresh: () => {
            const tbody = document.getElementById('bot-status-tbody');
            if (!tbody) return;
            
            const db = FirebaseDB.getDB();
            
            // Unsubscribe previous listener if exists
            if (unsubscribe) {
                unsubscribe();
            }
            
            // Get heartbeat
            db.collection('botState').doc('heartbeat').get().then(doc => {
                const hbSpan = document.querySelector('#bot-heartbeat span');
                if (doc.exists && hbSpan) {
                    const data = doc.data();
                    const date = data.lastSeen ? data.lastSeen.toDate() : new Date();
                    hbSpan.textContent = date.toLocaleString() + (data.version ? ` (v${data.version})` : '');
                } else if (hbSpan) {
                    hbSpan.textContent = 'No heartbeat yet';
                }
            }).catch(err => console.error("Error fetching heartbeat:", err));
            
            // Set up snapshot listener for executions (auto refresh)
            unsubscribe = db.collection('executions')
                .orderBy('entryId', 'asc')
                .limit(100) // limit for UI purposes
                .onSnapshot((snapshot) => {
                    tbody.innerHTML = '';
                    
                    if (snapshot.empty) {
                        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No schedule entries found.</td></tr>';
                        return;
                    }
                    
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        
                        // Format currency
                        const formatCurr = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val || 0);
                        
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td style="font-family: monospace; font-size: 0.9em; color: var(--text-secondary, #aaa);">${data.entryId}</td>
                            <td>${data.investDate || '-'}</td>
                            <td>${formatCurr(data.amount)}</td>
                            <td class="text-success">${formatCurr(data.expectedReturn)}</td>
                            <td>${getStatusBadge(data.status)}</td>
                        `;
                        tbody.appendChild(tr);
                    });
                }, (error) => {
                    console.error("Error listening to executions:", error);
                    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading data.</td></tr>';
                });
        }
    };
})();
