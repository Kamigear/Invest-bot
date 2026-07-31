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

    // Helper to hash password
    async function hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    return {
        syncToFirebase: async (config, schedule) => {
            try {
                // Save config
                await db.collection('config').doc('main').set({
                    ...config,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                // Generate entryIds to fetch existing statuses
                const entryIds = [];
                for (const entry of schedule) {
                    const dateObj = new Date(entry.investDate || entry.date);
                    const yyyy = dateObj.getFullYear();
                    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const dd = String(dateObj.getDate()).padStart(2, '0');
                    entryIds.push(`inv_${yyyy}-${mm}-${dd}`);
                }

                // Fetch current statuses from DB to avoid overwriting DONE/EXECUTING states
                const existingStatuses = await FirebaseDB.getExecutionStatuses(entryIds);

                // Batch write schedule (max 500)
                let batch = db.batch();
                let count = 0;
                
                for (const entry of schedule) {
                    const dateObj = new Date(entry.investDate || entry.date);
                    const yyyy = dateObj.getFullYear();
                    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
                    const dd = String(dateObj.getDate()).padStart(2, '0');
                    const entryId = `inv_${yyyy}-${mm}-${dd}`;
                    
                    const docRef = db.collection('executions').doc(entryId);
                    const currentStatus = existingStatuses[entryId];

                    const updateData = {
                        entryId: entryId,
                        investDate: entry.investDate || entry.date,
                        maturityDate: entry.maturityDate,
                        amount: entry.amount,
                        expectedReturn: entry.expectedReturn,
                        profit: entry.profit,
                        balanceBefore: entry.balanceBefore,
                        generatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };

                    // Only set status to PENDING if it wasn't already processed (DONE/EXECUTING)
                    if (currentStatus !== 'DONE' && currentStatus !== 'EXECUTING') {
                        updateData.status = 'PENDING';
                    }
                    
                    batch.set(docRef, updateData, { merge: true });
                    
                    count++;
                    if (count === 500) {
                        await batch.commit();
                        batch = db.batch();
                        count = 0;
                    }
                }
                
                if (count > 0) {
                    await batch.commit();
                }
                
                console.log('Successfully synced config and schedule to Firebase');
                return true;
            } catch (error) {
                console.error('Error syncing to Firebase:', error);
                throw error;
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
        
        getDB: () => db
    };
})();
