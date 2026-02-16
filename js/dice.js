/* =============================================
   DICE
   Dice rolling, display, and statistics
   ============================================= */

// Roll a single die (1-6)
function rollDie() {
  return 1 + Math.floor(Math.random() * 6);
}

// Render die face
function renderDie(el, value) {
  el.innerHTML = "";
  const positions = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]],
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]]
  };
  
  if (positions[value]) {
    positions[value].forEach(([x, y]) => {
      const pip = document.createElement("div");
      pip.className = "pipdot";
      pip.style.left = x + "%";
      pip.style.top = y + "%";
      el.appendChild(pip);
    });
  }
}

// Advance turn
function advanceTurn() {
  const before = turnIndex;
  turnIndex = (turnIndex + 1) % 4;

  // Increment round when cycling back to Player 1
  let didRoundInc = false;
  if (roundEnabled && before === 3 && turnIndex === 0) {
    roundCount = clamp((roundCount || 1) + 1, 1, 9999);
    didRoundInc = true;
  }
  applyTurnHighlight();
  renderRoundUI();
  return didRoundInc;
}

// Set last roll display
function setLastRollDisplay(entry) {
  if (!entry) {
    qs("#lastRoll").textContent = "-";
    qs("#die1").innerHTML = "";
    qs("#die2").innerHTML = "";
    return;
  }
  if (entry.d1 != null && entry.d2 != null) {
    renderDie(qs("#die1"), entry.d1);
    renderDie(qs("#die2"), entry.d2);
    qs("#lastRoll").textContent = `${entry.d1} + ${entry.d2} = ${entry.total}`;
  } else {
    qs("#die1").innerHTML = "";
    qs("#die2").innerHTML = "";
    qs("#lastRoll").textContent = String(entry.total);
  }
}

// Show big dice overlay
function showDiceOverlay(d1, d2, total) {
  const overlay = qs("#diceOverlay");
  const die1 = qs("#dieBig1");
  const die2 = qs("#dieBig2");
  const totalEl = qs("#diceTotal");

  renderDie(die1, d1);
  renderDie(die2, d2);
  totalEl.textContent = `Total: ${total}`;

  overlay.classList.add("active");

  setTimeout(() => {
    overlay.classList.remove("active");
  }, DICE_OVERLAY_DURATION);
}

// Apply roll
function applyRoll(total, d1 = null, d2 = null) {
  total = Number(total);
  if (!(total >= 2 && total <= 12)) return;

  const playerBefore = turnIndex;
  const roundBefore = roundCount;

  totalRolls += 1;
  counts[total] += 1;

  playerRolls[playerBefore].total += 1;
  playerRolls[playerBefore].counts[total] += 1;

  const didRoundInc = advanceTurn();

  const entry = {
    total, d1, d2,
    playerBefore,
    roundBefore,
    didRoundInc,
    ts: Date.now()
  };
  rollLog.push(entry);

  qs("#rollCount").textContent = String(totalRolls);
  setLastRollDisplay(entry);

  drawCharts();
  saveAll();
  updateUndoUI();
}

// Roll 2d6
function roll2d6() {
  if (paused) return;
  snapshot("Roll dice");
  const d1 = rollDie();
  const d2 = rollDie();
  
  // Show big dice overlay
  showDiceOverlay(d1, d2, d1 + d2);
  
  // After animation, apply the roll
  setTimeout(() => {
    applyRoll(d1 + d2, d1, d2);
  }, 600);
}

// Manual total entry
function onManualTotal() {
  if (paused) return;
  const v = Number(qs("#manualTotal").value);
  if (!(v >= 2 && v <= 12)) return;
  snapshot("Manual roll");
  applyRoll(v, null, null);
  qs("#manualTotal").value = "";
  showToast(`Manual roll: ${v}`, "success");
}

// Undo last roll
function undoLastRoll() {
  if (paused) return;
  if (!rollLog.length) return;

  const last = rollLog.pop();
  const total = last.total;

  totalRolls = Math.max(0, totalRolls - 1);
  counts[total] = Math.max(0, counts[total] - 1);

  const p = last.playerBefore;
  playerRolls[p].total = Math.max(0, playerRolls[p].total - 1);
  playerRolls[p].counts[total] = Math.max(0, playerRolls[p].counts[total] - 1);

  turnIndex = p;

  if (last.didRoundInc) {
    roundCount = clamp((roundCount || 1) - 1, 1, 9999);
  } else if (typeof last.roundBefore === "number") {
    roundCount = clamp(last.roundBefore, 1, 9999);
  }

  applyTurnHighlight();
  renderRoundUI();

  qs("#rollCount").textContent = String(totalRolls);

  const prev = rollLog.length ? rollLog[rollLog.length - 1] : null;
  setLastRollDisplay(prev);

  drawCharts();
  saveAll();
  updateUndoUI();
  showToast("Roll undone", "success");
}

