/* =============================================
   FIRESTORE DATABASE
   Save/load game data to cloud
   ============================================= */

// Save current game state to Firestore
async function saveToFirestore() {
  const user = getCurrentUser();
  if (!user) {
    console.log('No user logged in, skipping Firestore save');
    return false;
  }

  const { doc, setDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    const gameData = exportState();
    const userDocRef = doc(db, 'users', user.uid, 'games', 'current');
    
    await setDoc(userDocRef, {
      ...gameData,
      lastUpdated: Date.now(),
      userEmail: user.email
    });
    
    console.log('Game saved to Firestore');
    return true;
  } catch (error) {
    console.error('Firestore save error:', error);
    showToast('Cloud save failed: ' + error.message, 'error');
    return false;
  }
}

// Load game state from Firestore
async function loadFromFirestore() {
  const user = getCurrentUser();
  if (!user) {
    console.log('No user logged in, cannot load from Firestore');
    return null;
  }

  const { doc, getDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    const userDocRef = doc(db, 'users', user.uid, 'games', 'current');
    const docSnap = await getDoc(userDocRef);
    
    if (docSnap.exists()) {
      console.log('Game loaded from Firestore');
      return docSnap.data();
    } else {
      console.log('No saved game in Firestore');
      return null;
    }
  } catch (error) {
    console.error('Firestore load error:', error);
    showToast('Cloud load failed: ' + error.message, 'error');
    return null;
  }
}

// Save game to history in Firestore
async function saveGameToHistory(gameData) {
  const user = getCurrentUser();
  if (!user) return false;

  const { doc, setDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    const gameId = 'game_' + Date.now();
    const historyDocRef = doc(db, 'users', user.uid, 'history', gameId);
    
    await setDoc(historyDocRef, {
      ...gameData,
      savedAt: Date.now(),
      userEmail: user.email
    });
    
    console.log('Game saved to history');
    return true;
  } catch (error) {
    console.error('History save error:', error);
    return false;
  }
}

// Save a completed game record and update all player stats
async function saveGameRecord(pendingEnd, gamePlayers, opts) {
  const user = getCurrentUser();
  if (!user) return;

  const { doc, setDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  const gameId = 'game_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8);
  const now = Date.now();

  const playerEntries = gamePlayers.map((p, i) => ({
    uid: p.uid || null,
    displayName: p.name || 'Player ' + (i + 1),
    colour: p.color || '#cccccc',
    finalScore: pendingEnd.scores[i],
    isWinner: i === pendingEnd.winnerIdx,
    isGuest: !p.uid
  }));

  const gameDoc = {
    hostUid: user.uid,
    startedAt: now - (pendingEnd.durationMs || 0),
    endedAt: now,
    durationMs: pendingEnd.durationMs || 0,
    totalRolls: pendingEnd.totalRolls || 0,
    ruleset: opts.ruleset || 'base',
    winningPoints: opts.winningPoints || 10,
    margin: pendingEnd.margin,
    winnerUid: gamePlayers[pendingEnd.winnerIdx]?.uid || null,
    players: playerEntries
  };

  try {
    await setDoc(doc(db, 'games', gameId), gameDoc);
    console.log('Game record saved:', gameId);

    const updatePromises = gamePlayers.map((p, i) => {
      if (!p.uid) return Promise.resolve();
      const isWinner = i === pendingEnd.winnerIdx;
      return Promise.all([
        _appendGameRef(p.uid, gameId),
        updatePlayerStats(p.uid, {
          isWinner,
          finalScore: pendingEnd.scores[i],
          margin: isWinner ? pendingEnd.margin : 0,
          gameRolls: pendingEnd.totalRolls || 0
        })
      ]);
    });

    await Promise.all(updatePromises);
    if (typeof refreshCurrentUserProfile === 'function') refreshCurrentUserProfile();
  } catch (err) {
    console.error('saveGameRecord error:', err);
  }
}

// Append a game ID to a user's recent gameRefs list (max 20)
async function _appendGameRef(uid, gameId) {
  const { doc, getDoc, setDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    const refsRef = doc(db, 'users', uid, 'meta', 'gameRefs');
    const snap = await getDoc(refsRef);
    const ids = snap.exists() ? (snap.data().ids || []) : [];
    await setDoc(refsRef, { ids: [gameId, ...ids].slice(0, 20) });
  } catch (err) {
    console.error('_appendGameRef error:', err);
  }
}

// Load game history from Firestore
async function loadHistoryFromFirestore() {
  const user = getCurrentUser();
  if (!user) return [];

  const { collection, getDocs, query } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    const historyRef = collection(db, 'users', user.uid, 'history');
    const querySnapshot = await getDocs(historyRef);
    
    const games = [];
    querySnapshot.forEach((doc) => {
      games.push(doc.data());
    });
    
    console.log(`Loaded ${games.length} games from history`);
    return games;
  } catch (error) {
    console.error('History load error:', error);
    return [];
  }
}