/* =============================================
   UI & RENDERING
   All display and update functions
   ============================================= */

// Toast notification
function showToast(message, type = "info") {
  const toast = qs("#toast");
  toast.textContent = message;
  toast.className = "toast";
  if (type === "success") toast.classList.add("success");
  if (type === "error") toast.classList.add("error");
  toast.classList.add("show");
  
  clearTimeout(showToast._timeout);
  showToast._timeout = setTimeout(() => {
    toast.classList.remove("show");
  }, TOAST_DURATION);
}

// Confirmation modal
let confirmCallback = null;

function showConfirm(title, message, onConfirm) {
  qs("#confirmTitle").textContent = title;
  qs("#confirmMessage").textContent = message;
  confirmCallback = onConfirm;
  qs("#confirmModal").classList.add("active");
}

function closeConfirm() {
  qs("#confirmModal").classList.remove("active");
  confirmCallback = null;
}

function handleConfirmOk() {
  if (confirmCallback) confirmCallback();
  closeConfirm();
}

// Update totals display
function updateTotals() {
  for (let i = 0; i < 4; i++) {
    const total = calcTotal(i);
    const el = qs(`#total-${i}`);
    if (el) el.textContent = String(total);
  }
  updateWinnerHighlight();
}

// Highlight winner
function updateWinnerHighlight() {
  const auto = qs("#autoWin")?.checked;
  const winPoints = Number(qs("#winPoints")?.value || 10);
  qsa(".player").forEach(el => el.classList.remove("winner"));
  if (!auto) return;

  for (let i = 0; i < 4; i++) {
    if (calcTotal(i) >= winPoints) {
      const el = qs(`.player[data-player-index="${i}"]`);
      if (el) el.classList.add("winner");
    }
  }
}

// Apply turn highlight
function applyTurnHighlight() {
  qsa(".player").forEach(el => el.classList.remove("active-turn"));
  const current = qs(`.player[data-player-index="${turnIndex}"]`);
  if (current) current.classList.add("active-turn");
  qs("#turnText").textContent = `P${turnIndex + 1}`;
}

// Render round UI
function renderRoundUI() {
  const pill = qs("#roundPill");
  const text = qs("#roundText");
  if (roundEnabled) {
    pill.style.display = "inline-flex";
    text.textContent = String(roundCount);
  } else {
    pill.style.display = "none";
  }
}

// Apply pause UI
function applyPauseUI() {
  const disabled = paused;
  const disableIds = [
    "#rollBtn", "#resetDiceBtn", "#resetScoresBtn", "#endGameBtn",
    "#addManualBtn", "#manualTotal",
    "#winPoints", "#autoWin", "#ruleset", "#boardTitle",
    "#clearHistoryBtn",
    "#exportNowBtn", "#createSnapshotBtn", "#importFile", "#importBtn",
    "#autoSnapshotOnEnd",
    "#roundEnabled"
  ];
  disableIds.forEach(id => {
    const el = qs(id);
    if (el) el.disabled = disabled;
  });

  qsa(".numstep button, .numstep input, .player input[type='text'], .iconbtn, input[type='range'][data-zoom], .tag select")
    .forEach(el => { el.disabled = disabled; });

  qs("#pauseGameBtn").textContent = paused ? "▶️" : "⏸️";
  qs("#pauseGameBtn").title = paused ? "Resume (P)" : "Pause (P)";
}

// Color select markup
function colourSelectMarkup(i) {
  const current = players[i].colorKey || "red";
  return `
    <select data-colour="${i}" aria-label="Player ${i + 1} colour">
      ${COLOR_OPTIONS.map(o => `<option value="${o.key}" ${o.key === current ? "selected" : ""}>${o.label}</option>`).join("")}
    </select>
  `;
}

