// Crabtopia — ParticleLayer
// Canvas renderer for the pooled ParticleSystem. One instance lives inside
// the battle arena: it runs a continuous ambient bubble emitter and renders
// event bursts (sparks on damage, sparkles on heal, splashes on wave
// skills) spawned from real battle actions. Particle count is hard-capped
// by the pool (600) and the layer is purely presentational — it never
// touches game state.

"use client";

import React from "react";
import { ParticleSystem, PARTICLE_PRESETS } from "./particles";
import { battleClock } from "./battleClock";

export interface ParticleBurst {
  id: number;
  preset: string;
  x: number;
  y: number;
  count?: number;
  /**
   * Optional palette override (elementFx.elementBurstColors): bursts
   * spawned for an element-driven damage action burst in the ATTACKER's
   * element colours instead of the preset's theme palette. Motion,
   * lifetime and shape still come from the preset.
   */
  colors?: string[];
}

const MAX_PARTICLES = 600;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function ParticleLayer({
  bursts,
  ambient = true,
}: {
  bursts: ParticleBurst[];
  ambient?: boolean;
}): React.ReactNode {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const systemRef = React.useRef<ParticleSystem | null>(null);
  if (systemRef.current === null) {
    systemRef.current = new ParticleSystem(MAX_PARTICLES);
  }
  const processedRef = React.useRef<Set<number>>(new Set());

  // Spawn bursts as they arrive.
  React.useEffect(() => {
    const sys = systemRef.current!;
    for (const b of bursts) {
      if (processedRef.current.has(b.id)) continue;
      processedRef.current.add(b.id);
      const base = PARTICLE_PRESETS[b.preset];
      const cfg = base && b.colors ? { ...base, colors: b.colors } : base;
      if (cfg) sys.spawnBurst(cfg, b.x, b.y, b.count ?? 12);
    }
    // Keep the processed set bounded.
    if (processedRef.current.size > 400) {
      processedRef.current = new Set(bursts.map((b) => b.id));
    }
  }, [bursts]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sys = systemRef.current!;
    const reduced = prefersReducedMotion();
    let raf = 0;
    let last = performance.now();
    let bubbleEmitter: { stop(): void } | null = null;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(parent.clientWidth * dpr);
      canvas.height = Math.round(parent.clientHeight * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    if (ambient && !reduced) {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth ?? 800;
      const h = parent?.clientHeight ?? 400;
      bubbleEmitter = sys.emitter(PARTICLE_PRESETS.bubbles, w / 2, h + 8);
      // The single emitter sits mid-arena; drift its x by re-seeding bursts
      // is unnecessary — bubbles spread via velocity.x randomness already.
    }

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const rawDt = Math.min(50, now - last);
      last = now;
      // Battle time only (this layer exists solely inside ArenaBattle):
      // particles freeze while paused and speed up at x2/x3.
      sys.update(battleClock.scaleDt(rawDt));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of sys.particles) {
        if (!p.alive) continue;
        const lifeT = p.age / Math.max(1, p.lifetime);
        ctx.globalAlpha = Math.max(0, 1 - lifeT) * 0.85;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x * dpr, p.y * dpr, Math.max(0.4, p.size * dpr * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      bubbleEmitter?.stop();
    };
  }, [ambient]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="particle-layer"
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{ width: "100%", height: "100%", zIndex: 25 }}
    />
  );
}
