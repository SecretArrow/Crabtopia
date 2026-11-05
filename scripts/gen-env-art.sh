#!/bin/bash
# Crabtopia - Environment & UI art generator (Glow-Tide Storybook style)
# Uses the z-ai CLI for image generation with retry + bounded parallelism.
set -u

BIOMES_DIR="/home/z/my-project/download/art/biomes"
UI_DIR="/home/z/my-project/download/art/ui"
LOG_DIR="/tmp/gen-art-logs"
mkdir -p "$BIOMES_DIR" "$UI_DIR" "$LOG_DIR"

MAX_JOBS=${MAX_JOBS:-3}

STYLE="Glow-Tide Storybook art style, rich hand-painted 2D, chunky expressive silhouettes, soft rim lighting, glowing plankton, jewel-toned colors, original game concept art, cute but breathtaking, high quality, detailed"

# generate <prompt> <size> <output_path>
generate() {
  local prompt="$1"; local size="$2"; local output="$3"
  local name; name=$(basename "$output")
  if [ -s "$output" ]; then
    echo "[SKIP] $name already exists ($(stat -c%s "$output") bytes)"
    return 0
  fi
  local attempt=1
  while [ $attempt -le 3 ]; do
    echo "[TRY $attempt] $name ($size)"
    if z-ai image --prompt "$prompt" --size "$size" --output "$output" > "$LOG_DIR/$name.log" 2>&1; then
      if [ -s "$output" ]; then
        echo "[OK] $name -> $(stat -c%s "$output") bytes"
        return 0
      fi
    fi
    echo "[FAIL $attempt] $name"; tail -n 5 "$LOG_DIR/$name.log" 2>/dev/null
    rm -f "$output"
    attempt=$((attempt+1))
    sleep 2
  done
  echo "[GIVEUP] $name after 3 attempts"
  return 1
}

# run_with_limit <args...>  - background a generate call respecting MAX_JOBS
run_with_limit() {
  while [ "$(jobs -r 2>/dev/null | wc -l)" -ge "$MAX_JOBS" ]; do sleep 1; done
  generate "$@" &
}

# ---------- ENVIRONMENT / BIOME ART (1920x1080 -> 1344x768) ----------
BIOME_SIZE="1344x768"

run_with_limit "$STYLE. Underwater coral reef metropolis city, towering coral spires in coral pink and sunlit gold, glowing tide-gardens of bioluminescent plankton, parallax background depth with layered reef architecture, schools of tiny glowing fish, sea-glass aqua water haze, deepwater navy shadows, whimsical storybook fantasy, no text, no characters, wide landscape" "$BIOME_SIZE" "$BIOMES_DIR/biome-coral.png"

run_with_limit "$STYLE. Underwater volcanic vent biome, glowing lava glass streams in ember red and lava orange, cracked black obsidian seabed, rising ember bubbles, molten cracks with inner glow, dark storm violet shadows, smoky deepwater navy water, dramatic rim lighting on jagged volcanic rocks, storybook fantasy, no text, no characters, wide landscape" "$BIOME_SIZE" "$BIOMES_DIR/biome-cinder.png"

run_with_limit "$STYLE. Underwater frozen ice shelf biome, towering translucent ice formations in frost white and sea-glass aqua, aurora ribbons of lagoon teal and storm violet shimmering in the water above, crystalline frozen caves, glowing plankton trapped in ice, deepwater navy depths, soft moonlight silver rim light, storybook fantasy, no text, no characters, wide landscape" "$BIOME_SIZE" "$BIOMES_DIR/biome-frost.png"

run_with_limit "$STYLE. Underwater mangrove swamp forest biome, twisted moss green roots descending from above, swamp-lantern glowing moss green and sunlit gold orbs hanging from roots, murky brown tea-stained water, deepwater navy shadows, bioluminescent spores floating, chunky root silhouettes, storybook fantasy, no text, no characters, wide landscape" "$BIOME_SIZE" "$BIOMES_DIR/biome-mangrove.png"

run_with_limit "$STYLE. Underwater storm front biome, electric storm violet lightning rifts splitting the water, moonlight silver flashes, churning deepwater navy currents, glowing charged plankton, jagged silver storm cloud silhouettes above, dramatic rim lighting, storybook fantasy, no text, no characters, wide landscape" "$BIOME_SIZE" "$BIOMES_DIR/biome-storm.png"

run_with_limit "$STYLE. Night tide pool biome, midnight blue and moonlight silver moonlit pools, glowing bioluminescent plankton swirls in sea-glass aqua, reflective still water surfaces, gentle moonlight silver rays from above, deepwater navy depths, chunky rounded pool stones, serene storybook fantasy, no text, no characters, wide landscape" "$BIOME_SIZE" "$BIOMES_DIR/biome-moon.png"

run_with_limit "$STYLE. Top-down underwater seabed treasure dive map view, glowing dig sites marked with sunlit gold X marks, treasure glints sparkling in coral pink and sea-glass aqua, scattered pick-axes resting on sandy seabed, dotted treasure trails, deepwater navy water with lagoon teal currents, jewel-toned storybook fantasy cartography, no text labels, wide landscape" "$BIOME_SIZE" "$BIOMES_DIR/dive-map.png"

