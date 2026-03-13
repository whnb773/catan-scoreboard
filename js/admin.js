/* =============================================
   ADMIN PANEL
   Webmaster dashboard — only accessible to
   emails listed in ADMIN_EMAILS (config.js).
   ============================================= */

let _adminReturnScreen = 'hostjoin';
let _adminAllUsers     = [];   // cached full user list
let _adminAllErrors    = [];   // cached error list for detail overlay

// ─── ACCESS CONTROL ──────────────────────────────────────────

function isAdminUser() {
  const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  return !!(user && (ADMIN_EMAILS || []).includes(user.email));
}

function showAdminScreen(returnScreen) {
  if (!isAdminUser()) {
    showScreen('hostjoin');
    return;
  }
  _adminReturnScreen = returnScreen || 'hostjoin';
  _adminAllUsers  = [];  // clear caches so data is fresh each visit
  _adminAllErrors = [];
  showScreen('admin');
  setAdminTab('dashboard');
}

// ─── TAB SWITCHING ───────────────────────────────────────────

function setAdminTab(tab) {
  qsa('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  qsa('.admin-panel').forEach(p => {
    p.style.display = p.id === 'adminPanel-' + tab ? '' : 'none';
  });
  if (tab === 'dashboard') renderAdminDashboard();
  if (tab === 'users')     renderAdminUsers();
  if (tab === 'errors')    renderAdminErrors();
}

// ─── DASHBOARD ───────────────────────────────────────────────

async function renderAdminDashboard() {
  if (!window.firebaseDb || !window.firestoreMethods) {
    setTimeout(renderAdminDashboard, 800);
    return;
  }

  ['adminStatUsers','adminStatGames','adminStatLobbies','adminStatDocs'].forEach(id => {
    const el = qs('#' + id);
    if (el) el.textContent = '…';
  });

  const { collection, query, where, orderBy, limit, getDocs } = window.firestoreMethods;
  const db = window.firebaseDb;

  try {
    // ── counts ────────────────────────────────────────────────
    const [usersSnap, gamesSnap, lobbiesSnap, errorsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'games')),
      getDocs(query(collection(db, 'lobbies'), where('status', 'in', ['waiting', 'active']))),
      getDocs(query(collection(db, 'client_errors'), orderBy('timestamp', 'desc'), limit(10)))
    ]);

    qs('#adminStatUsers').textContent   = usersSnap.size.toLocaleString();
    qs('#adminStatGames').textContent   = gamesSnap.size.toLocaleString();
    qs('#adminStatLobbies').textContent = lobbiesSnap.size.toLocaleString();

    // Rough doc estimate across visible collections
    const totalDocs = usersSnap.size + gamesSnap.size + lobbiesSnap.size + errorsSnap.size;
    qs('#adminStatDocs').textContent = totalDocs.toLocaleString();

    // ── activity chart: games per week, last 12 weeks ─────────
    const now           = Date.now();
    const twelveWeeksMs = 12 * 7 * 24 * 60 * 60 * 1000;
    const weekBuckets   = new Array(12).fill(0);
    gamesSnap.forEach(doc => {
      const d = doc.data();
      if (!d.endedAt || d.endedAt < now - twelveWeeksMs) return;
      const weeksAgo = Math.floor((now - d.endedAt) / (7 * 24 * 60 * 60 * 1000));
      const idx = 11 - Math.min(11, weeksAgo);
      weekBuckets[idx]++;
    });
    renderActivityChart(weekBuckets);

    // ── last 10 errors ────────────────────────────────────────
    _adminAllErrors = [];
    errorsSnap.forEach(d => _adminAllErrors.push({ id: d.id, ...d.data() }));
    renderDashboardErrors();

  } catch (err) {
    console.error('renderAdminDashboard error:', err);
    showToast('Admin load error: ' + err.message, 'error');
  }
}

