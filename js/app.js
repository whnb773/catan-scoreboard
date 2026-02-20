/* =============================================
   APP INITIALIZATION
   Main entry point - sets up everything
   ============================================= */

// Timer functions
function startTimer() {
  if (paused || running) return;
  running = true;
  lastTick = Date.now();
  timerId = window.setInterval(() => {
    if (paused) return;
    const now = Date.now();
    elapsedMs += (now - lastTick);
    lastTick = now;
    qs("#timerText").textContent = formatTime(elapsedMs);
    saveAll();
  }, 250);
}

function pauseTimerInternal() {
  running = false;
  if (timerId) window.clearInterval(timerId);
  timerId = null;
}

function resetTimer() {
  if (paused) return;
  snapshot("Reset timer");
  pauseTimerInternal();
  elapsedMs = 0;
  qs("#timerText").textContent = formatTime(elapsedMs);
  saveAll();
  showToast("Timer reset", "success");
}

function setPaused(next) {
  paused = next;
  if (paused) pauseTimerInternal();
  applyPauseUI();
  saveAll();
  updateUndoUI();
  showToast(paused ? "Game paused" : "Game resumed", "success");
}

// Score handling
function attachScoreHandlers() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-dir]");
    if (!btn) return;
    if (paused) return;

    const stepId = btn.getAttribute("data-step");
    if (stepId === "winPoints") {
      snapshot("Change win points");
      const dir = Number(btn.getAttribute("data-dir"));
      const input = qs("#winPoints");
      const next = clamp(Number(input.value || 10) + dir, 1, 50);
      input.value = String(next);
      updateWinnerHighlight();
      saveAll();
      return;
    }

    const player = btn.getAttribute("data-player");
    const key = btn.getAttribute("data-key");
    if (player == null || !key) return;

    snapshot("Score change");
    const i = Number(player);
    const dir = Number(btn.getAttribute("data-dir"));
    const min = Number(btn.getAttribute("data-min") ?? 0);
    const max = Number(btn.getAttribute("data-max") ?? 999);

    const next = clamp(Number(playerState[i][key]) + dir, min, max);
    playerState[i][key] = next;

    const input = qs(`input[type="number"][data-player="${i}"][data-key="${key}"]`);
    if (input) input.value = String(next);

    updateTotals();
    saveAll();
  });

  document.addEventListener("input", (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (paused) return;

    if (input.id === "winPoints") {
      snapshot("Change win points");
      input.value = String(clamp(Number(input.value || 10), 1, 50));
      updateWinnerHighlight();
      saveAll();
      return;
    }

    if (input.id === "boardTitle") {
      snapshot("Edit title");
      saveAll();
      return;
    }

    const player = input.getAttribute("data-player");
    const key = input.getAttribute("data-key");
    if (player == null || !key) return;

    snapshot("Score edit");
    const i = Number(player);
    const min = Number(input.min || 0);
    const max = Number(input.max || 999);

    playerState[i][key] = clamp(Number(input.value || 0), min, max);
    updateTotals();
    saveAll();
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement)) return;
    if (paused) return;

    if (el.id === "autoWin" || el.id === "ruleset") {
      snapshot("Toggle setting");
      renderPlayers();
      updateTotals();
      drawCharts();
      saveAll();
      return;
    }

    if (el.id === "autoSnapshotOnEnd") {
      snapshot("Toggle auto snapshot");
      backupSettings.autoSnapshotOnEnd = !!el.checked;
      saveAll();
      return;
    }

    if (el.id === "roundEnabled") {
      snapshot("Toggle round counter");
      roundEnabled = !!el.checked;
      if (!roundCount || roundCount < 1) roundCount = 1;
      renderRoundUI();
      saveAll();
      return;
    }

    const player = el.getAttribute?.("data-player");
    const key = el.getAttribute?.("data-key");
    if (player == null || !key) return;

    snapshot("Toggle score");
    const i = Number(player);
    if (el.type === "checkbox") {
      playerState[i][key] = el.checked ? 1 : 0;
      updateTotals();
      saveAll();
    }
  });
}

// Reset scores
function resetScores() {
  if (paused) return;
  showConfirm(
    "Reset all scores?",
    "This will reset all player scores to zero. Continue?",
    () => {
      snapshot("Reset scores");
      for (let i = 0; i < 4; i++) {
        playerState[i] = {
          settlements: 0, cities: 0, vpCards: 0, longestRoad: 0, largestArmy: 0,
          harbourSettlements: 0, harbourCities: 0, pirateLairs: 0, vpTokens: 0,
          specialVP: 0
        };
      }
      saveAll();
      renderAll();
      showToast("All scores reset", "success");
    }
  );
}

