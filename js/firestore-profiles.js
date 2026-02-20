/* =============================================
   FIRESTORE PROFILES
   Player profiles, stats, leaderboard, user search
   ============================================= */

// Ensure a user document exists in Firestore, creating it on first login
async function ensureUserProfile(user) {
  if (!user) return;
  const { doc, setDoc, getDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      // First login - create profile with zero stats
      await setDoc(userRef, {
        displayName: user.displayName || user.email.split('@')[0],
        email: user.email,
        avatarUrl: user.photoURL || '',
        colourPref: '#1f6bd6',
        createdAt: Date.now(),
        lastSeen: Date.now(),
        totalGames: 0,
        totalWins: 0,
        winStreakCurrent: 0,
        winStreakLongest: 0,
        avgMargin: 0,
        totalVP: 0,
        totalRolls: 0
      });
    } else {
      // Update lastSeen and freshen display info from Google
      await setDoc(userRef, {
        lastSeen: Date.now(),
        avatarUrl: user.photoURL || snap.data().avatarUrl || '',
        email: user.email
      }, { merge: true });
    }
  } catch (err) {
    console.error('ensureUserProfile error:', err);
  }
}

// Get a single user's profile doc
async function getUserProfile(uid) {
  if (!uid) return null;
  const { doc, getDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? { uid, ...snap.data() } : null;
  } catch (err) {
    console.error('getUserProfile error:', err);
    return null;
  }
}

// Search users by display name prefix (for game setup player search)
async function searchUsers(queryStr) {
  if (!queryStr || queryStr.trim().length < 1) return [];
  const { collection, query, where, orderBy, limit, getDocs } = window.firestoreMethods;
  const db = window.firebaseDb;
  const q = queryStr.trim();

  try {
    const usersRef = collection(db, 'users');
    const fsQuery = query(
      usersRef,
      where('displayName', '>=', q),
      where('displayName', '<=', q + '\uf8ff'),
      orderBy('displayName'),
      limit(8)
    );
    const snap = await getDocs(fsQuery);
    const results = [];
    snap.forEach(d => results.push({ uid: d.id, ...d.data() }));
    return results;
  } catch (err) {
    console.error('searchUsers error:', err);
    return [];
  }
}

// Load global leaderboard (top 20 by total wins)
async function loadLeaderboard() {
  const user = getCurrentUser();
  if (!user) return [];
  const { collection, query, orderBy, limit, getDocs } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    const fsQuery = query(
      collection(db, 'users'),
      orderBy('totalWins', 'desc'),
      limit(20)
    );
    const snap = await getDocs(fsQuery);
    const results = [];
    snap.forEach(d => results.push({ uid: d.id, ...d.data() }));
    return results;
  } catch (err) {
    console.error('loadLeaderboard error:', err);
    return [];
  }
}

// Get last 20 games for a user (reads from their gameRefs list then fetches game docs)
async function getUserGames(uid) {
  if (!uid) return [];
  const { doc, getDoc, collection, query, where, orderBy, limit, getDocs } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    // Read the user's list of recent game IDs
    const refsDoc = await getDoc(doc(db, 'users', uid, 'meta', 'gameRefs'));
    if (!refsDoc.exists()) return [];

    const gameIds = (refsDoc.data().ids || []).slice(0, 20);
    if (gameIds.length === 0) return [];

    // Fetch each game doc
    const games = await Promise.all(
      gameIds.map(async id => {
        const snap = await getDoc(doc(db, 'games', id));
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
      })
    );
    return games.filter(Boolean);
  } catch (err) {
    console.error('getUserGames error:', err);
    return [];
  }
}

// Update a user's aggregate stats after a game (called inside saveGameRecord)
async function updatePlayerStats(uid, { isWinner, finalScore, margin, gameRolls }) {
  if (!uid) return;
  const { doc, runTransaction } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    const userRef = doc(db, 'users', uid);
    await runTransaction(db, async tx => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) return;
      const d = snap.data();

      const totalGames = (d.totalGames || 0) + 1;
      const totalWins = (d.totalWins || 0) + (isWinner ? 1 : 0);
      const winStreakCurrent = isWinner ? (d.winStreakCurrent || 0) + 1 : 0;
      const winStreakLongest = Math.max(d.winStreakLongest || 0, winStreakCurrent);
      const totalVP = (d.totalVP || 0) + finalScore;
      const totalRolls = (d.totalRolls || 0) + gameRolls;

      // Rolling average of winning margin (only for wins)
      let avgMargin = d.avgMargin || 0;
      if (isWinner) {
        const prevWins = totalWins - 1;
        avgMargin = prevWins === 0 ? margin : Math.round((avgMargin * prevWins + margin) / totalWins);
      }

      tx.set(userRef, {
        totalGames, totalWins, winStreakCurrent, winStreakLongest,
        avgMargin, totalVP, totalRolls
      }, { merge: true });
    });
  } catch (err) {
    console.error('updatePlayerStats error:', err);
  }
}

// Update a user's display name (called from profile tab)
async function updateDisplayName(uid, name) {
  if (!uid || !name.trim()) return;
  const { doc, setDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    await setDoc(doc(db, 'users', uid), { displayName: name.trim() }, { merge: true });
  } catch (err) {
    console.error('updateDisplayName error:', err);
    showToast('Failed to update name', 'error');
  }
}

// Update a user's colour preference
async function updateColourPref(uid, colour) {
  if (!uid || !colour) return;
  const { doc, setDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    await setDoc(doc(db, 'users', uid), { colourPref: colour }, { merge: true });
  } catch (err) {
    console.error('updateColourPref error:', err);
  }
}
