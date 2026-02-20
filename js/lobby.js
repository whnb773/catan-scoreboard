/* =============================================
   LOBBY
   Host/Join game flow via Firestore PIN system

   lobbies/{lobbyId}:
     pin          string (6 digits)
     createdAt    number (ms timestamp)
     hostUid      string
     status       "waiting" | "active" | "ended"
     players      array of { uid, displayName, avatarUrl, isHost }
   ============================================= */

// Module-level state
let activeLobbyId = null;
let lobbyUnsubscribe = null;

// ─── PIN ──────────────────────────────────────────────────────

function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── CREATE (host) ────────────────────────────────────────────

async function createLobby(user) {
  const { collection, addDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  const pin = generatePin();
  const docRef = await addDoc(collection(db, 'lobbies'), {
    pin,
    createdAt: Date.now(),
    hostUid: user.uid,
    status: 'waiting',
    players: [{
      uid: user.uid,
      displayName: user.displayName || user.email,
      avatarUrl: user.photoURL || '',
      isHost: true
    }]
  });

  activeLobbyId = docRef.id;
  return { id: docRef.id, pin };
}

// ─── FIND BY PIN (joiner) ─────────────────────────────────────

async function findLobbyByPin(pin) {
  const { collection, query, where, getDocs } = window.firestoreMethods;
  const db = window.firebaseDb;

  // Single-field equality query — no composite index needed
  const q = query(
    collection(db, 'lobbies'),
    where('pin', '==', String(pin))
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const cutoff = Date.now() - TWO_HOURS;

  let found = null;
  snap.forEach(docSnap => {
    const d = docSnap.data();
    if (d.status === 'waiting' && d.createdAt >= cutoff) {
      found = { id: docSnap.id, ...d };
    }
  });
  return found;
}

// ─── JOIN ─────────────────────────────────────────────────────

async function joinLobby(lobbyId, user) {
  const { doc, getDoc, setDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  const ref = doc(db, 'lobbies', lobbyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Lobby not found');

  const data = snap.data();

  // Idempotent — already joined
  if (data.players.some(p => p.uid === user.uid)) {
    activeLobbyId = lobbyId;
    return data;
  }

  const updated = [...data.players, {
    uid: user.uid,
    displayName: user.displayName || user.email,
    avatarUrl: user.photoURL || '',
    isHost: false
  }];

  await setDoc(ref, { players: updated }, { merge: true });
  activeLobbyId = lobbyId;
  return { ...data, players: updated };
}

// ─── REAL-TIME LISTENER ───────────────────────────────────────

function listenToLobby(lobbyId, callback) {
  const { doc, onSnapshot } = window.firestoreMethods;
  const db = window.firebaseDb;

  stopLobbyListener();
  const ref = doc(db, 'lobbies', lobbyId);
  lobbyUnsubscribe = onSnapshot(ref,
    snap => { if (snap.exists()) callback({ id: snap.id, ...snap.data() }); },
    err  => { console.error('Lobby listener error:', err); }
  );
  return lobbyUnsubscribe;
}

function stopLobbyListener() {
  if (lobbyUnsubscribe) {
    lobbyUnsubscribe();
    lobbyUnsubscribe = null;
  }
}

// ─── START (host marks active) ────────────────────────────────

async function startLobbyGame(lobbyId) {
  const { doc, setDoc } = window.firestoreMethods;
  await setDoc(
    doc(window.firebaseDb, 'lobbies', lobbyId),
    { status: 'active' },
    { merge: true }
  );
}

// ─── CANCEL / END (host) ──────────────────────────────────────

async function endLobby(lobbyId) {
  const { doc, setDoc } = window.firestoreMethods;
  stopLobbyListener();
  activeLobbyId = null;
  await setDoc(
    doc(window.firebaseDb, 'lobbies', lobbyId),
    { status: 'ended' },
    { merge: true }
  );
}

// ─── LEAVE (non-host player) ──────────────────────────────────

async function leavePlayerFromLobby(lobbyId, uid) {
  const { doc, getDoc, setDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  stopLobbyListener();
  activeLobbyId = null;

  const ref = doc(db, 'lobbies', lobbyId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const updated = snap.data().players.filter(p => p.uid !== uid);
  await setDoc(ref, { players: updated }, { merge: true });
}
