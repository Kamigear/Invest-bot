const FirebaseDB = (() => {
    const firebaseConfig = {
        apiKey: 'AIzaSyDJwLwFPFq22RX4-_x9GAciD1VryvbJK7I',
        authDomain: 'invest-bot-3e7a9.firebaseapp.com',
        projectId: 'invest-bot-3e7a9',
        storageBucket: 'invest-bot-3e7a9.firebasestorage.app',
        messagingSenderId: '993603510644',
        appId: '1:993603510644:web:1f02670481f78be6464c21'
    };

    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.firestore();
    const auth = firebase.auth();

    let _uid = null;
    let _authReady = false;

    // Initialize anonymous auth
    async function initAnonymousAuth() {
        try {
            const result = await auth.signInAnonymously();
            _uid = result.user.uid;
            _authReady = true;
            console.log('Anonymous auth initialized:', _uid);
            return _uid;
        } catch (error) {
            console.error('Anonymous auth failed:', error);
            throw error;
        }
    }

    function getUid() {
        return _uid;
    }

    function isAuthReady() {
        return _authReady;
    }

    // Helper to hash password
    async function hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    // Transaction CRUD
    function getTransactionsRef(uid) {
        return db.collection('users').doc(uid).collection('transactions');
    }

    async function addTransaction(uid, data) {
        const ref = getTransactionsRef(uid);
        const docRef = await ref.add({
            ...data,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return { id: docRef.id, ...data };
    }

    async function updateTransaction(uid, id, data) {
        const ref = getTransactionsRef(uid).doc(String(id));
        await ref.update({
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return { id, ...data };
    }

    async function deleteTransaction(uid, id) {
        const ref = getTransactionsRef(uid).doc(String(id));
        await ref.delete();
        return true;
    }

    function subscribeTransactions(uid, callback) {
        const ref = getTransactionsRef(uid).orderBy('date', 'desc').orderBy('createdAt', 'desc');
        return ref.onSnapshot(
            { source: 'server' },
            (snapshot) => {
                const transactions = [];
                snapshot.forEach(doc => {
                    transactions.push({ id: doc.id, ...doc.data() });
                });
                callback(transactions);
            },
            (error) => {
                console.error('Error listening to transactions:', error);
                callback([]);
            }
        );
    }

    return {
        // Auth
        initAnonymousAuth,
        getUid,
        isAuthReady,

        // Config & Schedule Sync
        syncToFirebase: async (config, schedule = []) => {
            try {
                // 1. Sync config to botState/config
                if (config && typeof config === 'object') {
                    await db.collection('botState').doc('config').set({
                        ...config,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }

        // ── Ranking-Aware Strategy Guard ──────────────────────────────────
        // Sebelum schedule dikirim ke bot, cek kondisi ranking kelas kita.
        // Bot Orange Pi TIDAK akan tahu soal ini — bot hanya baca & eksekusi.
        // Semua keputusan ada di sini (browser).
        //
        // Fase yang berlaku:
        //   FREEZE       → saldo < 600 atau growth7d < 50  → hapus semua schedule
        //   CONSERVATIVE → saldo ≥ 600 dan growth7d ≥ 50   → cap amount ke 80 Pt
        //   SPRINT       → saldo ≥ 800 dan rank ≤ 2        → cap amount ke 120 Pt
        let filteredSchedule = schedule;
        let guardPhase = null;
        let guardMaxInvest = null;
        try {
            const lbDoc = await db.collection('botState').doc('leaderboardAnalytics').get();
            const dashDoc = await db.collection('botState').doc('dashboardData').get();

            if (lbDoc.exists && dashDoc.exists) {
                const lbData   = lbDoc.data();
                const dashData = dashDoc.data();
                const balance  = dashData.balance || 0;

                // Cari data kelas kita
                const OUR_PATTERNS = ['kaleb', 'mr kaleb', 'class mr kaleb'];
                const ourClass = (lbData.classes || []).find(c =>
                    String(c.classId) === '4' ||
                    OUR_PATTERNS.some(p => String(c.name || '').toLowerCase().includes(p))
                );

                const growth7d = ourClass?.growth7d ?? 0;
                const rank     = ourClass?.rank ?? 99;

                let phase, maxInvest;
                if (balance < 600 || growth7d < 50) {
                    phase = 'FREEZE'; maxInvest = 0;
                } else if (balance >= 800 && rank <= 2 && growth7d >= 150) {
                    phase = 'SPRINT'; maxInvest = 120;
                } else {
                    phase = 'CONSERVATIVE'; maxInvest = 80;
                }
                guardPhase = phase;
                guardMaxInvest = maxInvest;

                console.log(`[RankingGuard] Phase: ${phase} | Saldo: ${balance} Pt | Growth7d: ${growth7d} Pt | Rank: #${rank} | MaxInvest: ${maxInvest}`);

                if (phase === 'FREEZE') {
                    // Jangan kirim schedule apapun — bot hanya akan panen daily income
                    filteredSchedule = [];
                    console.warn('[RankingGuard] FREEZE aktif — semua schedule investasi DIHAPUS sebelum dikirim ke bot.');
                } else {
                    // Cap amount sesuai fase
                    filteredSchedule = schedule.map(item => ({
                        ...item,
                        amount: Math.min(item.amount || 0, maxInvest)
                    })).filter(item => item.amount > 0);
                    console.log(`[RankingGuard] ${phase} — ${filteredSchedule.length} schedule dikirim, amount di-cap ke max ${maxInvest} Pt.`);
                }

                // Simpan juga fase saat ini ke botState/config agar bisa dibaca UI
                await db.collection('botState').doc('config').set({
                    strategyPhase: phase,
                    strategyMaxInvest: maxInvest,
                    strategyUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    strategyContext: { balance, growth7d, rank }
                }, { merge: true });
            }
        } catch (guardErr) {
            console.warn('[RankingGuard] Gagal membaca data ranking, lanjut sync tanpa filter:', guardErr.message);
        }
        // ── End Ranking Guard ──────────────────────────────────────────────

                // 2. Sync investment schedule items to schedules collection
                if (Array.isArray(filteredSchedule) && filteredSchedule.length > 0) {
                    const batch = db.batch();
                    filteredSchedule.forEach(item => {
                        const dateStr = item.investDate || item.date;
                        if (dateStr) {
                            const entryId = (typeof item.id === 'string' && item.id.startsWith('inv_')) ? item.id : ('inv_' + String(dateStr));
                            const docRef = db.collection('schedules').doc(String(entryId));
                            batch.set(docRef, {
                                entryId,
                                investDate: dateStr,
                                amount: item.amount || 0,
                                expectedReturn: item.expectedReturn || item.returnAmount || item.return || 0,
                                maturityDate: item.maturityDate || '',
                                status: item.status || 'PENDING',
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });
                        }
                    });
                    await batch.commit();
                    console.log(`Successfully synced ${filteredSchedule.length} schedule entries to Firebase`);
                }

                console.log('Successfully synced config & schedule to Firebase');
                return {
                    success: true,
                    filteredSchedule,
                    phase: guardPhase,
                    maxInvest: guardMaxInvest,
                    itemsRemoved: schedule.length - filteredSchedule.length
                };
            } catch (error) {
                console.error('Error syncing config/schedule to Firebase:', error);
                throw error;
            }
        },

        // Ledger Sync to botState/ledger
        syncLedgerToFirebase: async (transactions) => {
            try {
                await db.collection('botState').doc('ledger').set({
                    transactions: transactions || [],
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log('Successfully synced ledger to Firebase');
                return true;
            } catch (error) {
                console.error('Error syncing ledger to Firebase:', error);
                throw error;
            }
        },

        fetchLedgerFromFirebase: async () => {
            try {
                const doc = await db.collection('botState').doc('ledger').get({ source: 'server' });
                if (doc.exists) {
                    return doc.data();
                }
            } catch (error) {
                console.error('Error fetching ledger from Firebase:', error);
            }
            return null;
        },

        // One-time fetch from Firebase (for manual sync button) - using flat paths
        fetchFromFirebase: async () => {
            try {
                const configDoc = await db.collection('botState').doc('config').get({ source: 'server' });
                
                const scheduleSnap = await db.collection('schedules')
                    .orderBy('investDate', 'asc')
                    .get({ source: 'server' });
                
                const schedule = [];
                scheduleSnap.forEach(doc => {
                    schedule.push({ id: doc.id, ...doc.data() });
                });
                
                console.log('Fetched from Firebase:', { config: configDoc.exists ? configDoc.data() : null, scheduleCount: schedule.length });
                return { config: configDoc.exists ? configDoc.data() : null, schedule };
            } catch (error) {
                console.error('Error fetching from Firebase:', error);
                throw error;
            }
        },

        // Real-time multi-browser sync - listen for config changes (flat path)
        syncFromFirebase: async (callback) => {
            try {
                const unsubscribe = db.collection('botState').doc('config')
                    .onSnapshot(
                        (doc) => {
                            if (doc.exists) {
                                const remoteConfig = doc.data();
                                console.log('Config updated from Firebase sync', remoteConfig);
                                if (callback) callback(remoteConfig);
                            }
                        },
                        (error) => {
                            console.error('Error listening to config changes:', error);
                        }
                    );
                return unsubscribe;
            } catch (error) {
                console.error('Error setting up Firebase config sync:', error);
                return null;
            }
        },

        // Real-time multi-browser sync for schedule updates (investment decisions) - flat path
        subscribeToScheduleUpdates: async (callback) => {
            try {
                const unsubscribe = db.collection('schedules')
                    .orderBy('investDate', 'asc')
                    .onSnapshot(
                        (snapshot) => {
                            const entries = [];
                            snapshot.forEach(doc => {
                                entries.push({ id: doc.id, ...doc.data() });
                            });
                            if (callback) callback(entries);
                        },
                        (error) => {
                            console.error('Error listening to schedule updates:', error);
                        }
                    );
                return unsubscribe;
            } catch (error) {
                console.error('Error setting up schedule sync:', error);
                return null;
            }
        },
        
        getExecutionStatuses: async (entryIds) => {
            try {
                if (!entryIds || entryIds.length === 0) return {};
                
                const results = {};
                for (let i = 0; i < entryIds.length; i += 10) {
                    const chunk = entryIds.slice(i, i + 10);
                    const snapshot = await db.collection('executions')
                        .where('entryId', 'in', chunk)
                        .get();
                    
                    snapshot.forEach(doc => {
                        results[doc.id] = doc.data().status;
                    });
                }
                
                return results;
            } catch (error) {
                console.error('Error getting execution statuses:', error);
                return {};
            }
        },

        // Password (legacy, kept for compatibility)
        checkPassword: async (inputPassword) => {
            try {
                const hashedInput = await hashPassword(inputPassword);
                const doc = await db.collection('auth').doc('password').get();
                
                if (doc.exists) {
                    return doc.data().hash === hashedInput;
                }
                return false; 
            } catch (error) {
                console.error('Error checking password:', error);
                return false;
            }
        },

        setPassword: async (newPassword) => {
            try {
                const hashed = await hashPassword(newPassword);
                await db.collection('auth').doc('password').set({
                    hash: hashed,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                return true;
            } catch (error) {
                console.error('Error setting password:', error);
                throw error;
            }
        },

        // Bot Balance
        onBalanceUpdate: (callback) => {
            return db.collection('botState').doc('balance').onSnapshot(
                { source: 'server' },
                (doc) => {
                    if (doc.exists) {
                        callback(doc.data().balance);
                    }
                }, (error) => {
                    console.error("Error listening to balance updates:", error);
                }
            );
        },

        getCurrentBalance: async () => {
            try {
                const doc = await db.collection('botState').doc('balance').get({ source: 'server' });
                if (doc.exists) {
                    return doc.data().balance;
                }
            } catch (error) {
                console.error("Error getting current balance:", error);
            }
            return null;
        },

        fetchDashboardData: async () => {
            try {
                const doc = await db.collection('botState').doc('dashboardData').get({ source: 'server' });
                if (doc.exists) {
                    return doc.data();
                }
            } catch (error) {
                console.error("Error getting dashboard data:", error);
            }
            return null;
        },

        // Transactions
        addTransaction,
        updateTransaction,
        deleteTransaction,
        subscribeTransactions,

        getDB: () => db
    };
})();

