#!/bin/bash
# Generate images SEQUENTIALLY with valid sizes (multiples of 32, under 2^22 pixels)
# Valid landscape: 1344x768 (1,032,192 px). Valid square: 1024x1024.
OUTDIR="/home/z/my-project/public/art"
mkdir -p "$OUTDIR"

STYLE="hand-painted 2D storybook illustration, jewel-toned colors, soft rim lighting, glowing plankton particles, chunky expressive silhouettes, cute but powerful, underwater fantasy, rich details, no text, no watermark"

gen() {
  local label="$1"
  local prompt="$2"
  local out="$3"
  if [ -f "$out" ] && [ -s "$out" ]; then
    echo "[skip] $label ($(stat -c%s "$out") bytes)"
    return 0
  fi
  echo "[gen]  $label ..."
  timeout 120 z-ai image -p "$prompt" -o "$out" -s "1344x768" 2>&1 | tail -3
  if [ -f "$out" ] && [ -s "$out" ]; then
    echo "[ok]   $label -> $(stat -c%s "$out") bytes"
  else
    echo "[fail] $label"
  fi
  sleep 5
}

gen "City hero" "Glowing coral metropolis underwater city called Crabtopia, towering coral spires and pearl domes, golden treasure veins glowing from below, schools of tiny fish, bubbles, bioluminescent plankton, hermit crab citizens scuttling on bridges, warm sunbeams filtering from surface, epic wide establishing shot, $STYLE" "$OUTDIR/city-hero.png"

gen "Coral Court biome" "Coral Court underwater reef city biome, coral pink and sunlit gold palette, tide-gardens with glowing anemones, elegant coral archways, peaceful support synergy atmosphere, hermit crabs with spiral shells, soft pink glow, $STYLE" "$OUTDIR/biome-coral.png"

gen "Cinderreef biome" "Cinderreef volcanic vent biome underwater, ember red and black palette, glowing lava glass formations, dark volcanic rock, molten cracks emitting orange glow, fierce burst damage atmosphere, tough crabs with volcanic stone shells, $STYLE" "$OUTDIR/biome-cinder.png"

gen "Frostshelf biome" "Frostshelf frozen ice shelf biome underwater, ice blue and white palette, aurora borealis light filtering through ice, crystal formations, frozen pillars, calm control and defense atmosphere, crabs with ice crystal shells, marine snow particles, $STYLE" "$OUTDIR/biome-frost.png"

gen "Mangrove biome" "Mangrove Wardens swamp forest biome underwater, moss green and brown palette, giant mangrove roots descending, swamp-lantern flowers glowing, dense root labyrinths, regeneration and endurance atmosphere, crabs with root-cage shells, $STYLE" "$OUTDIR/biome-mangrove.png"

gen "Stormwake biome" "Stormwake storm rift biome underwater, electric violet and silver palette, lightning crackling through water, dark storm clouds above, charged energy rifts, speed and crit atmosphere, crabs with charged shells, electric sparks, $STYLE" "$OUTDIR/biome-storm.png"

gen "Moonpool biome" "Moonpool night tide pool biome underwater, midnight blue and silver-white palette, glowing bioluminescent plankton everywhere, moonlight filtering from surface, mysterious trickery and evasion atmosphere, crabs with moon-conch shells, shimmering particles, $STYLE" "$OUTDIR/biome-moon.png"

gen "Battle arena" "Underwater coliseum battle arena, ancient coral stone amphitheater, glowing rune circles on sandy floor, faction banners around the ring, dramatic spotlight from above, treasure chest at center, epic combat stage, neutral ground, $STYLE" "$OUTDIR/arena.png"

gen "Seabed dive map" "Wide underwater seabed dive map view, scattered glowing dig sites with treasure glints, kelp forests, rock formations, small crab teams digging with picks, distant silhouettes of raiders approaching, depth fog, caustic light overlays, top-down isometric angle, $STYLE" "$OUTDIR/seabed-map.png"

echo "========================================"
echo "Sequential generation complete!"
ls -lh "$OUTDIR"
