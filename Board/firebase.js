const admin = require('firebase-admin');
const { Logger } = require('./logger');

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  Logger.warning('GOOGLE_APPLICATION_CREDENTIALS not set', { env: process.env.NODE_ENV || 'unset' });
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: process.env.FIREBASE_PROJECT_ID
});

const db = admin.firestore();

const getDoc = (path) => db.doc(path).get();
const setDoc = (path, data, options = {}) => db.doc(path).set(data, options);
const runTransaction = (fn) => db.runTransaction(fn);
const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();
const onSnapshot = (path, callback) => db.doc(path).onSnapshot(callback);

module.exports = {
  db,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp,
  onSnapshot
};
