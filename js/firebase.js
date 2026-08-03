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
        const ref = getTransactionsRef(uid).doc(id);
        await ref.update({
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        return { id, ...data };
    }

    async function deleteTransaction(uid, id) {
        const ref = getTransactionsRef(uid).doc(id);
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
        syncToFirebase: async (config, schedule) => {
            try {
                const uid = _uid || 'anon';
                await db.collection('users').doc(uid).collection('investments')
                    .doc('config').set({
                        ...config,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                const entries = schedule || [];
                const batches = [];
                let batch = db.batch();
                let count = 0;

                for (const entry of entries) {
                    const rawDate = entry.investDate || entry.date;
                    const dateObj = new Date(rawDate);
                    const yyyy = dateObj.getFullYear();
                    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const dd = String(dateObj.getDate()).padStart(2, '0');
                    const entryId = `inv_${yyyy}-${mm}-${dd}`;

                    const docRef = db.collection('users').doc(uid)
                        .collection('investments').doc('schedule')
                        .collection('entries').doc(entryId);

                    batch.set(docRef, {
                        entryId,
                        investDate: rawDate,
                        maturityDate: entry.maturityDate,
                        amount: entry.amount,
                        expectedReturn: entry.expectedReturn,
                        profit: entry.profit,
                        balanceBefore: entry.balanceBefore,
                        generatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    count++;
                    if (count === 500) {
                        batches.push(batch);
                        batch = db.batch();
                        count = 0;
                    }
                }

                if (count > 0) batches.push(batch);
                await Promise.all(batches.map(b => b.commit()));

                console.log('Successfully synced config and schedule to Firebase');
                return true;
            } catch (error) {
                console.error('Error syncing to Firebase:', error);
                throw error;
            }
        },

        // Real-time multi-browser sync - listen for config changes
        syncFromFirebase: async (callback) => {
            try {
                const uid = _uid || 'anon';
                const unsubscribe = db.collection('users').doc(uid)
                    .collection('investments')
                    .doc('config')
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

        // Real-time multi-browser sync for schedule updates (investment decisions)
        subscribeToScheduleUpdates: async (callback) => {
            try {
                const uid = _uid || 'anon';
                const unsubscribe = db.collection('users').doc(uid)
                    .collection('investments')
                    .doc('schedule')
                    .collection('entries')
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

        // Transactions
        addTransaction,
        updateTransaction,
        deleteTransaction,
        subscribeTransactions,

        getDB: () => db
    };
})();
