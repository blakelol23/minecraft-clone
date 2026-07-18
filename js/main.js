/**
 * BlockieCraft entry — ES module.
 * Fetches domain JS chunks and evaluates them in one shared async function
 * so function-declaration hoisting matches the original monolith.
 */
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";

const CHUNKS = [
  "./constants.js",
  "./assets.js",
  "./core.js",
  "./inventory.js",
  "./player.js",
  "./mobs.js",
  "./systems.js",
  "./world.js",
  "./ui.js",
];

const LOADING_TIPS = [
  "Double-tap W to start sprinting.",
  "Hold Shift to sneak along ledges without falling.",
  "Press E to open your inventory and craft tools.",
  "Furnaces need fuel and an item to smelt — coal burns the longest.",
  "Press F5 or V to cycle camera views.",
  "Right-click a crafting table to open the 3x3 grid.",
  "Chests keep your items safe between visits.",
  "Torches stop hostile mobs from spawning nearby.",
  "Press F3 for the debug screen, F3+Q for the controls overlay.",
];

// ── Loading screen ─────────────────────────────────────────────
const $loading = document.getElementById("loadingScreen");
const $loadingBar = document.getElementById("loadingBarInner");
const $loadingPct = document.getElementById("loadingBarPct");
const $loadingStatus = document.getElementById("loadingStatus");
const $loadingTip = document.getElementById("loadingTip");

let _tipTimer = null;
function startLoadingTips() {
  if (!$loadingTip || _tipTimer) return;
  let i = 0;
  const show = () => {
    $loadingTip.style.opacity = "0";
    setTimeout(() => {
      $loadingTip.textContent = "Tip: " + LOADING_TIPS[i % LOADING_TIPS.length];
      $loadingTip.style.opacity = "1";
      i++;
    }, 220);
  };
  show();
  _tipTimer = setInterval(show, 3400);
}
function stopLoadingTips() {
  if (_tipTimer) { clearInterval(_tipTimer); _tipTimer = null; }
}

/** Progress is reported on a 0-100 scale; label is a short status line. */
function setLoadingProgress(pct, label) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  if ($loadingBar) $loadingBar.style.width = clamped + "%";
  if ($loadingPct) $loadingPct.textContent = clamped + "%";
  if (label && $loadingStatus) $loadingStatus.textContent = label;
}

function loadingFailed(message) {
  stopLoadingTips();
  if ($loading) $loading.classList.add("error");
  if ($loadingStatus) $loadingStatus.textContent = message;
  if ($loadingTip) $loadingTip.textContent = "Reload the page to try again.";
}

function loadingDone() {
  stopLoadingTips();
  setLoadingProgress(100, "Ready!");
  if ($loading) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => $loading.classList.add("fadeOut"));
    });
  }
  const title = document.getElementById("titleCard");
  if (title && document.pointerLockElement !== document.querySelector("canvas")) {
    title.classList.remove("hidden");
  }
}

// Exposed so the evaluated game code (assets.js / inventory.js / systems.js)
// can report real progress as it works through texture loads, atlas builds,
// and initial world generation.
window.__bcProgress = setLoadingProgress;
window.__bcLoadingDone = loadingDone;

async function loadChunk(rel, onDone) {
  const url = new URL(rel, import.meta.url);
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${rel} (${res.status})`);
  const text = await res.text();
  onDone();
  return text;
}

async function boot() {
  startLoadingTips();
  setLoadingProgress(2, "Downloading game files\u2026");

  // Fetch every chunk in parallel — the old sequential loop turned nine
  // network round-trips into nine consecutive waits before anything could
  // even start executing. Order is preserved for concatenation regardless
  // of arrival order, since hoisting requires the original chunk order.
  let fetched = 0;
  const jobs = CHUNKS.map((rel) =>
    loadChunk(rel, () => {
      fetched++;
      // Downloading occupies the first 30% of the bar.
      setLoadingProgress(2 + (fetched / CHUNKS.length) * 28, "Downloading game files\u2026");
    })
  );
  const parts = await Promise.all(jobs);

  setLoadingProgress(32, "Starting engine\u2026");

  // Safety net: if boot() is still sitting on "Starting engine" after a
  // while, the game code almost certainly finished (or is close) but the
  // in-game window.__bcProgress calls never fired — e.g. a stale cached
  // chunk file that predates those hooks. Let the person know rather than
  // leaving them staring at a stuck bar with no explanation.
  const stallTimer = setTimeout(() => {
    if ($loadingStatus) $loadingStatus.textContent = "Still starting\u2026 this is taking longer than expected.";
  }, 9000);

  const code = parts.join("\n");
  const runner = new Function(
    "THREE",
    "return (async function () {\n" + code + "\n})();"
  );
  // The evaluated code itself calls window.__bcProgress(...) as it loads
  // textures, builds the block atlas, and generates the spawn chunk, and
  // calls window.__bcLoadingDone() right before starting the render loop.
  await runner(THREE);
  clearTimeout(stallTimer);

  // runner(THREE) only resolves once the whole game script has finished
  // executing top-to-bottom, and animate() just kicks off
  // requestAnimationFrame and returns immediately — so by the time we're
  // here the game is genuinely running. Force the loading screen closed
  // even if the in-game window.__bcLoadingDone() call above never fired,
  // so a missing/stale hook can never leave the bar stuck.
  loadingDone();
}

boot().catch((err) => {
  console.error("[BlockieCraft] boot failed", err);
  const webgl = String((err && err.message) || err).includes("WebGL");
  loadingFailed(
    webgl
      ? "WebGL unavailable in this environment."
      : "Failed to load game scripts — serve over http:// (not file://)."
  );
  const msg = document.getElementById("centerMsg");
  if (msg) {
    msg.textContent = webgl
      ? "WebGL unavailable in this environment."
      : "Failed to load game scripts — serve over http:// (not file://).";
    msg.classList.add("show");
  }
});