// gen-crab-art.js
// Crabtopia "Glow-Tide Storybook" crab character art generator.
// Uses z-ai-web-dev-sdk image generation (backend only).
// Generates 11 crab/egg PNGs into /home/z/my-project/download/art/crabs/
// Robust: per-image retry (up to 3 attempts), skips already-valid files.

const fs = require('fs');
const path = require('path');

const OUT_DIR = '/home/z/my-project/download/art/crabs';
const SIZE = '1024x1024';
const MAX_ATTEMPTS = 5; // bumped so transient 429 rate-limit windows can clear

// Shared style anchor kept consistent across every crab for art cohesion.
const STYLE = [
  'Glow-Tide Storybook art style: rich hand-painted 2D illustration',
  'chunky expressive silhouette, soft rim lighting, glowing plankton particles',
  'jewel-toned colors, cute but powerful hermit crab warrior',
  'single character, full body, front-facing, centered composition',
  'soft rounded square vignette background with subtle faction-colored glow',
  'clean isolated game character art, no text, no watermark, no logo, original character'
].join(', ');

// Each entry: { name, file, prompt }
const CRABS = [
  {
    name: 'BULWARK (Coral Court)',
    file: 'bulwark-coral.png',
    prompt: `A wide heavy armored hermit crab warrior of the BULWARK class from the Coral Court faction, defensive stance planted firmly, enormous shield-like broad claws held up to block, big spiral snail shell on its back painted in coral pink and sunlit gold trim, stout chunky legs, calm determined eyes, holding a tiny buckler crest, palette coral pink #FF6F91 and sunlit gold #FFD166 on deepwater navy, ${STYLE}`
  },
  {
    name: 'REAVER (Cinderreef)',
    file: 'reaver-cinder.png',
    prompt: `A spiky asymmetric aggressive hermit crab warrior of the REAVER class from the Cinderreef faction, one huge oversized pincer claw and one small razor claw, glowing lava glass shell cracked with molten orange veins, jagged ember-red and black carapace, fierce glowing eyes, aggressive forward stance, holding a tiny volcanic shard blade, palette lava orange #FF7A1A and ember red on black, ${STYLE}`
  },
  {
    name: 'SKITTER (Stormwake)',
    file: 'skitter-storm.png',
    prompt: `A small long-legged fast hermit crab warrior of the SKITTER class from the Stormwake faction, slender stilt-like legs in a ready-to-dash pose, electric lightning rift energy crackling around it, two long glowing violet antennae, sleek storm-violet and moonlight-silver shell, mischievous bright eyes, holding a tiny static-charged dagger, palette storm violet #7A5CFF and moonlight silver #C9D6EE, ${STYLE}`
  },
  {
    name: 'TIDECALLER (Moonpool)',
    file: 'tidecaller-moon.png',
    prompt: `A flowing magical hermit crab warrior of the TIDECALLER class from the Moonpool faction, surrounded by floating bubble orbs, swirling magical water aura, ornate moon-conch spiral shell glowing soft blue, graceful claw gestures casting water, serene glowing eyes, holding a tiny moonstone staff, palette deepwater navy #0A1B3D and sea-glass aqua #7CF5E1 with moonlight silver, ${STYLE}`
  },
  {
    name: 'SHELLMENDER (Mangrove Wardens)',
    file: 'shellmender-mangrove.png',
    prompt: `A round soft-glowing hermit crab warrior of the SHELLMENDER class from the Mangrove Wardens faction, gentle healer vibe, body enclosed in a cage shell made of woven mangrove roots, clutching a glowing healing pearl between its claws, warm mossy green and earthy brown carapace, kind sleepy eyes, holding a tiny leaf-wrapped remedy bundle, palette moss green #4FB477 and brown with soft green glow, ${STYLE}`
  },
  {
    name: 'PINCHER (Coral Court)',
    file: 'pincher-coral.png',
    prompt: `A balanced cheerful hermit crab warrior of the PINCHER class from the Coral Court faction, two equal-sized combo pincers raised playfully, rounded coconut shell on its back with a cute face-like crack, bright friendly eyes, lively bouncy stance, holding a tiny pair of nunchaku made of seashells, palette coral pink #FF6F91 and sunlit gold #FFD166 with lagoon teal accents, ${STYLE}`
  },
  {
    name: 'WARDEN (Frostshelf)',
    file: 'warden-frost.png',
    prompt: `An armored hermit crab warrior of the WARDEN class from the Frostshelf faction, sturdy plated body with two long crystal antennae, shell made of faceted ice crystals, frosty mist and control-stun energy, frozen locking gaze, calm imposing stance, holding a tiny ice scepter that emits a stun rune, palette frost white #EAF6FF and ice blue with deepwater navy, ${STYLE}`
  },
  {
    name: 'GILDCLAW (Cinderreef)',
    file: 'gildclaw-cinder.png',
    prompt: `A glittering lucky hermit crab warrior of the GILDCLAW class from the Cinderreef faction, claws and carapace trimmed in shining gold, volcanic stone shell inlaid with golden veins, floating lucky coin aura of tiny gold coins spinning around it, smug confident grin, flashy stance, holding a tiny gilded coin scepter, palette sunlit gold #FFD166 and lava orange #FF7A1A on dark volcanic stone, ${STYLE}`
  },
  {
    name: 'Rookie Crab (starter)',
    file: 'rookie-kelp.png',
    prompt: `A plain but adorable starter rookie hermit crab for new players, small and round, simple kelp-wrapped shell on its back tied with a bit of seagrass, soft eager eyes, humble beginner stance, holding a tiny wooden training pickaxe, palette moss green #4FB477 and lagoon teal #12A7A0 with frost white belly, friendly and approachable, ${STYLE}`
  },
  {
    name: 'Legendary Crab',
    file: 'legendary-glow.png',
    prompt: `A majestic legendary hermit crab warrior radiating power, ornate multi-tiered shell encrusted with glowing legendary gems in coral pink gold and storm violet, animated glow particles and sparks swirling around it, regal crown-like crest on the shell, golden rim-lit carapace, heroic confident stance, holding a tiny legendary relic orb, palette sunlit gold #FFD166 storm violet #7A5CFF and coral pink #FF6F91 on deepwater navy with intense glow, ${STYLE}`
  },
  {
    name: 'Glowing Egg',
    file: 'egg-glowing.png',
    prompt: `A single mysterious glowing crab egg floating in soft plankton light, translucent pearlescent shell with faint silhouettes of crab traits barely visible inside (tiny claws, eyes, shell spiral), gentle pulsing bioluminescent glow from within, soft halo, delicate speckles, no actual crab hatched yet, palette sea-glass aqua #7CF5E1 and moonlight silver #C9D6EE on deepwater navy, ${STYLE}`
  }
];

