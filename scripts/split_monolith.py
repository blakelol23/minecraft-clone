#!/usr/bin/env python3
"""Re-split game.monolith.html into editable js/* domain chunks + keep main.js entry."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
monolith = (ROOT / "game.monolith.html").read_text().splitlines(True)
PARTS = [
    ("constants.js", 944, 997, "Block IDs, tools, items, world scale, physics constants"),
    ("assets.js", 998, 1393, "Resource packs, SFX, rain audio"),
    ("core.js", 1394, 2505, "Settings, renderer, scene, DOM refs, shared world state"),
    ("inventory.js", 2506, 4177, "Inventory, crafting, chest, furnace, hotbar icons"),
    ("player.js", 4178, 4858, "Spawn, save/load, pause/settings handlers"),
    ("mobs.js", 4859, 6052, "Mob meshes, AI, combat"),
    ("systems.js", 6053, 8454, "Game loop, input, player movement, water, particles, ambient"),
    ("world.js", 8455, 10221, "Chunks, terrain gen, materials, block access"),
    ("ui.js", 10222, 10780, "HUD bars, chat, commands, leaf decay helpers"),
]
js = ROOT / "js"
for name, start, end, desc in PARTS:
    body = "".join(monolith[start - 1 : end])
    (js / name).write_text(
        f"/**\n"
        f" * @module {name[:-3]}\n"
        f" * {desc}\n"
        f" * Lines {start}-{end} from game.monolith.html\n"
        f" * Loaded as source text by main.js and evaluated in one shared scope.\n"
        f" */\n\n"
        f"{body}"
    )
    print("wrote", name)
