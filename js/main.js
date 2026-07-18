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

async function loadChunk(rel) {
  const url = new URL(rel, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${rel} (${res.status})`);
  return res.text();
}

async function boot() {
  const parts = [];
  for (const rel of CHUNKS) parts.push(await loadChunk(rel));
  const code = parts.join("\n");
  const runner = new Function(
    "THREE",
    "return (async function () {\n" + code + "\n})();"
  );
  await runner(THREE);
}

boot().catch((err) => {
  console.error("[BlockieCraft] boot failed", err);
  const msg = document.getElementById("centerMsg");
  if (msg) {
    const webgl = String(err && err.message || err).includes("WebGL");
    msg.textContent = webgl
      ? "WebGL unavailable in this environment."
      : "Failed to load game scripts — serve over http:// (not file://).";
    msg.classList.add("show");
  }
});
