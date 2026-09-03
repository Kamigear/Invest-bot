const admin = require('firebase-admin');
const { Logger } = require('./logger');

let credential;
let projectId = process.env.FIREBASE_PROJECT_ID;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    credential = admin.credential.cert(parsed);
    if (!projectId) projectId = parsed.project_id;
    Logger.info('Firebase initialized using FIREBASE_SERVICE_ACCOUNT env JSON');
  } catch (err) {
    Logger.error('Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', err.message);
  }
}

if (!credential) {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    Logger.warning('GOOGLE_APPLICATION_CREDENTIALS not set', { env: process.env.NODE_ENV || 'unset' });
  }
  credential = admin.credential.applicationDefault();
}

admin.initializeApp({
  credential,
  projectId
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
