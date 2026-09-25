const BotStatusUI = (() => {
    let unsubscribe = null;
    
    function getStatusBadge(status) {
        let badgeClass = '';
        let dotColor = '#666';
        
        switch (status) {
            case 'PENDING':
                badgeClass = 'badge-warning';
                dotColor = '#f59e0b';
                break;
            case 'EXECUTING':
                badgeClass = 'badge-info pulse-animation';
                dotColor = '#38bdf8';
                break;
            case 'DONE':
                badgeClass = 'badge-success';
                dotColor = '#22c55e';
                break;
            case 'FAILED':
                badgeClass = 'badge-danger';
                dotColor = '#ef4444';
                break;
            case 'RECOVERY_NEEDED':
                badgeClass = 'badge-warning flash-animation';
                dotColor = '#fb923c';
                break;
            default:
                badgeClass = 'badge-secondary';
                dotColor = '#666';
                status = 'UNKNOWN';
        }
        
        return `<span class="status-badge ${badgeClass}"><span class="badge-dot" style="background:${dotColor};"></span>${status}</span>`;
    }

    return {
        render: (container) => {
            if (!container) return;
            
            container.innerHTML = `
                <div class="bot-status-panel">
                    <div class="panel-header">
                        <div>
                            <span class="terminal-kicker">SUBSYSTEM // AUTOMATION</span>
                            <h2>BOT_EXECUTION_QUEUE</h2>
                        </div>
                        <div class="header-actions">
                            <span id="bot-heartbeat" class="heartbeat-text">HEARTBEAT: <span>CHECKING...</span></span>
                            <button id="btn-refresh-status" class="btn-terminal">[SYNC DATA]</button>
                        </div>
                    </div>
                    <div class="table-container">
                        <table class="terminal-table">
                            <thead>
                                <tr>
                                    <th>ENTRY_ID</th>
                                    <th>INVEST_DATE</th>
                                    <th>AMOUNT_PTS</th>
                                    <th>EXPECTED_RETURN</th>
                                    <th>STATUS</th>
                                </tr>
                            </thead>
                            <tbody id="bot-status-tbody">
                                <tr><td colspan="5" class="text-center" style="padding:24px; color:var(--text-muted);">MENUNGGU DATA EKSEKUSI...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <style>
                    .bot-status-panel {
                        background: var(--bg-card, #141417);
                        border: 1px solid var(--border, rgba(255,255,255,0.06));
                        border-top: 2px solid var(--accent, #f59e0b);
                        border-radius: var(--radius-sm, 3px);
                        padding: 20px 22px;
                        color: var(--text-primary, #f0f0f0);
                        margin-bottom: 24px;
                    }
                    .terminal-kicker {
                        display: block;
                        font-family: 'IBM Plex Mono', monospace;
                        font-size: 10px;
                        color: var(--accent, #f59e0b);
                        letter-spacing: 0.12em;
                        margin-bottom: 2px;
                    }
                    .panel-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        margin-bottom: 18px;
                        border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
                        padding-bottom: 14px;
                    }
                    .panel-header h2 {
                        margin: 0;
                        font-size: 16px;
                        font-family: 'IBM Plex Mono', monospace;
                        font-weight: 700;
                        letter-spacing: -0.01em;
                        color: var(--text-primary, #f0f0f0);
                    }
                    .header-actions {
                        display: flex;
                        align-items: center;
                        gap: 14px;
                    }
                    .heartbeat-text {
                        font-size: 11px;
                        font-family: 'IBM Plex Mono', monospace;
                        color: var(--text-muted, #555);
                    }
                    .heartbeat-text span {
                        color: var(--sig-green, #22c55e);
                    }
                    .btn-terminal {
                        background: var(--bg-input, #1a1a1d);
                        border: 1px solid var(--border-strong, rgba(255,255,255,0.15));
                        color: var(--text-primary, #f0f0f0);
                        font-family: 'IBM Plex Mono', monospace;
                        font-size: 11px;
                        font-weight: 600;
                        padding: 5px 12px;
                        border-radius: 2px;
                        cursor: pointer;
                        transition: all var(--transition, 0.15s ease);
                    }
                    .btn-terminal:hover {
                        border-color: var(--accent, #f59e0b);
                        color: var(--accent, #f59e0b);
                    }
                    .terminal-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-family: 'IBM Plex Mono', monospace;
                        font-size: 12px;
                    }
                    .terminal-table th, .terminal-table td {
                        padding: 10px 14px;
                        text-align: left;
                        border-bottom: 1px solid var(--border, rgba(255,255,255,0.06));
                    }
                    .terminal-table th {
                        background: rgba(0,0,0,0.3);
                        color: var(--text-muted, #777);
                        font-weight: 600;
                        text-transform: uppercase;
                        font-size: 10px;
                        letter-spacing: 0.08em;
                    }
                    .terminal-table tr:hover {
                        background: rgba(255,255,255,0.02);
                    }
                    .status-badge {
                        padding: 2px 8px;
                        border-radius: 2px;
                        font-size: 10px;
                        font-family: 'IBM Plex Mono', monospace;
                        font-weight: 600;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        letter-spacing: 0.04em;
                    }
                    .badge-dot {
                        width: 5px;
                        height: 5px;
                        border-radius: 50%;
                        flex-shrink: 0;
                    }
                    .badge-warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); }
                    .badge-info { background: rgba(56, 189, 248, 0.1); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
                    .badge-success { background: rgba(34, 197, 94, 0.1); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); }
                    .badge-danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
                    .badge-secondary { background: rgba(156, 163, 175, 0.1); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3); }
                    
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.5; }
                    }
                    .pulse-animation { animation: pulse 1.5s infinite; }
                    
                    @keyframes flash {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.3; }
                    }
                    .flash-animation { animation: flash 1s infinite; }
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
                        
                        // Format as plain points (no thousands separator)
                        const formatPts = (val) => String(val || 0);
                        
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td style="font-family: monospace; font-size: 0.9em; color: var(--text-secondary, #aaa);">${data.entryId}</td>
                            <td>${data.investDate || '-'}</td>
                            <td>${formatPts(data.amount)}</td>
                            <td class="text-success">${formatPts(data.expectedReturn)}</td>
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