// Photo markup
function photoMarkup(i) {
  const p = players[i];
  const has = !!p.photo;
  return `
    <div class="turn-badge">⭐ YOUR TURN</div>
    <div class="photo ${has ? "has-image" : ""}" data-photo-box="${i}" style="height:${p.photoH}px">
      <div class="tag">
        <span class="badge" style="background:${p.color}"></span>
        <span>P${i + 1}</span>
        ${colourSelectMarkup(i)}
      </div>

      <div class="controls">
        <button class="iconbtn" data-upload="${i}" title="Upload photo">Add</button>
        <button class="iconbtn" data-clear="${i}" title="Clear photo">Clear</button>
        <button class="iconbtn" data-center="${i}" title="Center photo">Centre</button>
      </div>

      <div class="img-layer" data-pan="${i}">
        ${has ? `<img src="${p.photo}" alt="Player ${i + 1} photo" />` : ``}
      </div>

      <div class="fallback">Add a photo then drag to centre<br/><span class="small">Wheel to zoom</span></div>

      <div class="bottom-tools">
        <label>Zoom</label>
        <input type="range" min="1" max="2.5" step="0.01" value="${p.zoom}" data-zoom="${i}" aria-label="Photo zoom" />
      </div>

      <input type="file" accept="image/*" data-photo="${i}" />
      <div class="resize-handle" data-resize="${i}" title="Drag to resize photo area"></div>
    </div>
  `;
}

// Number field
function numField(title, hint, key, i, min, max) {
  const value = playerState[i][key];
  return `
    <div class="field">
      <div style="flex:1; min-width:0;">
        <label>${title}</label>
        <div class="hint">${hint}</div>
      </div>
      <div class="numstep">
        <button data-player="${i}" data-key="${key}" data-min="${min}" data-max="${max}" data-dir="-1" aria-label="Decrease ${title}">-</button>
        <input class="mono" type="number" value="${value}" min="${min}" max="${max}" data-player="${i}" data-key="${key}" aria-label="${title}" />
        <button data-player="${i}" data-key="${key}" data-min="${min}" data-max="${max}" data-dir="1" aria-label="Increase ${title}">+</button>
      </div>
    </div>
  `;
}

// Toggle field
function toggleField(title, hint, key, i) {
  const checked = playerState[i][key] ? "checked" : "";
  return `
    <div class="field">
      <div style="flex:1; min-width:0;">
        <label>${title}</label>
        <div class="hint">${hint}</div>
      </div>
      <div class="numstep">
        <input type="checkbox" ${checked} data-player="${i}" data-key="${key}" style="width:auto; transform:scale(1.2)" aria-label="${title}" />
      </div>
    </div>
  `;
}