// Settings modal
function openSettings() {
  qs("#settingsModal").classList.add("active");
  renderHistory();
}

function closeSettings() {
  qs("#settingsModal").classList.remove("active");
}

function setSettingsTab(tab) {
  qsa(".settings-tab").forEach(t => t.classList.remove("active"));
  qsa(".settings-content").forEach(c => c.classList.remove("active"));
  qs(`[data-settings-tab="${tab}"]`)?.classList.add("active");
  qs(`#settings-${tab}`)?.classList.add("active");
  if (tab === "profile") renderProfileTab();
  if (tab === "leaderboard") renderLeaderboard();
}

// History rendering
function renderHistory() {
  const tbody = qs("#historyTable");
  const stats = qs("#historyStats");
  
  if (!tbody || !stats) return;

  tbody.innerHTML = "";
  stats.innerHTML = "";

  if (history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="small">No games played yet.</td></tr>';
    return;
  }

  // Stats
  const games = history.length;
  const totalDuration = history.reduce((sum, g) => sum + (g.durationMs || 0), 0);
  const avgDuration = games > 0 ? totalDuration / games : 0;

  stats.innerHTML = `
    <div class="statbox">
      <div class="label">Games Played</div>
      <div class="value mono">${games}</div>
    </div>
    <div class="statbox">
      <div class="label">Avg Duration</div>
      <div class="value mono">${formatTime(avgDuration)}</div>
    </div>
  `;

  // Table
  history.slice(0, 20).forEach(g => {
    const tr = document.createElement("tr");
    const d = new Date(g.date);
    const winner = players[g.winnerIdx]?.name || "Unknown";
    const duration = g.durationMs != null ? formatTime(g.durationMs) : "-";
    
    tr.innerHTML = `
      <td>${d.toLocaleDateString()} ${d.toLocaleTimeString()}</td>
      <td>${escapeHTML(winner)}</td>
      <td class="mono">${g.margin || 0}</td>
      <td class="mono">${duration}</td>
    `;
    tbody.appendChild(tr);
  });
}

// End game
function computeEndPreview() {
  const scores = players.map((_, i) => calcTotal(i));
  const order = scores.map((s, i) => ({ i, s })).sort((a, b) => b.s - a.s);
  const winner = order[0];
  const second = order[1];
  const margin = winner.s - second.s;

  return {
    scores,
    winnerIdx: winner.i,
    margin,
    totalRolls: totalRolls,
    durationMs: elapsedMs
  };
}

function openEndConfirm() {
  if (paused) return;

  pendingEnd = computeEndPreview();

  const w = pendingEnd.winnerIdx;
  qs("#endTitle").textContent = `End game: ${players[w].name} is leading`;
  const summary = qs("#endSummary");
  summary.innerHTML = "";

  const addBox = (label, value) => {
    const div = document.createElement("div");
    div.className = "statbox";
    div.innerHTML = `<div class="label">${label}</div><div class="value mono">${value}</div>`;
    summary.appendChild(div);
  };

  addBox("Winner", `${players[pendingEnd.winnerIdx].name} (+${pendingEnd.margin})`);
  addBox("Total rolls", String(pendingEnd.totalRolls));
  addBox("Duration", formatTime(pendingEnd.durationMs));

  qs("#endModal").classList.add("active");
}

function closeEndConfirm() {
  qs("#endModal").classList.remove("active");
  pendingEnd = null;
}

function finalizeEndGame() {
  if (paused) return;
  if (!pendingEnd) pendingEnd = computeEndPreview();

  snapshot("End game");

  const p = pendingEnd;

  history.unshift({
    date: new Date().toISOString(),
    winnerIdx: p.winnerIdx,
    margin: p.margin,
    scores: p.scores,
    rolls: p.totalRolls,
    durationMs: p.durationMs
  });

  saveAll();
  renderHistory();
  closeEndConfirm();

  // Fire-and-forget cloud game record
  const user = getCurrentUser();
  if (user) {
    saveGameRecord(p, players, {
      ruleset: getRuleset(),
      winningPoints: Number(qs("#winPoints")?.value || 10)
    }).catch(err => console.error('saveGameRecord failed:', err));
  }

  showVictory(p.winnerIdx, p.margin, p.scores);
}

