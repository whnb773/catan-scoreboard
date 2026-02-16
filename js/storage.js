/* =============================================
   STORAGE
   Save/load game state to localStorage
   ============================================= */

// Export current state to object
function exportState() {
  return {
    appVersion: "v12_improved",
    title: qs("#boardTitle")?.value || "Catan Scoreboard",
    winPoints: Number(qs("#winPoints")?.value || 10),
    autoWin: !!qs("#autoWin")?.checked,
    ruleset: qs("#ruleset")?.value || "base",
    players,
    playerState,
    turnIndex,
    round: { enabled: !!roundEnabled, count: Number(roundCount || 1) },
    dice: { counts, totalRolls, playerRolls, rollLog },
    timer: { paused, running, elapsedMs },
    history,
    backupSettings
  };
}

// Load state from localStorage
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Save state to localStorage
function persist(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn("Save failed:", err);
    return false;
  }
}

// Save all current data
function saveAll() {
  const ok = persist(exportState());
  if (!ok) {
    showToast("Save failed. Storage may be full.", "error");
  }
}

// Import state from object
function importState(s) {
  if (!s) return;

  if (typeof s.title === "string") qs("#boardTitle").value = s.title.slice(0, 100);
  if (typeof s.winPoints === "number") qs("#winPoints").value = String(clamp(s.winPoints, 1, 50));
  if (typeof s.autoWin === "boolean") qs("#autoWin").checked = s.autoWin;
  if (typeof s.ruleset === "string") qs("#ruleset").value = (s.ruleset === "eap") ? "eap" : "base";

  if (s.round) {
    roundEnabled = !!s.round.enabled;
    roundCount = clamp(Number(s.round.count || 1), 1, 9999);
  } else {
    roundEnabled = false;
    roundCount = 1;
  }
  qs("#roundEnabled").checked = roundEnabled;

  if (s.backupSettings) {
    if (typeof s.backupSettings.autoSnapshotOnEnd === "boolean") {
      backupSettings.autoSnapshotOnEnd = s.backupSettings.autoSnapshotOnEnd;
    }
    if (typeof s.backupSettings.maxSnapshots === "number") {
      backupSettings.maxSnapshots = clamp(s.backupSettings.maxSnapshots, 1, 50);
    }
  }
  qs("#autoSnapshotOnEnd").checked = backupSettings.autoSnapshotOnEnd;

  if (Array.isArray(s.players) && s.players.length === 4) {
    for (let i = 0; i < 4; i++) {
      const p = s.players[i] || {};
      players[i].name = typeof p.name === "string" ? p.name : players[i].name;

      if (typeof p.colorKey === "string" && COLOR_OPTIONS.some(o => o.key === p.colorKey)) {
        players[i].colorKey = p.colorKey;
      } else if (typeof p.color === "string") {
        const match = COLOR_OPTIONS.find(o => o.hex.toLowerCase() === p.color.toLowerCase());
        if (match) players[i].colorKey = match.key;
      }

      players[i].color = colorFromKey(players[i].colorKey);
      players[i].photo = typeof p.photo === "string" ? p.photo : players[i].photo;
      players[i].photoH = typeof p.photoH === "number" ? clamp(p.photoH, 140, 420) : players[i].photoH;
      players[i].panX = typeof p.panX === "number" ? p.panX : 0;
      players[i].panY = typeof p.panY === "number" ? p.panY : 0;
      players[i].zoom = typeof p.zoom === "number" ? clamp(p.zoom, 1, 2.5) : players[i].zoom;
      players[i].natW = typeof p.natW === "number" ? p.natW : players[i].natW;
      players[i].natH = typeof p.natH === "number" ? p.natH : players[i].natH;
    }
  }

  normalizePlayerColours();

  if (Array.isArray(s.playerState) && s.playerState.length === 4) {
    for (let i = 0; i < 4; i++) {
      const sc = s.playerState[i] || {};
      playerState[i] = {
        settlements: Number(sc.settlements || 0),
        cities: Number(sc.cities || 0),
        vpCards: Number(sc.vpCards || 0),
        longestRoad: Number(sc.longestRoad || 0),
        largestArmy: Number(sc.largestArmy || 0),
        harbourSettlements: Number(sc.harbourSettlements || 0),
        harbourCities: Number(sc.harbourCities || 0),
        pirateLairs: Number(sc.pirateLairs || 0),
        vpTokens: Number(sc.vpTokens || 0),
        specialVP: Number(sc.specialVP || 0)
      };
    }
  }

  if (typeof s.turnIndex === "number") turnIndex = clamp(s.turnIndex, 0, 3);

  if (s.dice) {
    const d = s.dice;
    if (d.counts) {
      for (let t = 2; t <= 12; t++) counts[t] = Math.max(0, Number(d.counts[t] || 0));
    }
    totalRolls = Math.max(0, Number(d.totalRolls || 0));

    if (Array.isArray(d.playerRolls) && d.playerRolls.length === 4) {
      for (let i = 0; i < 4; i++) {
        const pr = d.playerRolls[i] || {};
        playerRolls[i].total = Math.max(0, Number(pr.total || 0));
        for (let t = 2; t <= 12; t++) {
          playerRolls[i].counts[t] = Math.max(0, Number(pr.counts?.[t] || 0));
        }
      }
    }

    rollLog.length = 0;
    if (Array.isArray(d.rollLog)) d.rollLog.forEach(x => rollLog.push(x));
  }

  if (s.timer) {
    paused = !!s.timer.paused;
    running = !!s.timer.running;
    elapsedMs = Number(s.timer.elapsedMs || 0);
  }

  if (Array.isArray(s.history)) {
    history.length = 0;
    s.history.forEach(g => history.push(g));
  }
}

// Snapshot for undo
function snapshot(label) {
  undoStack.push({ label, state: exportState() });
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack.length = 0; // Clear redo stack on new action
  updateUndoUI();
}

// Undo last action
function undo() {
  if (!undoStack.length || paused) return;
  const item = undoStack.pop();
  redoStack.push(exportState()); // Save current state for redo
  importState(item.state);
  saveAll();
  renderAll();
  updateUndoUI();
  showToast("Undone: " + item.label, "success");
}

// Redo last undone action
function redo() {
  if (!redoStack.length || paused) return;
  const item = redoStack.pop();
  undoStack.push({ label: "Redo", state: exportState() });
  importState(item);
  saveAll();
  renderAll();
  updateUndoUI();
  showToast("Redone", "success");
}

// Update undo/redo button states
function updateUndoUI() {
  qs("#undoBtn").disabled = paused || (undoStack.length === 0);
  qs("#redoBtn").disabled = paused || (redoStack.length === 0);
  qs("#undoRollBtn").disabled = paused || (rollLog.length === 0);
}

// Load snapshots
function loadSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Save snapshots
function saveSnapshots(arr) {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(arr));
    return true;
  } catch (err) {
    console.warn("Snapshot save failed:", err);
    return false;
  }
}

// Create backup filename
function createBackupFilename() {
  const title = (qs("#boardTitle").value || "Catan Scoreboard")
    .replace(/[^\w\s()-]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40) || "Catan_Scoreboard";
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0")
  ].join("");
  return `${title}_backup_${stamp}.json`;
}

// Download JSON file
function downloadJSON(obj, filename) {
  const json = JSON.stringify(obj, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}