// Render players
function renderPlayers() {
  normalizePlayerColours();
  const container = qs("#players");
  container.innerHTML = "";

  const ruleset = getRuleset();

  players.forEach((p, i) => {
    const total = calcTotal(i);

    const el = document.createElement("div");
    el.className = "player";
    el.dataset.playerIndex = String(i);

    el.style.setProperty("--pcol", p.color);
    el.style.setProperty("--pcolSoft", hexToRgba(p.color, 0.28));

    el.innerHTML = `
      ${photoMarkup(i)}
      <div class="top">
        <input type="text" value="${escapeAttr(p.name)}" aria-label="Player ${i + 1} name" maxlength="50" />
        <div class="total">
          <span>VP</span>
          <span class="num mono" id="total-${i}">${total}</span>
        </div>
      </div>

      <div class="body">
        <div class="fields">
          ${ruleset === "base" ? `
            ${numField("Settlements", "1 VP each", "settlements", i, 0, 12)}
            ${numField("Cities", "2 VP each", "cities", i, 0, 12)}
            ${numField("VP dev cards", "1 VP each", "vpCards", i, 0, 20)}
            ${toggleField("Longest Road", "2 VP", "longestRoad", i)}
            ${toggleField("Largest Army", "2 VP", "largestArmy", i)}
            ${numField("Special VP", "House rules", "specialVP", i, 0, 99)}
          ` : `
            ${numField("Harbour settlements", "1 VP each", "harbourSettlements", i, 0, 30)}
            ${numField("Harbour cities", "2 VP each", "harbourCities", i, 0, 30)}
            ${numField("Pirate lairs", "1 VP each", "pirateLairs", i, 0, 30)}
            ${numField("VP tokens", "Add the VP you earned", "vpTokens", i, 0, 99)}
            ${numField("Special VP", "House rules", "specialVP", i, 0, 99)}
          `}
        </div>
      </div>
    `;

    // Player name input
    el.querySelector('input[type="text"]').addEventListener("input", (e) => {
      if (paused) return;
      snapshot("Rename player");
      players[i].name = e.target.value.slice(0, 50) || `Player ${i + 1}`;
      saveAll();
    });

    // Color selector
    const colourSel = el.querySelector(`select[data-colour="${i}"]`);
    colourSel.addEventListener("change", (e) => {
      if (paused) return;
      snapshot("Change colour");
      const key = e.target.value;
      players[i].colorKey = key;
      players[i].color = colorFromKey(key);
      saveAll();
      renderPlayers();
      renderRoundUI();
    });

    // Photo upload
    const fileInput = el.querySelector(`input[type="file"][data-photo="${i}"]`);

    el.querySelector(`[data-upload="${i}"]`).addEventListener("click", () => {
      if (paused) return;
      fileInput.click();
    });

    el.querySelector(`[data-clear="${i}"]`).addEventListener("click", () => {
      if (paused) return;
      snapshot("Clear photo");
      players[i].photo = "";
      players[i].panX = 0;
      players[i].panY = 0;
      players[i].zoom = 1.25;
      players[i].natW = 0;
      players[i].natH = 0;
      saveAll();
      renderAll();
    });

    el.querySelector(`[data-center="${i}"]`).addEventListener("click", () => {
      if (paused) return;
      snapshot("Centre photo");
      players[i].panX = 0;
      players[i].panY = 0;
      saveAll();
      renderAll();
    });

    fileInput.addEventListener("change", async (e) => {
      if (paused) return;
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      snapshot("Upload photo");

      const result = await resizeAndCompressImage(file, MAX_PHOTO_SIZE, PHOTO_QUALITY);

      players[i].photo = result.dataUrl;
      players[i].natW = result.w;
      players[i].natH = result.h;
      players[i].panX = 0;
      players[i].panY = 0;
      players[i].zoom = 1.35;

      fileInput.value = "";

      renderAll();
      saveAll();
    });

    container.appendChild(el);
  });

  applyTurnHighlight();
  updateTotals();
  attachPhotoInteractions();
  applyPauseUI();

  for (let i = 0; i < 4; i++) {
    if (players[i].photo) {
      applyPhotoStyles(i);
    }
  }
}

// Image resize and compress
async function resizeAndCompressImage(file, maxSide, quality) {
  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;

  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);

  const out = canvas.toDataURL("image/jpeg", quality);
  return { dataUrl: out, w, h };
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Photo interaction helpers
function getCoverBaseSize(i, boxW, boxH) {
  const p = players[i];
  const nw = p.natW || 0;
  const nh = p.natH || 0;
  if (nw <= 0 || nh <= 0 || boxW <= 0 || boxH <= 0) {
    return { baseW: boxW, baseH: boxH };
  }
  const scale = Math.max(boxW / nw, boxH / nh);
  return { baseW: nw * scale, baseH: nh * scale };
}

function clampPanToCover(i) {
  const box = qs(`[data-photo-box="${i}"]`);
  if (!box) return;

  const boxW = box.clientWidth;
  const boxH = box.clientHeight;
  const z = players[i].zoom || 1.25;

  const { baseW, baseH } = getCoverBaseSize(i, boxW, boxH);
  const effW = baseW * z;
  const effH = baseH * z;

  const maxX = Math.max(0, (effW - boxW) / 2);
  const maxY = Math.max(0, (effH - boxH) / 2);

  players[i].panX = clamp(players[i].panX || 0, -maxX, maxX);
  players[i].panY = clamp(players[i].panY || 0, -maxY, maxY);
}