// Victory overlay
function createConfettiBurst() {
  const layer = qs("#confettiLayer");
  if (!layer) return;
  layer.innerHTML = "";
  const colours = ["#1f6bd6", "#f59e0b", "#d73c2c", "#f8fafc", "#b53a2a", "#5a3c24"];

  const pieces = 120;
  for (let i = 0; i < pieces; i++) {
    const c = document.createElement("div");
    c.className = "confetti";
    const left = Math.random() * 100;
    const dur = 2.2 + Math.random() * 1.8;
    const delay = Math.random() * 0.35;
    const col = colours[Math.floor(Math.random() * colours.length)];
    const sizeW = 6 + Math.random() * 8;
    const sizeH = 8 + Math.random() * 12;
    c.style.left = left + "vw";
    c.style.background = col;
    c.style.width = sizeW + "px";
    c.style.height = sizeH + "px";
    c.style.animationDuration = dur + "s";
    c.style.animationDelay = delay + "s";
    layer.appendChild(c);
  }

  window.setTimeout(() => { layer.innerHTML = ""; }, 4200);
}

function showVictory(winnerIdx, margin, finalScores) {
  const overlay = qs("#victoryOverlay");
  const title = qs("#victoryTitle");
  const sub = qs("#victorySub");
  const photo = qs("#victoryPhoto");
  const photoWrap = qs("#victoryPhotoWrap");
  const scoresEl = qs("#victoryScores");

  title.textContent = `${players[winnerIdx].name} wins!`;
  sub.textContent = `Margin: ${margin}`;

  const src = players[winnerIdx].photo || "";
  if (src) {
    photo.src = src;
    photo.style.display = "block";
    photoWrap.style.display = "block";
  } else {
    photo.removeAttribute("src");
    photo.style.display = "none";
    photoWrap.style.display = "block";
  }

  const scoreLines = finalScores
    .map((s, i) => `${players[i].name}: ${s}`)
    .join("\n");
  scoresEl.textContent = scoreLines;

  overlay.classList.add("active");
  createConfettiBurst();
}

function closeVictory() {
  qs("#victoryOverlay").classList.remove("active");
}

// Backup/Export
function exportBackup() {
  if (paused) return;
  const data = exportState();
  downloadJSON(data, createBackupFilename());
  showToast("Backup exported", "success");
}

function createSnapshot() {
  if (paused) return;
  const snaps = loadSnapshots();
  const s = exportState();

  const meta = {
    id: Date.now() + "_" + Math.random().toString(16).slice(2),
    createdAt: new Date().toISOString(),
    title: s.title || "",
    games: Array.isArray(s.history) ? s.history.length : 0,
    rolls: Number(s.dice?.totalRolls || 0),
    reason: "Manual snapshot",
    payload: s
  };

  snaps.unshift(meta);
  const limit = clamp(Number(backupSettings.maxSnapshots || 10), 1, 50);
  if (snaps.length > limit) snaps.splice(limit);

  const ok = saveSnapshots(snaps);
  if (!ok) {
    showToast("Snapshot failed", "error");
  } else {
    showToast("Snapshot created", "success");
  }
}

async function importBackup() {
  if (paused) return;
  const input = qs("#importFile");
  const file = input.files && input.files[0];
  if (!file) {
    showToast("Choose a .json backup file first", "error");
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!data || typeof data !== "object" || !Array.isArray(data.players)) {
      showToast("Invalid backup file", "error");
      return;
    }

    snapshot("Import backup");
    importState(data);
    saveAll();
    renderAll();
    showToast("Backup imported", "success");
    input.value = "";
  } catch (err) {
    showToast("Import failed: " + err.message, "error");
  }
}

function clearHistory() {
  if (paused) return;
  showConfirm(
    "Clear history?",
    "This will delete all game history. Continue?",
    () => {
      snapshot("Clear history");
      history.length = 0;
      saveAll();
      renderHistory();
      showToast("History cleared", "success");
    }
  );
}

// =============================================================
// HOST / JOIN SCREEN
// =============================================================

let _hjLobbyId  = null;   // active lobby doc ID
let _hjLobbyUnsub = null; // real-time listener unsubscribe fn
let _hjIsHost   = false;  // true when this client created the lobby

// Show one sub-view within the host/join screen
function showHostJoinView(view) {
  ['hjChoose', 'hjHosting', 'hjJoining', 'hjWaiting'].forEach(id => {
    const el = qs('#' + id);
    if (el) el.style.display = id === view ? 'block' : 'none';
  });
}

// Show the "continue saved game" link if local state exists
function checkForSavedGame() {
  const saved = loadState();
  const wrap = qs('#hjContinueWrap');
  if (wrap) wrap.style.display = saved ? 'block' : 'none';
}

// Clean up listener and lobby tracking state
function cleanupLobby() {
  if (_hjLobbyUnsub) { _hjLobbyUnsub(); _hjLobbyUnsub = null; }
  _hjLobbyId = null;
  _hjIsHost  = false;
}

// ─── HOST ─────────────────────────────────────────────────────

