// Unit guards for the anti-duplication rules (docs/dedup-audit.md):
//
//  1. The nav registry (GameShell NAV_ITEMS) has unique screen ids AND
//     unique labels — one entry point per feature, never two.
//  2. Breeding has exactly ONE surface: the Nursery. The old parallel
//     BreedingScreen ("Nursery Spire") must not come back, no render
//     file besides the Nursery may drive the store's breed action, and
//     the Nursery must carry the child-element possibilities panel.
//  3. Old saves persisted with currentScreen="breeding" still land on
//     the Nursery via the legacy switch alias (one shared return).
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function navEntries(): Array<{ id: string; label: string }> {
  const shell = read("src/game/render/GameShell.tsx");
  const start = shell.indexOf("const NAV_ITEMS = [");
  const end = shell.indexOf("];", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const block = shell.slice(start, end);
  const entries: Array<{ id: string; label: string }> = [];
  for (const m of block.matchAll(/\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)) {
    entries.push({ id: m[1], label: m[2] });
  }
  return entries;
}

function renderFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...renderFiles(p));
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

describe("nav registry — one entry point per feature", () => {
  it("has unique screen ids and unique labels", () => {
    const entries = navEntries();
    expect(entries.length).toBeGreaterThanOrEqual(10);
    const ids = entries.map((e) => e.id);
    const labels = entries.map((e) => e.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("routes breeding solely through the Nursery entry", () => {
    const entries = navEntries();
    expect(entries.filter((e) => e.id === "nursery")).toHaveLength(1);
    expect(entries.find((e) => e.id === "breeding")).toBeUndefined();
    expect(entries.find((e) => e.label === "Breeding")).toBeUndefined();
  });
});

describe("breeding — exactly one implementation (the Nursery)", () => {
  it("the duplicate BreedingScreen is gone and unreferenced", () => {
    expect(
      existsSync(join(ROOT, "src/game/render/activities/BreedingScreen.tsx")),
    ).toBe(false);
    const shell = read("src/game/render/GameShell.tsx");
    expect(shell).not.toContain("BreedingScreen");
  });

  it("only the Nursery drives the store breed action", () => {
    const users = renderFiles("src/game/render").filter((f) =>
      read(f).includes("useGame((s) => s.breed)"),
    );
    expect(users).toEqual([join("src/game/render/screens/NurseryScreen.tsx")]);
  });

  it("the canonical surface carries the child-element possibilities panel", () => {
    const nursery = read("src/game/render/screens/NurseryScreen.tsx");
    expect(nursery).toContain('data-testid="breeding-element-preview"');
  });

  it("legacy currentScreen='breeding' saves land on the Nursery (shared alias)", () => {
    const shell = read("src/game/render/GameShell.tsx");
    expect(shell).toContain('case "breeding":');
    expect(shell).toContain('case "nursery":');
    // One shared render for both labels — not two implementations.
    expect(shell.match(/return <NurseryScreen \/>/g)).toHaveLength(1);
  });
});
