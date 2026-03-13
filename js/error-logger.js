/* =============================================
   ERROR LOGGER
   Captures client-side errors and writes them
   to Firestore for admin review.
   ============================================= */

const MAX_CLIENT_ERRORS = 200;

function _truncate(str, max) {
  if (!str) return '';
  return String(str).slice(0, max);
}

async function logClientError(message, stack, source) {
  // Wait until Firestore is ready
  if (!window.firebaseDb || !window.firestoreMethods) return;

  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const { collection, addDoc, query, orderBy, limit, getDocs, deleteDoc } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    await addDoc(collection(db, 'client_errors'), {
      timestamp: Date.now(),
      uid:       user?.uid   || null,
      userEmail: user?.email || null,
      message:   _truncate(message, 500),
      stack:     _truncate(stack,   500),
      source:    _truncate(source,  200),
      userAgent: _truncate(navigator.userAgent, 200),
      url:       _truncate(window.location.href, 200)
    });

    // Cap collection: query MAX+1 newest; if full, delete the oldest
    const trimQ = query(
      collection(db, 'client_errors'),
      orderBy('timestamp', 'desc'),
      limit(MAX_CLIENT_ERRORS + 1)
    );
    const snap = await getDocs(trimQ);
    if (snap.size === MAX_CLIENT_ERRORS + 1) {
      await deleteDoc(snap.docs[snap.size - 1].ref);
    }
  } catch (e) {
    // Never let error-logging crash the app
    console.warn('Error logging failed silently:', e);
  }
}

// ── Global handlers ──────────────────────────────────────────

window.onerror = function (message, source, lineno, colno, error) {
  const stack = error?.stack || `${source}:${lineno}:${colno}`;
  logClientError(message, stack, source);
  return false; // don't suppress default behaviour
};

window.onunhandledrejection = function (event) {
  const reason  = event.reason;
  const message = reason?.message || String(reason);
  const stack   = reason?.stack   || '';
  logClientError('Unhandled rejection: ' + message, stack, window.location.href);
};