function renderActivityChart(weekData) {
  const canvas = qs('#adminActivityChart');
  if (!canvas) return;

  const dpr  = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w    = Math.max(1, Math.floor(rect.width  * dpr));
  const h    = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cw = rect.width, ch = rect.height;
  ctx.clearRect(0, 0, cw, ch);

  const pad    = 30;
  const chartW = cw - pad * 2;
  const chartH = ch - pad * 2;
  const maxVal = Math.max(1, ...weekData);
  const n      = weekData.length;
  const gap    = 6;
  const barW   = (chartW - gap * (n - 1)) / n;

  // axes
  ctx.strokeStyle = 'rgba(0,0,0,.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad); ctx.lineTo(pad, pad + chartH);
  ctx.lineTo(pad + chartW, pad + chartH);
  ctx.stroke();

  ctx.font = '11px system-ui,-apple-system,Arial';
  ctx.textAlign = 'center';

  weekData.forEach((val, idx) => {
    const x    = pad + idx * (barW + gap);
    const barH = (val / maxVal) * (chartH - 20);
    const y    = pad + chartH - barH;

    ctx.fillStyle = 'rgba(90,60,36,.7)';
    ctx.fillRect(x, y, barW, barH);

    if (val > 0) {
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(val), x + barW / 2, y - 2);
    }

    const weeksAgo = 11 - idx;
    const label = weeksAgo === 0 ? 'This wk' : `-${weeksAgo}w`;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + barW / 2, pad + chartH + 4);
  });
}

function renderDashboardErrors() {
  const el = qs('#adminRecentErrors');
  if (!el) return;
  if (_adminAllErrors.length === 0) {
    el.innerHTML = '<div class="admin-empty">No errors logged yet.</div>';
    return;
  }
  el.innerHTML = _adminAllErrors.map(e => {
    const ts = new Date(e.timestamp).toLocaleString();
    return `<div class="admin-error-row" data-id="${escapeAttr(e.id)}">
      <span class="admin-error-ts">${escapeHTML(ts)}</span>
      <span class="admin-error-user">${escapeHTML(e.userEmail || 'anon')}</span>
      <span class="admin-error-msg">${escapeHTML((e.message || '').slice(0, 90))}</span>
    </div>`;
  }).join('');
}

// ─── USERS ───────────────────────────────────────────────────

async function renderAdminUsers() {
  const el = qs('#adminUsersContent');
  if (!el) return;

  if (_adminAllUsers.length === 0) {
    el.innerHTML = '<div class="admin-loading">Loading users…</div>';
    try {
      const { collection, query, orderBy, getDocs } = window.firestoreMethods;
      const snap = await getDocs(
        query(collection(window.firebaseDb, 'users'), orderBy('createdAt', 'desc'))
      );
      _adminAllUsers = [];
      snap.forEach(d => _adminAllUsers.push({ uid: d.id, ...d.data() }));
    } catch (err) {
      el.innerHTML = `<div class="admin-empty">Error: ${escapeHTML(err.message)}</div>`;
      return;
    }
  }

  const q        = (qs('#adminUserSearch')?.value || '').toLowerCase();
  const filtered = q
    ? _adminAllUsers.filter(u =>
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q))
    : _adminAllUsers;

  if (filtered.length === 0) {
    el.innerHTML = '<div class="admin-empty">No users match.</div>';
    return;
  }

  el.innerHTML = filtered.map(u => {
    const initials  = (u.displayName || '?').slice(0, 2).toUpperCase();
    const avatarHtml = u.avatarUrl
      ? `<img src="${escapeAttr(u.avatarUrl)}" alt="" onerror="this.style.display='none'">`
      : initials;
    const joined   = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—';
    const lastSeen = u.lastSeen  ? new Date(u.lastSeen).toLocaleDateString()  : '—';
    return `
      <div class="admin-user-row" data-uid="${escapeAttr(u.uid)}">
        <div class="setup-avatar setup-avatar-sm">${avatarHtml}</div>
        <div class="admin-user-info">
          <div class="admin-user-name">${escapeHTML(u.displayName || '—')}</div>
          <div class="admin-user-email">${escapeHTML(u.email || '—')}</div>
        </div>
        <div class="admin-user-meta">
          <div><span class="kicker">Games</span> ${u.totalGames || 0}</div>
          <div><span class="kicker">Wins</span>  ${u.totalWins  || 0}</div>
          <div><span class="kicker">Joined</span> ${joined}</div>
          <div><span class="kicker">Seen</span>   ${lastSeen}</div>
        </div>
      </div>`;
  }).join('');
}