function fileIsValid(p) {
  try {
    const st = fs.statSync(p);
    return st.isFile() && st.size > 1024; // >1KB means real image data
  } catch {
    return false;
  }
}

async function generateOne(zai, entry) {
  const outPath = path.join(OUT_DIR, entry.file);
  if (fileIsValid(outPath)) {
    console.log(`  [skip] ${entry.file} already valid (${fs.statSync(outPath).size} bytes)`);
    return { ok: true, file: entry.file, bytes: fs.statSync(outPath).size, cached: true };
  }

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      process.stdout.write(`  [try ${attempt}/${MAX_ATTEMPTS}] ${entry.file} ... `);
      const resp = await zai.images.generations.create({ prompt: entry.prompt, size: SIZE });
      const b64 = resp?.data?.[0]?.base64;
      if (!b64) throw new Error('no base64 in response');
      const buf = Buffer.from(b64, 'base64');
      if (buf.length < 1024) throw new Error(`buffer too small (${buf.length} bytes)`);
      fs.writeFileSync(outPath, buf);
      console.log(`OK (${buf.length} bytes)`);
      return { ok: true, file: entry.file, bytes: buf.length, attempts: attempt };
    } catch (e) {
      lastErr = e;
      console.log(`FAIL: ${e.message}`);
      // Longer backoff on rate-limit (429) so the window can clear.
      const is429 = /429|Too many requests/i.test(e.message || '');
      const backoff = is429 ? 20000 * attempt : 1500 * attempt;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  return { ok: false, file: entry.file, error: lastErr?.message || 'unknown' };
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\nCrabtopia crab art generator`);
  console.log(`Output dir: ${OUT_DIR}`);
  console.log(`Size: ${SIZE} | Crabs: ${CRABS.length} | Max attempts: ${MAX_ATTEMPTS}\n`);

  const ZAIMod = await import('z-ai-web-dev-sdk');
  const ZAI = ZAIMod.default;
  const zai = await ZAI.create();

  const results = [];
  for (let i = 0; i < CRABS.length; i++) {
    const entry = CRABS[i];
    console.log(`\n[${i + 1}/${CRABS.length}] ${entry.name}`);
    const r = await generateOne(zai, entry);
    results.push({ name: entry.name, ...r });
  }

  // Summary
  console.log('\n========================================');
  console.log('GENERATION SUMMARY');
  console.log('========================================');
  let okCount = 0;
  for (const r of results) {
    const status = r.ok ? 'OK ' : 'FAIL';
    const extra = r.ok ? `${r.bytes} bytes${r.cached ? ' (cached)' : r.attempts ? ` (${r.attempts} attempts)` : ''}` : `ERROR: ${r.error}`;
    console.log(`[${status}] ${r.file} - ${extra}`);
    if (r.ok) okCount++;
  }
  console.log('----------------------------------------');
  console.log(`${okCount}/${results.length} images generated successfully.`);

  if (okCount < results.length) {
    console.error('\nSome images failed. Re-run the script to retry missing ones.');
    process.exit(1);
  }
})().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(2);
});