async function startHosting() {
  const user = getCurrentUser();
  if (!user) return;

  const btn = qs('#hjHostBtn');
  btn.disabled = true;
  btn.textContent = 'Creating lobby…';

  try {
    const { id, pin } = await createLobby(user);
    _hjLobbyId = id;
    _hjIsHost  = true;

    showHostJoinView('hjHosting');
    qs('#hjPinDisplay').textContent = pin;

    // QR code (encodes just the PIN so joiners can scan → type it)
    const qrContainer = qs('#hjQrCode');
    qrContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
      new QRCode(qrContainer, {
        text: pin,
        width: 128, height: 128,
        colorDark: '#3b2616', colorLight: '#f6edd8'
      });
    }

    // Live player list
    _hjLobbyUnsub = listenToLobby(id, lobby => {
      renderLobbyPlayers(lobby.players);
      if (lobby.status === 'ended') {
        cleanupLobby();
        showHostJoinView('hjChoose');
      }
    });

  } catch (err) {
    console.error('createLobby error:', err);
    showToast('Failed to create lobby: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = '🏠\u00a0 Host a Game';
  }
}

function renderLobbyPlayers(lobbyPlayers) {
  const container = qs('#hjLobbyPlayers');
  if (!container) return;
  if (!lobbyPlayers || lobbyPlayers.length === 0) {
    container.innerHTML = '<div class="hj-lobby-empty">Waiting for players to join…</div>';
    return;
  }
  container.innerHTML = lobbyPlayers.map(p => `
    <div class="hj-lobby-player">
      <div class="setup-avatar setup-avatar-sm" style="flex-shrink:0">
        ${p.avatarUrl
          ? `<img src="${escapeAttr(p.avatarUrl)}" alt="" onerror="this.style.display='none'">`
          : (p.displayName || '?').slice(0, 2).toUpperCase()}
      </div>
      <span>${escapeHTML(p.displayName)}</span>
      ${p.isHost ? '<span class="hj-host-tag">Host</span>' : ''}
    </div>
  `).join('');
}

async function cancelHosting() {
  if (_hjLobbyId) {
    try { await endLobby(_hjLobbyId); } catch (e) { console.warn(e); }
  }
  cleanupLobby();
  showHostJoinView('hjChoose');
}

