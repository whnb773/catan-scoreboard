/* =============================================
   CONFIGURATION
   Constants, settings, and color options
   ============================================= */

// Storage key for localStorage
const STORAGE_KEY = "catan_scoreboard_full_singlefile_fixed_v12_improved";
const SNAPSHOT_KEY = STORAGE_KEY + "_snapshots";

// Undo/Redo settings
const UNDO_MAX = 150;

// Color options for players
const COLOR_OPTIONS = [
  { key: "blue",   label: "Blue",   hex: "#1f6bd6" },
  { key: "orange", label: "Orange", hex: "#f59e0b" },
  { key: "red",    label: "Red",    hex: "#d73c2c" },
  { key: "white",  label: "White",  hex: "#f8fafc" }
];

// Dice probability distribution
const DICE_PROBABILITY = {
  2: 1/36,
  3: 2/36,
  4: 3/36,
  5: 4/36,
  6: 5/36,
  7: 6/36,
  8: 5/36,
  9: 4/36,
  10: 3/36,
  11: 2/36,
  12: 1/36
};

// Photo settings
const DEFAULT_PHOTO_HEIGHT = 180;
const MIN_PHOTO_HEIGHT = 120;
const MAX_PHOTO_HEIGHT = 360;
const DEFAULT_ZOOM = 1.25;
const MAX_PHOTO_SIZE = 1200; // pixels
const PHOTO_QUALITY = 0.86; // JPEG quality

// Timing
const TOAST_DURATION = 4500; // milliseconds
const DICE_OVERLAY_DURATION = 1500; // milliseconds