async function showAdminUserDetail(uid) {
  const overlay = qs('#adminUserDetail');
  const content = qs('#adminUserDetailContent');
  if (!overlay || !content) return;

  content.innerHTML = '<div class="admin-loading">Loading…</div>';
  overlay.style.display = 'flex';

  try {
    const [profile, games] = await Promise.all([
      getUserProfile(uid),
      getUserGames(uid)
    ]);

    if (!profile) {
      content.innerHTML = '<div class="admin-empty">Profile not found.</div>';
      return;
    }

    const initials  = (profile.displayName || '?').slice(0, 2).toUpperCase();
    const avatarHtml = profile.avatarUrl
      ? `<img src="${escapeAttr(profile.avatarUrl)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:50%;">`
      : `<div class="setup-avatar" style="width:64px;height:64px;font-size:24px;">${initials}</div>`;

    const winRate  = profile.totalGames > 0
      ? Math.round((profile.totalWins / profile.totalGames) * 100) : 0;
    const regDate  = profile.createdAt ? new Date(profile.createdAt).toLocaleString() : '—';
    const lastSeen = profile.lastSeen  ? new Date(profile.lastSeen).toLocaleString()  : '—';

    const gameRows = games.length === 0
      ? '<div class="admin-empty">No game history recorded.</div>'
      : games.map(g => {
          const me      = (g.players || []).find(p => p.uid === uid);
          const date    = g.endedAt ? new Date(g.endedAt).toLocaleDateString() : '—';
          const won     = me?.isWinner;
          const others  = (g.players || []).map(p => escapeHTML(p.displayName)).join(', ');
          return `<div class="admin-game-row${won ? ' admin-game-row--win' : ''}">
            <span class="mono">${date}</span>
            <span>${others}</span>
            <span class="mono">${won ? '🏆 Win' : 'Loss'} · ${me?.finalScore || 0} VP</span>
          </div>`;
        }).join('');

    content.innerHTML = `
      <div class="admin-user-detail-header">
        ${avatarHtml}
        <div>
          <div class="admin-detail-name">${escapeHTML(profile.displayName || '—')}</div>
          <div class="admin-detail-email">${escapeHTML(profile.email || '—')}</div>
          <div class="admin-detail-uid mono">${escapeHTML(uid)}</div>
        </div>
      </div>
      <div class="admin-stats-grid">
        <div class="admin-stat-card"><span class="kicker">Games</span><strong>${profile.totalGames || 0}</strong></div>
        <div class="admin-stat-card"><span class="kicker">Wins</span><strong>${profile.totalWins || 0}</strong></div>
        <div class="admin-stat-card"><span class="kicker">Win %</span><strong>${winRate}%</strong></div>
        <div class="admin-stat-card"><span class="kicker">Streak</span><strong>${profile.winStreakLongest || 0}</strong></div>
        <div class="admin-stat-card"><span class="kicker">Avg ±</span><strong>${profile.avgMargin || 0}</strong></div>
        <div class="admin-stat-card"><span class="kicker">Total VP</span><strong>${profile.totalVP || 0}</strong></div>
      </div>
      <div class="admin-meta-row"><span class="kicker">Registered:</span> ${regDate}</div>
      <div class="admin-meta-row"><span class="kicker">Last active:</span> ${lastSeen}</div>
      ${profile.catanUsername ? `<div class="admin-meta-row"><span class="kicker">Catan ID:</span> ${escapeHTML(profile.catanUsername)}</div>` : ''}
      <div class="section-title" style="margin-top:18px;">Recent Games</div>
      <div class="admin-game-list">${gameRows}</div>
    `;
  } catch (err) {
    content.innerHTML = `<div class="admin-empty">Error: ${escapeHTML(err.message)}</div>`;
  }
}

function closeAdminUserDetail() {
  const el = qs('#adminUserDetail');
  if (el) el.style.display = 'none';
}