async function hostStartGame() {
  if (!_hjLobbyId) return;

  const btn = qs('#hjStartGameBtn');
  btn.disabled = true;
  btn.textContent = 'Starting…';

  try {
    // Fetch current lobby players and apply to game state
    const { doc, getDoc } = window.firestoreMethods;
    const snap = await getDoc(doc(window.firebaseDb, 'lobbies', _hjLobbyId));
    if (snap.exists()) {
      const lobbyPlayers = snap.data().players;
      for (let i = 0; i < Math.min(lobbyPlayers.length, 4); i++) {
        const p = lobbyPlayers[i];
        players[i].name = p.displayName;
        players[i].uid  = p.uid;
        if (!players[i].photo && p.avatarUrl) players[i].photo = p.avatarUrl;
      }
    }

    // Mark lobby active → triggers joined players' listeners
    await startLobbyGame(_hjLobbyId);

    cleanupLobby();
    showScreen('game');
    startTimer();
    renderAll();
    saveAll();
    showToast('Game started!', 'success');

  } catch (err) {
    console.error('hostStartGame error:', err);
    showToast('Failed to start game: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Start Game →';
  }
}

// ─── JOIN ─────────────────────────────────────────────────────

function showJoinView() {
  showHostJoinView('hjJoining');
  const input = qs('#hjPinInput');
  if (input) { input.value = ''; input.focus(); }
}

async function submitPin() {
  const raw = (qs('#hjPinInput')?.value || '').trim();
  if (!/^\d{6}$/.test(raw)) {
    showToast('Enter a 6-digit PIN', 'error');
    return;
  }

  const btn = qs('#hjSubmitPinBtn');
  btn.disabled = true;
  btn.textContent = 'Joining…';

  try {
    const lobby = await findLobbyByPin(raw);
    if (!lobby) {
      showToast('PIN not found or expired', 'error');
      btn.disabled = false;
      btn.textContent = 'Join Game →';
      return;
    }

    const user = getCurrentUser();
    await joinLobby(lobby.id, user);
    _hjLobbyId = lobby.id;
    _hjIsHost  = false;

    const myEntry = lobby.players.find(p => p.uid === user.uid);
    const myName  = myEntry?.displayName || user.displayName || user.email;
    const nameEl  = qs('#hjWaitingName');
    if (nameEl) nameEl.textContent = `You joined as ${myName}`;

    showHostJoinView('hjWaiting');

    // Listen for host starting the game
    _hjLobbyUnsub = listenToLobby(lobby.id, updatedLobby => {
      if (updatedLobby.status === 'active') {
        const myData = updatedLobby.players.find(p => p.uid === user.uid);
        const pvName = qs('#pvPlayerName');
        if (pvName) pvName.textContent = myData?.displayName || user.displayName || user.email;
        cleanupLobby();
        showScreen('playerView');
      } else if (updatedLobby.status === 'ended') {
        showToast('Lobby was closed by the host', 'error');
        cleanupLobby();
        showHostJoinView('hjChoose');
      }
    });

  } catch (err) {
    console.error('submitPin error:', err);
    showToast('Failed to join: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Join Game →';
  }
}

async function leaveWaitingLobby() {
  const user = getCurrentUser();
  if (_hjLobbyId && user) {
    try { await leavePlayerFromLobby(_hjLobbyId, user.uid); } catch (e) { console.warn(e); }
  }
  cleanupLobby();
  showHostJoinView('hjChoose');
}

// ─── PLAYER VIEW ──────────────────────────────────────────────

function leavePlayerView() {
  showScreen('hostjoin');
  showHostJoinView('hjChoose');
}

// =============================================================
// GAME SETUP MODAL
// =============================================================

// Per-slot state for the setup modal: array of 4 { uid, displayName, avatarUrl, colourPref } | null
let setupSlotData = [null, null, null, null];
let setupSearchTimers = [null, null, null, null];

function openSetupModal() {
  setupSlotData = [null, null, null, null];

  // Pre-fill slot 0 with the logged-in user's profile
  const profile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
  const user = getCurrentUser();
  if (profile) {
    setupSlotData[0] = { uid: user.uid, displayName: profile.displayName, avatarUrl: profile.avatarUrl, colourPref: profile.colourPref };
  } else if (user) {
    setupSlotData[0] = { uid: user.uid, displayName: user.displayName || user.email, avatarUrl: user.photoURL || '', colourPref: '#1f6bd6' };
  }

  renderSetupSlots();
  qs("#setupModal").classList.add("active");
}

function closeSetupModal() {
  qs("#setupModal").classList.remove("active");
}

function renderSetupSlots() {
  const container = qs("#setupSlots");
  container.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    container.appendChild(buildSetupSlot(i));
  }
}

function buildSetupSlot(i) {
  const d = setupSlotData[i];
  const isHost = i === 0;
  const colourOpts = COLOR_OPTIONS.map(c =>
    `<option value="${c.hex}" ${d?.colourPref === c.hex ? 'selected' : ''}>${c.name || c.hex}</option>`
  ).join('');

  const wrapper = document.createElement("div");
  wrapper.className = "setup-slot";
  wrapper.dataset.slot = i;

  if (d) {
    // Filled slot — show avatar + name + colour + clear button
    const initials = (d.displayName || '?').slice(0, 2).toUpperCase();
    wrapper.innerHTML = `
      <div class="setup-slot-filled">
        <div class="setup-avatar" style="background:${d.colourPref || '#ccc'}">
          ${d.avatarUrl ? `<img src="${escapeAttr(d.avatarUrl)}" alt="" onerror="this.style.display='none'">` : initials}
        </div>
        <div class="setup-slot-info">
          <div class="setup-slot-name">${escapeHTML(d.displayName)}</div>
          <div class="setup-slot-meta">${isHost ? 'Host' : 'Player ' + (i + 1)}</div>
        </div>
        <select class="setup-colour-select" data-slot="${i}" aria-label="Colour">${colourOpts}</select>
        ${isHost ? '' : `<button class="btn secondary setup-clear-btn" data-slot="${i}" style="padding:4px 10px;font-size:12px;">✕</button>`}
      </div>
    `;
  } else {
    // Empty slot — show search input + guest button
    wrapper.innerHTML = `
      <div class="setup-slot-empty">
        <div class="setup-slot-label">Player ${i + 1}</div>
        <div class="setup-slot-search-wrap">
          <input type="text" class="setup-search-input" data-slot="${i}" placeholder="Search by name…" autocomplete="off" />
          <div class="setup-search-results" data-slot="${i}" style="display:none;"></div>
        </div>
        <button class="btn secondary setup-guest-btn" data-slot="${i}" style="padding:4px 10px;font-size:12px;">Guest</button>
      </div>
    `;
  }

  // Attach event handlers
  if (d) {
    if (!isHost) {
      wrapper.querySelector('.setup-clear-btn')?.addEventListener('click', () => {
        setupSlotData[i] = null;
        renderSetupSlots();
      });
    }
    wrapper.querySelector('.setup-colour-select')?.addEventListener('change', (e) => {
      setupSlotData[i].colourPref = e.target.value;
    });
  } else {
    const input = wrapper.querySelector('.setup-search-input');
    const resultsEl = wrapper.querySelector('.setup-search-results');

    input?.addEventListener('input', () => {
      clearTimeout(setupSearchTimers[i]);
      const q = input.value.trim();
      if (q.length < 1) { resultsEl.style.display = 'none'; return; }
      setupSearchTimers[i] = setTimeout(async () => {
        const results = await searchUsers(q);
        if (results.length === 0) {
          resultsEl.innerHTML = '<div class="setup-search-no-results">No players found</div>';
        } else {
          resultsEl.innerHTML = results.map(r => `
            <div class="setup-search-item" data-uid="${escapeAttr(r.uid)}"
              data-name="${escapeAttr(r.displayName)}"
              data-avatar="${escapeAttr(r.avatarUrl || '')}"
              data-colour="${escapeAttr(r.colourPref || '#1f6bd6')}">
              <div class="setup-avatar setup-avatar-sm" style="background:${r.colourPref || '#ccc'}">
                ${r.avatarUrl ? `<img src="${escapeAttr(r.avatarUrl)}" alt="" onerror="this.style.display='none'">` : (r.displayName || '?').slice(0, 2).toUpperCase()}
              </div>
              <span>${escapeHTML(r.displayName)}</span>
            </div>
          `).join('');
        }
        resultsEl.style.display = 'block';

        resultsEl.querySelectorAll('.setup-search-item').forEach(item => {
          item.addEventListener('click', () => {
            setupSlotData[i] = {
              uid: item.dataset.uid,
              displayName: item.dataset.name,
              avatarUrl: item.dataset.avatar,
              colourPref: item.dataset.colour
            };
            renderSetupSlots();
          });
        });
      }, 300);
    });

    wrapper.querySelector('.setup-guest-btn')?.addEventListener('click', () => {
      setupSlotData[i] = { uid: null, displayName: 'Guest ' + (i + 1), avatarUrl: '', colourPref: COLOR_OPTIONS[i % COLOR_OPTIONS.length].hex };
      renderSetupSlots();
    });
  }

  return wrapper;
}

function confirmSetup() {
  snapshot("Game setup");

  // Apply slot data to players array
  for (let i = 0; i < 4; i++) {
    const d = setupSlotData[i];
    if (d) {
      players[i].name = d.displayName;
      players[i].color = d.colourPref;
      players[i].uid = d.uid || null;
      // Only set avatar as photo if no existing player photo
      if (!players[i].photo && d.avatarUrl) {
        players[i].photo = d.avatarUrl;
      }
    }
  }

  saveAll();
  renderAll();
  closeSetupModal();
  startTimer();
  showToast("Game started!", "success");
}

// =============================================================
// PROFILE TAB
// =============================================================

async function renderProfileTab() {
  const el = qs("#profileContent");
  const user = getCurrentUser();

  if (!user) {
    el.innerHTML = '<div class="small" style="font-weight:900; opacity:.6;">Sign in to view your profile.</div>';
    return;
  }

  el.innerHTML = '<div class="small" style="opacity:.6;">Loading…</div>';

  const [profile, games] = await Promise.all([
    getUserProfile(user.uid),
    getUserGames(user.uid)
  ]);

  if (!profile) {
    el.innerHTML = '<div class="small" style="font-weight:900; opacity:.6;">Profile not found.</div>';
    return;
  }

  const winRate = profile.totalGames > 0
    ? Math.round((profile.totalWins / profile.totalGames) * 100)
    : 0;

  const initials = (profile.displayName || '?').slice(0, 2).toUpperCase();
  const avatarHtml = profile.avatarUrl
    ? `<img src="${escapeAttr(profile.avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none'">`
    : initials;

  const gamesHtml = games.length === 0
    ? '<tr><td colspan="5" class="small">No games yet.</td></tr>'
    : games.map(g => {
        const mySlot = g.players?.find(p => p.uid === user.uid);
        const date = new Date(g.endedAt || g.startedAt || 0);
        const result = mySlot?.isWinner ? '🏆 Win' : 'Loss';
        return `<tr>
          <td>${date.toLocaleDateString()}</td>
          <td>${result}</td>
          <td class="mono">${mySlot?.finalScore ?? '-'}</td>
          <td class="mono">${g.margin || '-'}</td>
          <td class="mono">${formatTime(g.durationMs || 0)}</td>
        </tr>`;
      }).join('');

  el.innerHTML = `
    <div class="profile-header">
      <div class="setup-avatar setup-avatar-lg">${avatarHtml}</div>
      <div class="profile-name-wrap">
        <input id="profileDisplayName" type="text" value="${escapeAttr(profile.displayName)}"
          style="font-size:16px;font-weight:900;padding:6px 10px;border-radius:10px;border:1px solid rgba(0,0,0,.18);background:rgba(255,255,255,.8);width:100%;max-width:240px;" />
        <div class="small" style="opacity:.6;margin-top:4px;">${escapeHTML(profile.email || '')}</div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="stats-grid" style="margin-bottom:12px;">
      <div class="statbox"><div class="label">Games</div><div class="value mono">${profile.totalGames}</div></div>
      <div class="statbox"><div class="label">Wins</div><div class="value mono">${profile.totalWins}</div></div>
      <div class="statbox"><div class="label">Win Rate</div><div class="value mono">${winRate}%</div></div>
      <div class="statbox"><div class="label">Avg Margin</div><div class="value mono">${profile.avgMargin || 0}</div></div>
      <div class="statbox"><div class="label">Best Streak</div><div class="value mono">${profile.winStreakLongest || 0}</div></div>
      <div class="statbox"><div class="label">Total VP</div><div class="value mono">${profile.totalVP || 0}</div></div>
    </div>
    <div class="divider"></div>
    <h4 style="margin:8px 0;">Recent Games</h4>
    <table>
      <thead><tr><th>Date</th><th>Result</th><th>Score</th><th>Margin</th><th>Duration</th></tr></thead>
      <tbody>${gamesHtml}</tbody>
    </table>
  `;

  // Save display name on blur
  qs("#profileDisplayName")?.addEventListener("blur", async (e) => {
    const newName = e.target.value.trim();
    if (newName && newName !== profile.displayName) {
      await updateDisplayName(user.uid, newName);
      showToast("Name updated", "success");
    }
  });
}

// =============================================================
// LEADERBOARD TAB
// =============================================================

async function renderLeaderboard() {
  const el = qs("#leaderboardContent");
  const user = getCurrentUser();

  if (!user) {
    el.innerHTML = '<div class="small" style="font-weight:900; opacity:.6;">Sign in to view the leaderboard.</div>';
    return;
  }

  el.innerHTML = '<div class="small" style="opacity:.6;">Loading…</div>';

  const leaders = await loadLeaderboard();

  if (leaders.length === 0) {
    el.innerHTML = '<div class="small" style="font-weight:900; opacity:.6;">No games recorded yet.</div>';
    return;
  }

  const rows = leaders.map((p, idx) => {
    const winRate = p.totalGames > 0 ? Math.round((p.totalWins / p.totalGames) * 100) : 0;
    const initials = (p.displayName || '?').slice(0, 2).toUpperCase();
    const avatarHtml = p.avatarUrl
      ? `<img src="${escapeAttr(p.avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none'">`
      : initials;
    const lastSeen = p.lastSeen ? new Date(p.lastSeen).toLocaleDateString() : '-';
    const isMe = p.uid === user.uid;
    return `<tr${isMe ? ' style="font-weight:900;background:rgba(31,107,214,.08);"' : ''}>
      <td class="mono">${idx + 1}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="setup-avatar setup-avatar-sm">${avatarHtml}</div>
          ${escapeHTML(p.displayName)}${isMe ? ' (you)' : ''}
        </div>
      </td>
      <td class="mono">${p.totalWins || 0}</td>
      <td class="mono">${winRate}%</td>
      <td class="mono">${p.avgMargin || 0}</td>
      <td class="mono">${p.winStreakLongest || 0}</td>
      <td class="mono">${lastSeen}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Player</th><th>Wins</th><th>Win %</th><th>Avg ±</th><th>Streak</th><th>Last Played</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// Initialize app
function init() {
  console.log("Catan Scoreboard initializing...");

  // Load saved state
  const s = loadState();
  if (s) {
    importState(s);
    console.log("State loaded from localStorage");
  }

  normalizePlayerColours();

  // Render everything
  renderAll();

  // Event listeners - Header buttons
  qs("#startGameBtn").addEventListener("click", () => {
    if (paused) return;
    if (window.firebaseAuth?.currentUser) {
      openSetupModal();
    } else {
      snapshot("Start");
      startTimer();
      saveAll();
      showToast("Timer started", "success");
    }
  });

  qs("#pauseGameBtn").addEventListener("click", () => {
    snapshot(paused ? "Resume" : "Pause");
    setPaused(!paused);
  });

  qs("#resetTimerBtn").addEventListener("click", resetTimer);
  qs("#undoBtn").addEventListener("click", undo);
  qs("#redoBtn").addEventListener("click", redo);
  qs("#endGameBtn").addEventListener("click", openEndConfirm);
  qs("#settingsBtn").addEventListener("click", openSettings);

  // Dice buttons
  qs("#rollBtn").addEventListener("click", roll2d6);
  qs("#undoRollBtn").addEventListener("click", undoLastRoll);
  qs("#resetDiceBtn").addEventListener("click", resetDice);
  qs("#addManualBtn").addEventListener("click", onManualTotal);

  // Manual total - Enter key
  qs("#manualTotal").addEventListener("keydown", (e) => {
    if (e.key === "Enter") onManualTotal();
  });

  // Score buttons
  qs("#resetScoresBtn").addEventListener("click", resetScores);

  // Settings modal
  qs("#closeSettingsBtn").addEventListener("click", closeSettings);
  qsa(".settings-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      setSettingsTab(tab.getAttribute("data-settings-tab"));
    });
  });

  // History/Backup
  qs("#clearHistoryBtn").addEventListener("click", clearHistory);
  qs("#exportNowBtn").addEventListener("click", exportBackup);
  qs("#createSnapshotBtn").addEventListener("click", createSnapshot);
  qs("#importBtn").addEventListener("click", importBackup);

  // End game modal
  qs("#closeEndBtn").addEventListener("click", closeEndConfirm);
  qs("#confirmEndBtn").addEventListener("click", finalizeEndGame);
  qs("#endModal").addEventListener("click", (e) => {
    if (e.target === qs("#endModal")) closeEndConfirm();
  });

  // Victory overlay
  qs("#closeVictoryBtn").addEventListener("click", closeVictory);
  qs("#victoryOverlay").addEventListener("click", (e) => {
    if (e.target === qs("#victoryOverlay")) closeVictory();
  });

  // Confirmation modal
  qs("#confirmCancelBtn").addEventListener("click", closeConfirm);
  qs("#confirmOkBtn").addEventListener("click", handleConfirmOk);
  qs("#confirmModal").addEventListener("click", (e) => {
    if (e.target === qs("#confirmModal")) closeConfirm();
  });

  // Settings modal backdrop
  qs("#settingsModal").addEventListener("click", (e) => {
    if (e.target === qs("#settingsModal")) closeSettings();
  });

  // Dice overlay click to dismiss
  qs("#diceOverlay").addEventListener("click", () => {
    qs("#diceOverlay").classList.remove("active");
  });

  // Score handlers
  attachScoreHandlers();

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      roll2d6();
    } else if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      setPaused(!paused);
    } else if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      if (!paused) startTimer();
    } else if (e.ctrlKey && e.key === "z") {
      e.preventDefault();
      undo();
    } else if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
      e.preventDefault();
      redo();
    }
  });

  // Window resize
  window.addEventListener("resize", () => {
    drawCharts();
    for (let i = 0; i < 4; i++) {
      if (players[i].photo) applyPhotoStyles(i);
    }
  });

  // Game setup modal
  qs("#setupCancelBtn").addEventListener("click", closeSetupModal);
  qs("#setupConfirmBtn").addEventListener("click", confirmSetup);
  qs("#setupModal").addEventListener("click", (e) => {
    if (e.target === qs("#setupModal")) closeSetupModal();
  });

  // Firebase auth buttons (login screen + game panel header)
  qs("#loginBtn").addEventListener("click", signInWithGoogle);
  qs("#logoutBtn").addEventListener("click", signOutUser);
  qs("#landingSignInBtn").addEventListener("click", signInWithGoogle);

  // Host/join screen buttons
  qs("#hjHostBtn").addEventListener("click", startHosting);
  qs("#hjJoinBtn").addEventListener("click", showJoinView);
  qs("#hjContinueBtn").addEventListener("click", () => showScreen('game'));
  qs("#hjSignOutBtn").addEventListener("click", signOutUser);

  // Hosting sub-view
  qs("#hjCancelHostBtn").addEventListener("click", cancelHosting);
  qs("#hjStartGameBtn").addEventListener("click", hostStartGame);

  // Joining sub-view
  qs("#hjCancelJoinBtn").addEventListener("click", () => showHostJoinView('hjChoose'));
  qs("#hjSubmitPinBtn").addEventListener("click", submitPin);
  qs("#hjPinInput").addEventListener("keydown", e => { if (e.key === "Enter") submitPin(); });

  // Waiting sub-view
  qs("#hjLeaveBtn").addEventListener("click", leaveWaitingLobby);

  // Player view (non-host)
  qs("#pvLeaveBtn").addEventListener("click", leavePlayerView);

  // Initialize Firebase auth
  if (window.firebaseAuth) {
    initAuth();
  } else {
    console.warn('Firebase not initialized');
  }

  console.log("Catan Scoreboard initialized successfully!");
}

// Start the app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}