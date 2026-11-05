#!/bin/bash
# Generate all biome and key art for Crabtopia
# Style: Glow-Tide Storybook - hand-painted 2D, jewel-toned, glowing plankton, cute but powerful

OUTDIR="/home/z/my-project/public/art"
mkdir -p "$OUTDIR"

STYLE="hand-painted 2D storybook illustration, jewel-toned colors, soft rim lighting, glowing plankton particles, chunky expressive silhouettes, cute but powerful, underwater fantasy, rich details, no text, no watermark"

echo "[1/9] Generating Crabtopia City capital hero art..."
z-ai image -p "Glowing coral metropolis underwater city called Crabtopia, towering coral spires and pearl domes, golden treasure veins glowing from below, schools of tiny fish, bubbles, bioluminescent plankton, hermit crab citizens scuttling on bridges, warm sunbeams filtering from surface, epic wide establishing shot, $STYLE" -o "$OUTDIR/city-hero.png" -s 1440x720 &

echo "[2/9] Generating Coral Court biome..."
z-ai image -p "Coral Court underwater reef city biome, coral pink and sunlit gold palette, tide-gardens with glowing anemones, elegant coral archways, peaceful support synergy atmosphere, hermit crabs with spiral shells, soft pink glow, $STYLE" -o "$OUTDIR/biome-coral.png" -s 1344x768 &

echo "[3/9] Generating Cinderreef biome..."
z-ai image -p "Cinderreef volcanic vent biome underwater, ember red and black palette, glowing lava glass formations, dark volcanic rock, molten cracks emitting orange glow, fierce burst damage atmosphere, tough crabs with volcanic stone shells, $STYLE" -o "$OUTDIR/biome-cinder.png" -s 1344x768 &

echo "[4/9] Generating Frostshelf biome..."
z-ai image -p "Frostshelf frozen ice shelf biome underwater, ice blue and white palette, aurora borealis light filtering through ice, crystal formations, frozen pillars, calm control and defense atmosphere, crabs with ice crystal shells, marine snow particles, $STYLE" -o "$OUTDIR/biome-frost.png" -s 1344x768 &

echo "[5/9] Generating Mangrove Wardens biome..."
z-ai image -p "Mangrove Wardens swamp forest biome underwater, moss green and brown palette, giant mangrove roots descending, swamp-lantern flowers glowing, dense root labyrinths, regeneration and endurance atmosphere, crabs with root-cage shells, $STYLE" -o "$OUTDIR/biome-mangrove.png" -s 1344x768 &

echo "[6/9] Generating Stormwake biome..."
z-ai image -p "Stormwake storm rift biome underwater, electric violet and silver palette, lightning crackling through water, dark storm clouds above, charged energy rifts, speed and crit atmosphere, crabs with charged shells, electric sparks, $STYLE" -o "$OUTDIR/biome-storm.png" -s 1344x768 &

echo "[7/9] Generating Moonpool biome..."
z-ai image -p "Moonpool night tide pool biome underwater, midnight blue and silver-white palette, glowing bioluminescent plankton everywhere, moonlight filtering from surface, mysterious trickery and evasion atmosphere, crabs with moon-conch shells, shimmering particles, $STYLE" -o "$OUTDIR/biome-moon.png" -s 1344x768 &

echo "[8/9] Generating Coliseum battle arena..."
z-ai image -p "Underwater coliseum battle arena, ancient coral stone amphitheater, glowing rune circles on sandy floor, faction banners around the ring, dramatic spotlight from above, treasure chest at center, epic combat stage, neutral ground, $STYLE" -o "$OUTDIR/arena.png" -s 1344x768 &

echo "[9/9] Generating Seabed dive map..."
z-ai image -p "Wide underwater seabed dive map view, scattered glowing dig sites with treasure glints, kelp forests, rock formations, small crab teams digging with picks, distant silhouettes of raiders approaching, depth fog, caustic light overlays, top-down isometric angle, $STYLE" -o "$OUTDIR/seabed-map.png" -s 1440x720 &

wait
echo "========================================"
echo "All image generation tasks complete!"
ls -lh "$OUTDIR"
