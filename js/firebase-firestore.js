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