// ─── ERRORS ──────────────────────────────────────────────────

async function renderAdminErrors() {
  const el = qs('#adminErrorsContent');
  if (!el) return;

  el.innerHTML = '<div class="admin-loading">Loading errors…</div>';

  try {
    const { collection, query, orderBy, limit, getDocs } = window.firestoreMethods;
    const snap = await getDocs(
      query(collection(window.firebaseDb, 'client_errors'), orderBy('timestamp', 'desc'), limit(100))
    );

    _adminAllErrors = [];
    snap.forEach(d => _adminAllErrors.push({ id: d.id, ...d.data() }));

    if (_adminAllErrors.length === 0) {
      el.innerHTML = '<div class="admin-empty">No errors logged yet.</div>';
      return;
    }

    el.innerHTML = _adminAllErrors.map(e => {
      const ts = new Date(e.timestamp).toLocaleString();
      return `<div class="admin-error-row admin-error-row--full" data-id="${escapeAttr(e.id)}">
        <div class="admin-error-ts">${escapeHTML(ts)}</div>
        <div class="admin-error-user">${escapeHTML(e.userEmail || 'anonymous')}</div>
        <div class="admin-error-msg">${escapeHTML((e.message || '').slice(0, 120))}</div>
      </div>`;
    }).join('');

  } catch (err) {
    el.innerHTML = `<div class="admin-empty">Error loading: ${escapeHTML(err.message)}</div>`;
  }
}

function showAdminErrorDetail(id) {
  const e = _adminAllErrors.find(x => x.id === id);
  if (!e) return;

  const overlay = qs('#adminErrorDetail');
  const content = qs('#adminErrorDetailContent');
  if (!overlay || !content) return;

  const ts = new Date(e.timestamp).toLocaleString();
  content.innerHTML = `
    <div class="admin-meta-row"><span class="kicker">Time:</span>    ${escapeHTML(ts)}</div>
    <div class="admin-meta-row"><span class="kicker">User:</span>    ${escapeHTML(e.userEmail || 'anonymous')}</div>
    <div class="admin-meta-row"><span class="kicker">UID:</span>     <span class="mono">${escapeHTML(e.uid || '—')}</span></div>
    <div class="admin-meta-row"><span class="kicker">URL:</span>     <span class="mono">${escapeHTML(e.url || '—')}</span></div>
    <div class="admin-meta-row"><span class="kicker">Source:</span>  <span class="mono">${escapeHTML(e.source || '—')}</span></div>
    <div class="section-title" style="margin-top:14px;">Message</div>
    <pre class="admin-pre">${escapeHTML(e.message || '—')}</pre>
    <div class="section-title" style="margin-top:14px;">Stack Trace</div>
    <pre class="admin-pre">${escapeHTML(e.stack || '—')}</pre>
    <div class="section-title" style="margin-top:14px;">User Agent</div>
    <pre class="admin-pre">${escapeHTML(e.userAgent || '—')}</pre>
  `;
  overlay.style.display = 'flex';
}

function closeAdminErrorDetail() {
  const el = qs('#adminErrorDetail');
  if (el) el.style.display = 'none';
}

// ─── EVENT DELEGATION ────────────────────────────────────────

function initAdminListeners() {
  const screen = qs('#adminScreen');
  if (!screen) return;

  // Tab buttons
  screen.addEventListener('click', e => {
    const tab = e.target.closest('.admin-tab');
    if (tab?.dataset.tab) { setAdminTab(tab.dataset.tab); return; }

    // User row → detail
    const userRow = e.target.closest('.admin-user-row[data-uid]');
    if (userRow) { showAdminUserDetail(userRow.dataset.uid); return; }

    // Error row → detail
    const errRow = e.target.closest('.admin-error-row[data-id]');
    if (errRow) { showAdminErrorDetail(errRow.dataset.id); return; }

    // Close overlays
    if (e.target.id === 'adminUserDetailClose')  closeAdminUserDetail();
    if (e.target.id === 'adminErrorDetailClose') closeAdminErrorDetail();
  });

  // User search
  const searchInput = qs('#adminUserSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderAdminUsers());
  }
}
