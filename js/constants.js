/**
 * @module constants
 * Block IDs, tools, items, world scale, physics constants
 * Lines 944-997 from game.monolith.html
 * Loaded as source text by main.js and evaluated in one shared scope.
 */

const BOOT_QUERY=new URLSearchParams(location.search);

const BLOCK={AIR:0,GRASS:1,DIRT:2,STONE:3,SAND:4,WOOD:5,LEAVES:6,WATER:7,SNOW:8,GLASS:9,CACTUS:10,
             PLANKS:11,TORCH:12,CRAFT_TABLE:13,CHEST:14,COBBLESTONE:15,GRAVEL:16,RED_SAND:17,CLAY:18,MUD:19,
             FURNACE:20,COAL_ORE:21,IRON_ORE:22,GOLD_ORE:23,DIAMOND_ORE:24};
const SPAWN_PREFERRED_SURFACES=new Set([
  BLOCK.GRASS,
  BLOCK.DIRT,
  BLOCK.SAND,
  BLOCK.RED_SAND,
  BLOCK.GRAVEL,
  BLOCK.CLAY,
  BLOCK.MUD,
  BLOCK.SNOW,
  BLOCK.STONE
]);
// Tool item IDs (>=100, not placeable as blocks)
const TOOL={WOOD_PICK:100,STONE_PICK:101,WOOD_AXE:102,STONE_AXE:103,WOOD_SHOVEL:104,STONE_SHOVEL:105,
            IRON_PICK:106};
// Raw material item IDs (>=200)
const ITEM={STICK:200,WATER_SOURCE:201,APPLE:202,BREAD:203,COOKED_PORKCHOP:204,
            RAW_MEAT:209,COAL:205,IRON_INGOT:206,GOLD_INGOT:207,DIAMOND:208};
const S={
  seed:48151623,chunkSize:16,worldH:64,waterLevel:22,
  worldPreset:"balanced",
  renderDist:3,reach:8,
  gravity:32,walkSpeed:4.317,sprintSpeed:5.612,sneakSpeed:1.295,jumpVel:9.0,
  playerR:0.30,playerH:1.8,eyeH:1.62,
  dayLen:1800,camDist:4.0,
  dayPhaseLen:900,nightPhaseLen:900,audioFade:8,audioVolume:0.06
};
/** Player movement / fluid — tuned for capsule + grid collision */
const PHYS={
  substepMax:0.2,
  groundAccel:15.2,
  airAccel:6.4,
  groundFriction:11.2,
  airFriction:2.35,
  swimAccel:7.9,
  swimDragMove:5.15,
  swimDragIdle:4.05,
  maxHorizLand:14,
  maxHorizWater:8.6,
  termVelWater:-8.8,
  gravWater:0.155,
  buoyRiseSubmerged:5.15,
  buoyRiseSurface:3.05,
  buoySink:0.48,
  buoySinkWaterfall:1.12,
  flowImmersionMin:0.2,
  immersionFeet:0.08,
  immersionSwim:0.38
};