run_with_limit "$STYLE. Underwater coral metropolis capital city hub, grand central palace of glowing coral pink and sunlit gold, tiered reef towers with sea-glass aqua windows, bioluminescent plankton street-lights, lagoon teal canals, deepwater navy sky with moonlight silver stars, sweeping storybook fantasy architecture, no text, no characters, wide landscape" "$BIOME_SIZE" "$BIOMES_DIR/crabtopia-city.png"

# ---------- UI ART ----------
# Logo (1200x400 -> 1440x720 wide)
run_with_limit "$STYLE. Game title logo banner with the word CRABTOPIA in large rounded bold fantasy display lettering, glowing coral pink and sunlit gold filigree text, underwater coral and bubble ornaments framing the word, tiny glowing plankton sparkles, sea-glass aqua glow, deepwater navy background, storybook fantasy, centered wide banner composition" "1440x720" "$UI_DIR/logo.png"

# App icon (512x512 -> 1024x1024)
run_with_limit "$STYLE. Cute cartoon crab face with big friendly eyes and a glowing sunlit gold crown, coral pink shell, chunky rounded silhouette, glowing gold rim light, sea-glass aqua bubbles, deepwater navy circular background, app icon centered composition, storybook fantasy" "1024x1024" "$UI_DIR/app-icon.png"

# Faction emblems (256x256 -> 1024x1024)
EMBLEM_SIZE="1024x1024"
run_with_limit "$STYLE. Circular faction emblem badge, coral pink and sunlit gold, central glowing sun symbol radiating over a reef, ornate gold filigree ring border, sea-glass aqua glow accents, deepwater navy background, storybook fantasy crest, centered icon composition, no text" "$EMBLEM_SIZE" "$UI_DIR/emblem-coral.png"
run_with_limit "$STYLE. Circular faction emblem badge, ember red and black, central glowing volcano with lava symbol, ornate dark gold filigree ring border, lava orange glow accents, deepwater navy background, storybook fantasy crest, centered icon composition, no text" "$EMBLEM_SIZE" "$UI_DIR/emblem-cinder.png"
run_with_limit "$STYLE. Circular faction emblem badge, ice blue and frost white, central glowing snowflake with aurora ribbons, ornate silver filigree ring border, sea-glass aqua glow accents, deepwater navy background, storybook fantasy crest, centered icon composition, no text" "$EMBLEM_SIZE" "$UI_DIR/emblem-frost.png"
run_with_limit "$STYLE. Circular faction emblem badge, moss green and brown, central glowing leaf and twisted root symbol, ornate bronze gold filigree ring border, sunlit gold glow accents, deepwater navy background, storybook fantasy crest, centered icon composition, no text" "$EMBLEM_SIZE" "$UI_DIR/emblem-mangrove.png"
run_with_limit "$STYLE. Circular faction emblem badge, electric storm violet and moonlight silver, central glowing lightning bolt symbol, ornate silver filigree ring border, sea-glass aqua glow accents, deepwater navy background, storybook fantasy crest, centered icon composition, no text" "$EMBLEM_SIZE" "$UI_DIR/emblem-storm.png"
run_with_limit "$STYLE. Circular faction emblem badge, midnight blue and moonlight silver white, central glowing crescent moon symbol, ornate silver filigree ring border, sea-glass aqua plankton glow accents, deepwater navy background, storybook fantasy crest, centered icon composition, no text" "$EMBLEM_SIZE" "$UI_DIR/emblem-moon.png"

# Gold coin (128x128 -> 1024x1024)
run_with_limit "$STYLE. Single shiny gold coin icon front view, sunlit gold metal with a small cute crab embossed in the center, glowing rim light, sea-glass aqua sparkle, deepwater navy background, storybook fantasy, centered icon composition, no text" "1024x1024" "$UI_DIR/gold-coin.png"

# Treasure chest (512x512 -> 1024x1024)
run_with_limit "$STYLE. Open treasure chest underwater bursting with multicolor rarity light, sunlit gold coins and coral pink gems spilling out, radiant sea-glass aqua and storm violet light burst, glowing plankton swirling, chunky wooden chest with gold filigree, deepwater navy background, storybook fantasy, centered icon composition, no text" "1024x1024" "$UI_DIR/treasure-chest.png"

# UI panel (800x600 -> 1152x864)
run_with_limit "$STYLE. Soft glass UI panel texture, semi-transparent sea-glass aqua blue glass, rounded corners, ornate coral pink and sunlit gold filigree border frame, subtle glowing plankton specks inside, deepwater navy tint, storybook fantasy game interface panel, centered composition, no text" "1152x864" "$UI_DIR/ui-panel.png"

# Loading screen (1920x1080 -> 1344x768)
run_with_limit "$STYLE. Cute cartoon crab character waving cheerfully, surrounded by rising sea-glass aqua bubbles, glowing plankton sparkles, coral pink crab with sunlit gold shell details, deepwater navy underwater background with lagoon teal currents, storybook fantasy, wide loading screen composition, no text" "1344x768" "$UI_DIR/loading-screen.png"

# Empty state (512x512 -> 1024x1024)
run_with_limit "$STYLE. Sad cute cartoon crab holding an empty broken shell, big droopy expressive eyes, coral pink crab, single glowing plankton tear sparkle, sea-glass aqua bubbles, deepwater navy soft background, storybook fantasy, centered icon composition, no text" "1024x1024" "$UI_DIR/empty-state.png"

wait
echo "=== ALL JOBS COMPLETE ==="