function applyPhotoStyles(i) {
  const box = qs(`[data-photo-box="${i}"]`);
  if (!box) return;

  if (players[i].photo) {
    box.classList.add("has-image");
  } else {
    box.classList.remove("has-image");
  }

  const img = box.querySelector("img");
  if (!img) return;

  const boxW = box.clientWidth;
  const boxH = box.clientHeight;
  const z = players[i].zoom || 1.25;

  const { baseW, baseH } = getCoverBaseSize(i, boxW, boxH);
  const effW = baseW * z;
  const effH = baseH * z;

  clampPanToCover(i);

  img.style.width = effW + "px";
  img.style.height = effH + "px";
  img.style.transform = `translate(calc(-50% + ${players[i].panX}px), calc(-50% + ${players[i].panY}px))`;
}

function getPoint(e) {
  if (e.touches && e.touches[0]) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

// Attach photo interactions
function attachPhotoInteractions() {
  // Zoom sliders
  qsa("[data-zoom]").forEach((range) => {
    const i = Number(range.getAttribute("data-zoom"));
    range.addEventListener("input", (e) => {
      if (paused) return;
      snapshot("Photo zoom");
      players[i].zoom = clamp(Number(e.target.value), 1, 2.5);
      applyPhotoStyles(i);
      saveAll();
    });
  });

  // Wheel zoom
  qsa("[data-photo-box]").forEach((box) => {
    const i = Number(box.getAttribute("data-photo-box"));
    box.addEventListener("wheel", (e) => {
      if (paused) return;
      if (!players[i].photo) return;
      e.preventDefault();

      snapshot("Photo zoom");
      const delta = Math.sign(e.deltaY) * -0.06;
      players[i].zoom = clamp((players[i].zoom || 1.25) + delta, 1, 2.5);

      const range = qs(`[data-zoom="${i}"]`);
      if (range) range.value = String(players[i].zoom);

      applyPhotoStyles(i);
      saveAll();
    }, { passive: false });
  });

  // Pan (drag)
  qsa("[data-pan]").forEach((layer) => {
    const i = Number(layer.getAttribute("data-pan"));
    const box = qs(`[data-photo-box="${i}"]`);
    if (!box) return;

    let dragging = false;
    let startX = 0, startY = 0;
    let baseX = 0, baseY = 0;

    const onDown = (e) => {
      if (paused) return;
      if (!players[i].photo) return;
      dragging = true;
      box.classList.add("dragging");
      const pt = getPoint(e);
      startX = pt.x;
      startY = pt.y;
      baseX = players[i].panX || 0;
      baseY = players[i].panY || 0;
      snapshot("Photo pan");
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!dragging) return;
      const pt = getPoint(e);
      players[i].panX = baseX + (pt.x - startX);
      players[i].panY = baseY + (pt.y - startY);
      applyPhotoStyles(i);
      e.preventDefault();
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      box.classList.remove("dragging");
      saveAll();
    };

    layer.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    layer.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  });

  // Resize handle
  qsa("[data-resize]").forEach((handle) => {
    const i = Number(handle.getAttribute("data-resize"));
    const box = qs(`[data-photo-box="${i}"]`);
    if (!box) return;

    let resizing = false;
    let startY = 0;
    let startH = 0;

    const onDown = (e) => {
      if (paused) return;
      resizing = true;
      const pt = getPoint(e);
      startY = pt.y;
      startH = players[i].photoH || 180;
      snapshot("Resize photo");
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!resizing) return;
      const pt = getPoint(e);
      const next = clamp(startH + (pt.y - startY), MIN_PHOTO_HEIGHT, MAX_PHOTO_HEIGHT);
      players[i].photoH = next;
      box.style.height = next + "px";
      applyPhotoStyles(i);
      e.preventDefault();
    };

    const onUp = () => {
      if (!resizing) return;
      resizing = false;
      saveAll();
    };

    handle.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    handle.addEventListener("touchstart", onDown, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  });
}

// Render all
function renderAll() {
  renderPlayers();
  qs("#timerText").textContent = formatTime(elapsedMs);
  qs("#rollCount").textContent = String(totalRolls);
  setLastRollDisplay(rollLog.length ? rollLog[rollLog.length - 1] : null);
  drawCharts();
  updateDiceStats();
  applyTurnHighlight();
  renderRoundUI();
  applyPauseUI();
  updateUndoUI();
}