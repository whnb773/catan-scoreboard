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
    snapshot("Start");
    startTimer();
    saveAll();
    showToast("Timer started", "success");
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

  console.log("Catan Scoreboard initialized successfully!");
}

// Start the app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}