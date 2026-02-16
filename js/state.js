/* =============================================
   GAME STATE
   All game data stored here
   ============================================= */

// Helper functions
function qs(sel, el = document) { 
  return el.querySelector(sel); 
}

function qsa(sel, el = document) { 
  return Array.from(el.querySelectorAll(sel)); 
}

function clamp(n, min, max) { 
  return Math.min(max, Math.max(min, n)); 
}

// Player data
const players = [
  { name: "Player 1", color: "#d73c2c", photo: "", photoH: 180, panX: 0, panY: 0, zoom: 1.25, natW: 0, natH: 0, colorKey: "red" },
  { name: "Player 2", color: "#1f6bd6", photo: "", photoH: 180, panX: 0, panY: 0, zoom: 1.25, natW: 0, natH: 0, colorKey: "blue" },
  { name: "Player 3", color: "#f59e0b", photo: "", photoH: 180, panX: 0, panY: 0, zoom: 1.25, natW: 0, natH: 0, colorKey: "orange" },
  { name: "Player 4", color: "#f8fafc", photo: "", photoH: 180, panX: 0, panY: 0, zoom: 1.25, natW: 0, natH: 0, colorKey: "white" }
];

// Player scores
const playerState = players.map(() => ({
  settlements: 0,
  cities: 0,
  vpCards: 0,
  longestRoad: 0,
  largestArmy: 0,
  harbourSettlements: 0,
  harbourCities: 0,
  pirateLairs: 0,
  vpTokens: 0,
  specialVP: 0
}));

// Current turn
let turnIndex = 0;

// Round counter
let roundEnabled = false;
let roundCount = 1;

// Dice tracking
const counts = {};
for (let t = 2; t <= 12; t++) counts[t] = 0;
let totalRolls = 0;

const playerRolls = Array.from({ length: 4 }, () => {
  const c = {};
  for (let t = 2; t <= 12; t++) c[t] = 0;
  return { counts: c, total: 0 };
});

const rollLog = [];

// Timer state
let paused = false;
let running = false;
let elapsedMs = 0;
let lastTick = 0;
let timerId = null;

// Game history
const history = [];

// Backup settings
const backupSettings = {
  autoSnapshotOnEnd: true,
  maxSnapshots: 10
};

// Undo/Redo stacks
const undoStack = [];
const redoStack = [];

// Pending end game data
let pendingEnd = null;

// Helper: Get ruleset
function getRuleset() {
  return qs("#ruleset")?.value || "base";
}

// Helper: Calculate player total VP
function calcTotal(i) {
  const s = playerState[i];
  const ruleset = getRuleset();

  if (ruleset === "eap") {
    return (s.harbourSettlements * 1) +
           (s.harbourCities * 2) +
           (s.pirateLairs * 1) +
           (s.vpTokens * 1) +
           (s.specialVP * 1);
  }

  return (s.settlements * 1) +
         (s.cities * 2) +
         (s.vpCards * 1) +
         (s.longestRoad * 2) +
         (s.largestArmy * 2) +
         (s.specialVP * 1);
}

// Helper: Color from key
function colorFromKey(key) {
  return COLOR_OPTIONS.find(o => o.key === key)?.hex || "#d73c2c";
}

// Helper: Normalize player colors
function normalizePlayerColours() {
  for (let i = 0; i < 4; i++) {
    const k = players[i].colorKey;
    const valid = COLOR_OPTIONS.some(o => o.key === k);
    if (!valid) {
      players[i].colorKey = "red";
    }
    players[i].color = colorFromKey(players[i].colorKey);
  }
}

// Helper: Format time
function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// Helper: Escape HTML
function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Helper: Escape attribute
function escapeAttr(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Helper: Hex to RGBA
function hexToRgba(hex, a) {
  const h = String(hex || "").trim();
  if (!h.startsWith("#") || (h.length !== 7 && h.length !== 4)) {
    return `rgba(0,0,0,${a})`;
  }
  let r = 0, g = 0, b = 0;
  if (h.length === 7) {
    r = parseInt(h.slice(1, 3), 16);
    g = parseInt(h.slice(3, 5), 16);
    b = parseInt(h.slice(5, 7), 16);
  } else {
    r = parseInt(h[1] + h[1], 16);
    g = parseInt(h[2] + h[2], 16);
    b = parseInt(h[3] + h[3], 16);
  }
  return `rgba(${r},${g},${b},${a})`;
}