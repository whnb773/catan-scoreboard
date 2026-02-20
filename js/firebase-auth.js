/* =============================================
   FIREBASE AUTHENTICATION
   Handle Google Sign-In and screen routing
   ============================================= */

let currentUser = null;
let currentUserProfile = null;

// ─── SCREEN ROUTING ───────────────────────────────────────────

// Show exactly one top-level screen; hide the rest.
// 'game' clears the inline style so CSS display:grid on .wrap kicks in.
function showScreen(name) {
  const map = {
    login:      qs('#loginScreen'),
    hostjoin:   qs('#hostJoinScreen'),
    game:       qs('#mainApp'),
    playerView: qs('#playerView')
  };
  Object.keys(map).forEach(key => {
    const el = map[key];
    if (!el) return;
    el.style.display = key === name ? (key === 'game' ? '' : 'flex') : 'none';
  });

  // Redraw canvas charts once the game panel is actually visible
  if (name === 'game' && typeof drawCharts === 'function') {
    requestAnimationFrame(() => drawCharts());
  }
}

// ─── AUTH STATE ───────────────────────────────────────────────

function initAuth() {
  const { onAuthStateChanged } = window.firebaseAuthMethods;
  const auth = window.firebaseAuth;

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    updateAuthUI(user);

    if (user) {
      console.log('User signed in:', user.email);
      await ensureUserProfile(user);
      currentUserProfile = await getUserProfile(user.uid);
      showToast(`Welcome ${user.displayName || user.email}!`, 'success');
      loadUserData();
    } else {
      console.log('User signed out');
      currentUserProfile = null;
      // Clean up any active lobby and reset sub-view
      if (typeof cleanupLobby === 'function') cleanupLobby();
      if (typeof showHostJoinView === 'function') showHostJoinView('hjChoose');
      const s = loadState();
      if (s) importState(s);
      renderAll();
    }
  });
}

// ─── UI UPDATE ────────────────────────────────────────────────

function updateAuthUI(user) {
  const notLoggedIn = qs('#notLoggedIn');
  const loggedIn    = qs('#loggedIn');

  if (user) {
    // Route signed-in users to host/join, not directly to game panel
    showScreen('hostjoin');

    // Game-panel header
    if (notLoggedIn) notLoggedIn.style.display = 'none';
    if (loggedIn)    loggedIn.style.display = 'flex';
    const el = qs('#userName');
    if (el) el.textContent = user.displayName || user.email;
    const ph = qs('#userPhoto');
    if (ph) ph.src = user.photoURL || '';
    const badge = qs('#adminBadge');
    if (badge) badge.style.display = (ADMIN_EMAILS || []).includes(user.email) ? 'inline' : 'none';

    // Host/join screen header
    const hjPhoto = qs('#hjUserPhoto');
    const hjName  = qs('#hjUserName');
    const hjBadge = qs('#hjAdminBadge');
    if (hjPhoto) hjPhoto.src = user.photoURL || '';
    if (hjName)  hjName.textContent = user.displayName || user.email;
    if (hjBadge) hjBadge.style.display = (ADMIN_EMAILS || []).includes(user.email) ? 'inline' : 'none';

    // Show "continue saved game" link if there's local state
    if (typeof checkForSavedGame === 'function') checkForSavedGame();

  } else {
    showScreen('login');
    if (notLoggedIn) notLoggedIn.style.display = 'flex';
    if (loggedIn)    loggedIn.style.display = 'none';
  }
}

// ─── SIGN IN / OUT ────────────────────────────────────────────

async function signInWithGoogle() {
  const { signInWithPopup, GoogleAuthProvider } = window.firebaseAuthMethods;
  const auth = window.firebaseAuth;
  const provider = new GoogleAuthProvider();

  try {
    const result = await signInWithPopup(auth, provider);
    console.log('Signed in:', result.user.email);
    return result.user;
  } catch (error) {
    console.error('Sign in error:', error);
    showToast('Sign in failed: ' + error.message, 'error');
    return null;
  }
}

async function signOutUser() {
  const { signOut } = window.firebaseAuthMethods;
  const auth = window.firebaseAuth;

  try {
    await signOut(auth);
    showToast('Signed out successfully', 'success');
  } catch (error) {
    console.error('Sign out error:', error);
    showToast('Sign out failed: ' + error.message, 'error');
  }
}

// ─── ACCESSORS ────────────────────────────────────────────────

function getCurrentUser() {
  return currentUser;
}

function getCurrentUserProfile() {
  return currentUserProfile;
}

async function refreshCurrentUserProfile() {
  if (!currentUser) return null;
  currentUserProfile = await getUserProfile(currentUser.uid);
  return currentUserProfile;
}

// ─── DATA LOADING ─────────────────────────────────────────────

async function loadUserData() {
  console.log('Loading user data from Firestore...');

  const firestoreData = await loadFromFirestore();

  if (firestoreData) {
    importState(firestoreData);
    showToast('Game loaded from cloud', 'success');
  } else {
    const localData = loadState();
    if (localData) {
      importState(localData);
      await saveToFirestore();
      showToast('Local game uploaded to cloud', 'success');
    }
  }

  renderAll();
}
