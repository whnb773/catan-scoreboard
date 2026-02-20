/* =============================================
   FIREBASE AUTHENTICATION
   Handle Google Sign-In
   ============================================= */

let currentUser = null;
let currentUserProfile = null;

// Initialize auth state listener
function initAuth() {
  const { onAuthStateChanged } = window.firebaseAuthMethods;
  const auth = window.firebaseAuth;

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    updateAuthUI(user);

    if (user) {
      console.log('User signed in:', user.email);
      // Ensure profile doc exists and cache it
      await ensureUserProfile(user);
      currentUserProfile = await getUserProfile(user.uid);
      showToast(`Welcome ${user.displayName}!`, 'success');
      loadUserData();
    } else {
      console.log('User signed out');
      currentUserProfile = null;
      const s = loadState();
      if (s) importState(s);
      renderAll();
    }
  });
}

// Update UI based on auth state
function updateAuthUI(user) {
  const notLoggedIn = qs('#notLoggedIn');
  const loggedIn = qs('#loggedIn');
  
  if (user) {
    // Show logged in state
    notLoggedIn.style.display = 'none';
    loggedIn.style.display = 'flex';
    
    qs('#userName').textContent = user.displayName || user.email;
    qs('#userPhoto').src = user.photoURL || '';
  } else {
    // Show not logged in state
    notLoggedIn.style.display = 'flex';
    loggedIn.style.display = 'none';
  }
}

// Sign in with Google
async function signInWithGoogle() {
  const { signInWithPopup, GoogleAuthProvider } = window.firebaseAuthMethods;
  const auth = window.firebaseAuth;
  const provider = new GoogleAuthProvider();
  
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    console.log('Signed in:', user.email);
    return user;
  } catch (error) {
    console.error('Sign in error:', error);
    showToast('Sign in failed: ' + error.message, 'error');
    return null;
  }
}

// Sign out
async function signOutUser() {
  const { signOut } = window.firebaseAuthMethods;
  const auth = window.firebaseAuth;
  
  try {
    await signOut(auth);
    console.log('Signed out');
    showToast('Signed out successfully', 'success');
    
    // Clear local state
    renderAll();
  } catch (error) {
    console.error('Sign out error:', error);
    showToast('Sign out failed: ' + error.message, 'error');
  }
}

// Get current user
function getCurrentUser() {
  return currentUser;
}

// Get current user's cached Firestore profile
function getCurrentUserProfile() {
  return currentUserProfile;
}

// Refresh the cached profile (call after stat updates)
async function refreshCurrentUserProfile() {
  if (!currentUser) return null;
  currentUserProfile = await getUserProfile(currentUser.uid);
  return currentUserProfile;
}

// Load user data from Firestore
async function loadUserData() {
  console.log('Loading user data from Firestore...');
  
  // Try to load from Firestore
  const firestoreData = await loadFromFirestore();
  
  if (firestoreData) {
    // Found cloud data, use it
    importState(firestoreData);
    showToast('Game loaded from cloud', 'success');
  } else {
    // No cloud data, check localStorage
    const localData = loadState();
    if (localData) {
      importState(localData);
      // Save to cloud for next time
      await saveToFirestore();
      showToast('Local game uploaded to cloud', 'success');
    }
  }
  
  renderAll();
}