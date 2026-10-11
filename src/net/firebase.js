// Firebase project dead-signal-76487 (created 2026-10-10). The web config is
// public by design; Firestore rules (firestore.rules) are what protect it.
// Loaded lazily: solo play never downloads the Firebase SDK.
export const firebaseConfig = {
  apiKey: 'AIzaSyC23MV7crMe6KgoINbEeIMrIon3DZHIEAg',
  authDomain: 'dead-signal-76487.firebaseapp.com',
  projectId: 'dead-signal-76487',
  storageBucket: 'dead-signal-76487.firebasestorage.app',
  messagingSenderId: '403203783090',
  appId: '1:403203783090:web:eb8978c39b29ce1e964cab',
};

let _db = null;
export async function db() {
  if (_db) return _db;
  const { initializeApp } = await import('firebase/app');
  const { initializeFirestore } = await import('firebase/firestore');
  const app = initializeApp(firebaseConfig);
  // Phones behind content blockers, school/office proxies or odd carriers often cannot hold Firestore's streaming
  // connection open: the host then never hears a friend knock. Auto-detect falls back to plain long-polling.
  _db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  return _db;
}
