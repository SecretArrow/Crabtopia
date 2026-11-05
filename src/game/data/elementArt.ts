// Crabtopia — canonical element icon mapping.
//
// EVERY element owns exactly one medallion icon (gold ring + navy
// disc, transparent corners) in public/art/elements/*.png, produced
// by scripts/build_element_icons.py from the generated medallions
// (circle detected from the gold ring; corner alpha asserted 0 for
// all 18 in scripts/element_icon_report.json). Icons appear in
// ElementBadge chips and the Codex — UI only, never baked into crab
// artwork (layer-separation rule).

import type { ElementId } from "../engine/elements";

export const ELEMENT_ART: Record<ElementId, string> = {
  vulkara: "/art/elements/vulkara.png",
  nerala: "/art/elements/nerala.png",
  bentala: "/art/elements/bentala.png",
  lintara: "/art/elements/lintara.png",
  anila: "/art/elements/anila.png",
  himara: "/art/elements/himara.png",
  rimba: "/art/elements/rimba.png",
  magmara: "/art/elements/magmara.png",
  taufan: "/art/elements/taufan.png",
  dentuma: "/art/elements/dentuma.png",
  vapora: "/art/elements/vapora.png",
  lodara: "/art/elements/lodara.png",
  pulvara: "/art/elements/pulvara.png",
  terika: "/art/elements/terika.png",
  obsidara: "/art/elements/obsidara.png",
  prismara: "/art/elements/prismara.png",
  andhakara: "/art/elements/andhakara.png",
  waja: "/art/elements/waja.png",
};

/** Medallion icon path for an element id. */
export function artForElement(id: ElementId): string {
  return ELEMENT_ART[id];
}
