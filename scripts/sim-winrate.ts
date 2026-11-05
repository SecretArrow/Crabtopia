// Win-rate simulation: starter team vs generated opponents (engine-level).
import {
  initBattle,
  runBattle,
} from "../src/game/engine/arenaEngine.ts";
import { generateOpponents } from "../src/game/data/opponents.ts";
import { generateCrab } from "../src/game/engine/crabs.ts";
import { deriveFormationForCrabs, resolveTeamFormation } from "../src/game/engine/formation.ts";
import { createStarterPlayer } from "../src/game/store/gameStore.ts";

// Reconstruct the starter roster exactly like the store does.
const STARTER_CLASSES = ["bulwark", "reaver", "skitter", "shellmender", "tidecaller"];
const STARTER_FACTIONS = ["coral_court", "cinderreef", "stormwake", "mangrove", "moonpool"];
const starterCrabs = STARTER_CLASSES.map((classId, i) =>
  generateCrab({ classId, faction: STARTER_FACTIONS[i], isRookie: true, level: 1, seed: 777 + i })
);

const starterFormation = deriveFormationForCrabs(starterCrabs, "balanced");

let wins = 0;
const N = 200;
for (let t = 0; t < N; t++) {
  const seed = 1000 + t * 17;
  const opponents = generateOpponents(1, seed, 5);
  // Fight the weakest (highest rank) and the first opponent alternately.
  const opp = t % 2 === 0
    ? opponents.reduce((a, b) => (b.rank > a.rank ? b : a))
    : opponents[0];
  const enemyFormation = deriveFormationForCrabs(opp.crabs, "balanced");
  const state = initBattle(starterCrabs, opp.crabs, seed, {
    playerFormation: starterFormation,
    enemyFormation,
  });
  runBattle(state);
  if (state.winner === "player") wins++;
}
console.log(`starter team win rate: ${wins}/${N} = ${(100 * wins / N).toFixed(1)}%`);