// Reset dice
function resetDice() {
  if (paused) return;
  
  showConfirm(
    "Reset dice?",
    "This will clear all dice roll statistics. Continue?",
    () => {
      snapshot("Reset dice");
      totalRolls = 0;
      for (let t = 2; t <= 12; t++) counts[t] = 0;
      for (let i = 0; i < 4; i++) {
        playerRolls[i].total = 0;
        for (let t = 2; t <= 12; t++) playerRolls[i].counts[t] = 0;
      }
      rollLog.length = 0;
      qs("#rollCount").textContent = "0";
      setLastRollDisplay(null);
      drawCharts();
      saveAll();
      updateUndoUI();
      showToast("Dice statistics reset", "success");
    }
  );
}

// Setup canvas
function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w: rect.width, h: rect.height };
}

// Draw bar chart
function drawBarChart(canvas) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);

  const pad = 28;
  const chartW = w - pad * 2;
  const chartH = h - pad * 2;

  ctx.strokeStyle = "rgba(0,0,0,.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, pad + chartH);
  ctx.lineTo(pad + chartW, pad + chartH);
  ctx.stroke();

  const maxCount = Math.max(1, ...Object.values(counts));
  const keys = Array.from({ length: 11 }, (_, i) => i + 2);
  const gap = 8;
  const barW = (chartW - gap * (keys.length - 1)) / keys.length;

  ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textAlign = "center";

  keys.forEach((k, idx) => {
    const x = pad + idx * (barW + gap);
    const val = counts[k];
    const barH = (val / maxCount) * (chartH - 22);
    const y = pad + chartH - barH;

    ctx.fillStyle = "rgba(200,74,54,.78)";
    ctx.fillRect(x, y, barW, barH);

    ctx.fillStyle = "rgba(0,0,0,.70)";
    ctx.textBaseline = "bottom";
    ctx.fillText(String(val), x + barW / 2, y - 3);

    ctx.textBaseline = "top";
    ctx.fillText(String(k), x + barW / 2, pad + chartH + 6);
  });
}

// Draw charts
function drawCharts() {
  const canvas = qs("#barChart");
  if (canvas) drawBarChart(canvas);
}

// Update dice statistics
function updateDiceStats() {
  // Hot & Cold Numbers
  if (totalRolls < 10) {
    qs("#statHot").innerHTML = '<div class="small">Need 10+ rolls</div>';
    qs("#statCold").innerHTML = '<div class="small">Need 10+ rolls</div>';
  } else {
    const deviations = [];
    for (let num = 2; num <= 12; num++) {
      const expected = totalRolls * DICE_PROBABILITY[num];
      const actual = counts[num] || 0;
      const deviation = actual - expected;
      deviations.push({ num, deviation, actual, expected });
    }

    deviations.sort((a, b) => b.deviation - a.deviation);

    const hot = deviations.filter(d => d.deviation > 0.5).slice(0, 3);
    if (hot.length > 0) {
      const hotHTML = hot.map(d => 
        `<div class="mono" style="font-size:13px;"><strong>${d.num}</strong>: +${Math.round(d.deviation)} (${d.actual}/${Math.round(d.expected)})</div>`
      ).join('');
      qs("#statHot").innerHTML = hotHTML;
    } else {
      qs("#statHot").innerHTML = '<div class="small">All normal!</div>';
    }

    const cold = deviations.filter(d => d.deviation < -0.5).slice(-3).reverse();
    if (cold.length > 0) {
      const coldHTML = cold.map(d => 
        `<div class="mono" style="font-size:13px;"><strong>${d.num}</strong>: ${Math.round(d.deviation)} (${d.actual}/${Math.round(d.expected)})</div>`
      ).join('');
      qs("#statCold").innerHTML = coldHTML;
    } else {
      qs("#statCold").innerHTML = '<div class="small">All normal!</div>';
    }
  }
}