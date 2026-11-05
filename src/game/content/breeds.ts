// Crabtopia - 64 Breed types (8 classes x 8 breeds)
import { ClassId } from "../types";

export interface BreedDef {
  id: string;
  classId: ClassId;
  name: string;
  lore: string;
  // stat spread modifiers applied on top of class base stats
  statMod: {
    hp: number;
    attack: number;
    defense: number;
    speed: number;
    skill: number;
  };
  skillFlavor: string; // descriptive flavor for the skill variant
  artNotes: string;
}

function makeBreeds(
  classId: ClassId,
  names: string[],
  lore: string[],
  spreads: Array<[number, number, number, number, number]>,
  flavors: string[],
  arts: string[]
): BreedDef[] {
  return names.map((name, i) => ({
    id: `${classId}_${name.toLowerCase().replace(/\s+/g, "_")}`,
    classId,
    name,
    lore: lore[i],
    statMod: {
      hp: spreads[i][0],
      attack: spreads[i][1],
      defense: spreads[i][2],
      speed: spreads[i][3],
      skill: spreads[i][4],
    },
    skillFlavor: flavors[i],
    artNotes: arts[i],
  }));
}

export const BREEDS: BreedDef[] = [
  ...makeBreeds(
    "bulwark",
    ["Barnacle Wall", "Anchor Hide", "Kelp Guard", "Tidestone", "Ironcap", "Reefplate", "Bastion Hermit", "Deepbrace"],
    [
      "Crusted with a thousand tide-stories.",
      "Forged from a sunken anchor's rust.",
      "Woven of kelp and quiet patience.",
      "A walking stone kissed by the moon.",
      "Iron will in an iron cap.",
      "Plate on plate, unbroken reef.",
      "Last bastion of the drowned towers.",
      "Holds the deep's weight in its shell.",
    ],
    [
      [60, -4, 8, -3, -2],
      [40, -2, 10, -4, -1],
      [50, -3, 6, -2, 0],
      [55, -1, 7, -3, 1],
      [70, -5, 12, -5, -3],
      [65, -3, 11, -4, -2],
      [80, -6, 14, -6, -4],
      [90, -7, 15, -7, -5],
    ],
    [
      "Slam knocks back enemies.",
      "Slam roots enemies briefly.",
      "Slam heals self slightly.",
      "Slam grants self shield.",
      "Slam stuns on crit.",
      "Slam damages adjacent.",
      "Slam taunts and shields.",
      "Slam reflects damage taken.",
    ],
    [
      "Barnacle-encrusted spiral shell.",
      "Rusted anchor fragment shell.",
      "Kelp-woven wicker shell.",
      "Moon-touched smooth stone shell.",
      "Iron-banded dome shell.",
      "Layered coral plate shell.",
      "Ancient fortress-stone shell.",
      "Deep-sea pressure dome shell.",
    ]
  ),
  ...makeBreeds(
    "reaver",
    ["Razorclaw", "Bloodtide", "Shardtooth", "Ember Reaver", "Frostrend", "Stormscythe", "Voidrend", "Goldreaver"],
    [
      "Edge so fine it splits current.",
      "Hunts by the scent of wounded tide.",
      "Teeth of broken coral glass.",
      "Born in the vent's red glow.",
      "Carved from the aurora shelf.",
      "Lightning in every claw.",
      "Cuts the dark between stars.",
      "Takes a toll in gold and blood.",
    ],
    [
      [-10, 12, -4, 3, 2],
      [-15, 15, -5, 2, 3],
      [-8, 10, -3, 4, 1],
      [-12, 14, -6, 3, 4],
      [-10, 11, -4, 5, 2],
      [-14, 13, -5, 6, 3],
      [-16, 16, -6, 4, 5],
      [-12, 12, -4, 4, 3],
    ],
    [
      "Reaving Claw causes bleed.",
      "Reaving Claw heals attacker.",
      "Reaving Claw ignores armor.",
      "Reaving Claw burns target.",
      "Reaving Claw freezes briefly.",
      "Reaving Claw chains lightning.",
      "Reaving Claw silences target.",
      "Reaving Claw steals gold.",
    ],
    [
      "Spiky asymmetric red shell.",
      "Dark blood-streaked shell.",
      "Coral-glass shard shell.",
      "Lava-glass ember shell.",
      "Ice-shard crystal shell.",
      "Charged silver-spike shell.",
      "Midnight void-stone shell.",
      "Gilded coin-stack shell.",
    ]
  ),
  ...makeBreeds(
    "skitter",
    ["Tide.runner", "Bubblenox", "Silkleg", "Glimmerfoot", "Windskip", "Foamwhisk", "Star.darter", "Miststride"],
    [
      "Outruns the fastest current.",
      "Trail of bubbles in its wake.",
      "Legs like silk thread.",
      "Feet that catch the light.",
      "Skips the wind's surface.",
      "Whisk of foam and fleet.",
      "Darts between the plankton stars.",
      "Walks the mist line.",
    ],
    [
      [-8, 3, -3, 10, 2],
      [-10, 2, -2, 12, 4],
      [-6, 2, -4, 14, 1],
      [-7, 4, -3, 11, 3],
      [-9, 3, -3, 13, 2],
      [-8, 2, -2, 12, 3],
      [-10, 5, -4, 15, 4],
      [-9, 3, -3, 14, 2],
    ],
    [
      "Ripple Strike hits 3 times.",
      "Ripple Strike leaves a bubble trap.",
      "Ripple Strike slows target.",
      "Ripple Strike blinds target.",
      "Ripple Strike adds shock.",
      "Ripple Strike causes bleed.",
      "Ripple Strike pierces dodge.",
      "Ripple Strike grants evade.",
    ],
    [
      "Sleek long-legged light shell.",
      "Bubble-orb translucent shell.",
      "Silk-thread cocoon shell.",
      "Glimmering pearl-drop shell.",
      "Wind-carved smooth shell.",
      "Foam-textured white shell.",
      "Star-flecked dark shell.",
      "Mist-veiled grey shell.",
    ]
  ),
  ...makeBreeds(
    "tidecaller",
    ["Waveborn", "Pearlweaver", "Brinesong", "Coralcarver", "Depthchoir", "Geyserheart", "Abysscaller", "Tidewhisper"],
    [
      "Born of the first wave.",
      "Weaves pearls into spells.",
      "Sings the brine's old song.",
      "Carves coral with a word.",
      "Choir of the lightless deep.",
      "Heart of a sleeping geyser.",
      "Calls things from the abyss.",
      "Whispers the tide's secrets.",
    ],
    [
      [-6, 2, -2, 2, 10],
      [-5, 1, -1, 3, 12],
      [-7, 3, -2, 2, 11],
      [-4, 2, -1, 3, 10],
      [-8, 2, -3, 2, 14],
      [-6, 3, -2, 4, 13],
      [-9, 4, -3, 2, 16],
      [-5, 2, -1, 3, 11],
    ],
    [
      "Tidal Burst wets enemies (conducts shock).",
      "Tidal Burst leaves a healing tide.",
      "Tidal Burst silences.",
      "Tidal Burst causes coral spikes.",
      "Tidal Burst hits back row twice.",
      "Tidal Burst erupts as geyser (delayed).",
      "Tidal Burst pulls enemies together.",
      "Tidal Burst whispers (confuses).",
    ],
    [
      "Wave-crested flowing shell.",
      "Pearl-strung shell with orbs.",
      "Brine-stained song-shell.",
      "Coral-carved ceremonial shell.",
      "Deep-abyss glowing shell.",
      "Geyser-vent hissing shell.",
      "Abyssal void-rune shell.",
      "Whisper-soft translucent shell.",
    ]
  ),
  ...makeBreeds(
    "shellmender",
    ["Pearlheart", "Kindlelight", "Mossbloom", "Starwisp", "Glowbreath", "Tidenurose", "Mendersong", "Lumenbough"],
    [
      "Heart of a mending pearl.",
      "Light that kindles the hurt away.",
      "Blooms moss over wounds.",
      "A wisp of kindly starlight.",
      "Breathes a soft glow.",
      "Rose of the healing tide.",
      "Sings the shell back whole.",
      "Bough of living light.",
    ],
    [
      [10, -2, 4, -2, 8],
      [8, -1, 3, -1, 10],
      [14, -3, 5, -3, 6],
      [6, 0, 2, 0, 12],
      [9, -2, 3, -2, 9],
      [12, -2, 4, -2, 8],
      [10, -1, 4, -1, 11],
      [11, -2, 4, -2, 10],
    ],
    [
      "Mending Pearl cleanses debuffs.",
      "Mending Pearl grants energy.",
      "Mending Pearl applies regen.",
      "Mending Pearl shields double.",
      "Mending Pearl revives once.",
      "Mending Pearl reduces cooldowns.",
      "Mending Pearl heals all allies.",
      "Mending Pearl grants cleanse + shield.",
    ],
    [
      "Pearl-centered round shell.",
      "Warm-glow candle shell.",
      "Moss-covered bloom shell.",
      "Star-wisp glowing shell.",
      "Lantern-breath shell.",
      "Tide-rose pink shell.",
      "Song-note carved shell.",
      "Living branch-woven shell.",
    ]
  ),
  ...makeBreeds(
    "pincher",
    ["Tidejack", "Coralpunch", "Reefbrawler", "Kelpkip", "Brineduelist", "Pinchmark", "Tideboxer", "Saltgrin"],
    [
      "All-around jack of tides.",
      "Punches with coral fists.",
      "Brawls on the reef.",
      "Skips and snaps.",
      "Duels in the brine.",
      "Leaves a mark with every pinch.",
      "Fights like a tide-boxer.",
      "Grins through salt and shell.",
    ],
    [
      [6, 3, 2, 2, 2],
      [4, 5, 1, 3, 1],
      [8, 4, 4, 1, 1],
      [3, 3, 1, 5, 2],
      [5, 4, 3, 3, 2],
      [4, 6, 2, 2, 1],
      [7, 5, 3, 2, 2],
      [5, 4, 2, 4, 3],
    ],
    [
      "Combo Pinch hits 4 times.",
      "Combo Pinch stuns on final hit.",
      "Combo Pinch bonus if hit recently.",
      "Combo Pinch swaps to fastest target.",
      "Combo Pinch ignores defense stacking.",
      "Combo Pinch marks target.",
      "Combo Pinch counter-attacks.",
      "Combo Pinch heals self on hit.",
    ],
    [
      "Sturdy rounded happy-face shell.",
      "Coral-fist knuckle shell.",
      "Brawler's battered shell.",
      "Kelp-skippered light shell.",
      "Duelist's engraved shell.",
      "Marked scar-shell.",
      "Boxer's taped shell.",
      "Grinning salt-stained shell.",
    ]
  ),
  ...makeBreeds(
    "warden",
    ["Tidebound", "Silentreef", "Stoneward", "Bindweed", "Galechain", "Frostward", "Voidward", "Luminchain"],
    [
      "Bound by ancient tide-oaths.",
      "Where the reef falls silent.",
      "Stone that remembers its ward.",
      "Bindweed that holds the law.",
      "Chained by the gale.",
      "Ward of the frozen shelf.",
      "Ward against the void.",
      "Chain of living light.",
    ],
    [
      [6, 2, 5, -1, 3],
      [4, 1, 4, 0, 5],
      [10, 0, 7, -2, 2],
      [5, 2, 3, 0, 4],
      [4, 3, 3, 3, 4],
      [7, 1, 6, -1, 3],
      [5, 2, 4, 0, 5],
      [6, 2, 4, 1, 4],
    ],
    [
      "Binding Tide roots instead of stun.",
      "Binding Tide silences all.",
      "Binding Tide grants allies shield.",
      "Binding Tide bleeds targets.",
      "Binding Tide shocks targets.",
      "Binding Tide freezes targets.",
      "Binding Tide banishes (skip turn).",
      "Binding Tide marks and slows.",
    ],
    [
      "Oath-bound engraved shell.",
      "Silent dark-iron shell.",
      "Mossy stone-ward shell.",
      "Bindweed-wrapped shell.",
      "Gale-chained silver shell.",
      "Frost-rimed iron shell.",
      "Void-black runic shell.",
      "Luminous chain-light shell.",
    ]
  ),
  ...makeBreeds(
    "gildclaw",
    ["Coinback", "Luckyfin", "Giltshell", "Tide.merc", "Fortunepaw", "Goldwhisk", "Prospectclaw", "Gildedpinch"],
    [
      "Carries its fortune on its back.",
      "Lucky in fin and claw.",
      "Shell of true gilt.",
      "Mercenary of fortune.",
      "Paw that finds the gold.",
      "Whisker that sniffs the vein.",
      "Prospector of the deep veins.",
      "Pinch plated in gold.",
    ],
    [
      [4, 2, 2, 2, 3],
      [3, 3, 1, 4, 2],
      [5, 2, 3, 1, 3],
      [3, 4, 2, 3, 2],
      [2, 3, 2, 3, 3],
      [3, 2, 2, 4, 3],
      [4, 3, 3, 2, 3],
      [5, 3, 3, 2, 3],
    ],
    [
      "Golden Shower drops extra coins.",
      "Golden Shower grants luck buff.",
      "Golden Shower shields in gold.",
      "Golden Shower hires (summons merc).",
      "Golden Shower grants crit to team.",
      "Golden Shower reveals treasure.",
      "Golden Shower mines gold over time.",
      "Golden Shower breaks defenses.",
    ],
    [
      "Coin-stack shiny shell.",
      "Lucky-fin bright shell.",
      "True-gilt engraved shell.",
      "Mercenary's badge shell.",
      "Fortune-paw lucky shell.",
      "Gold-whisker glimmering shell.",
      "Prospector's pick-shell.",
      "Gilded-pinch ornate shell.",
    ]
  ),
];

export const BREEDS_BY_ID: Record<string, BreedDef> = Object.fromEntries(
  BREEDS.map((b) => [b.id, b])
);

export const BREEDS_BY_CLASS: Record<ClassId, BreedDef[]> = BREEDS.reduce(
  (acc, b) => {
    if (!acc[b.classId]) acc[b.classId] = [];
    acc[b.classId].push(b);
    return acc;
  },
  {} as Record<ClassId, BreedDef[]>
);
