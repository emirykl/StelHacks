"use client";

import { useEffect, useRef } from "react";
import styles from "./particle-text.module.css";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where the glyph wants this particle; everything else is the way back to it. */
  tx: number;
  ty: number;
  size: number;
};

/**
 * How far apart the word is sampled, against the size it is set at, because a
 * stride fixed in pixels is not a fixed density: the heading runs from 4rem to
 * 9rem and at the small end the same spacing puts a third as many particles
 * across a stroke, which reads as a word fading out rather than one assembling.
 * Held between two and four: below two it stops being particles and above four
 * the counters of the S and the R open up.
 */
const strideFor = (fontSize: number) => Math.min(3, Math.max(2, Math.round(fontSize / 56)));
const STIFFNESS = 0.048;
const DAMPING = 0.875;
const PUSH_FORCE = 5.5;
const ENTRANCE_SPREAD = 0.9;
/**
 * The reach of the cursor, as a fraction of the cap height rather than a fixed
 * distance: the hole it opens should stay about the same share of the word
 * across the heading's range, instead of nicking one letter on a laptop and
 * swallowing three on a phone.
 */
const pushRadiusFor = (fontSize: number) => Math.max(56, fontSize * 0.76);

/**
 * A heading rendered as particles that scatter under the cursor and settle back.
 *
 * The text is passed as a string rather than nodes because the canvas has to
 * measure and draw it, and there is no honest way to sample a React tree.
 */
export function ParticleText({ children, className }: { children: string; className?: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const surface = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const hostEl = host.current;
    const labelEl = label.current;
    const canvasEl = surface.current;
    if (!hostEl || !labelEl || !canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    const sampler = document.createElement("canvas");
    const sctx = sampler.getContext("2d", { willReadFrequently: true });
    if (!ctx || !sctx) return;

    const text = children;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: 0, y: 0, active: false };

    let particles: Particle[] = [];
    let colour = "#ffd91a";
    let bleed = 28;
    let pushRadius = 110;
    let boxWidth = 0;
    let boxHeight = 0;
    // The canvas position, cached: reading it on every pointer move forces a
    // layout on a handler that fires as fast as the mouse does.
    let originX = 0;
    let originY = 0;
    let ready = false;
    let hasEntered = false;
    let onscreen = false;
    let frame = 0;
    let resizeFrame = 0;

    const readOrigin = () => {
      const rect = canvasEl.getBoundingClientRect();
      originX = rect.left;
      originY = rect.top;
    };

    const build = () => {
      const rect = hostEl.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;

      const hostStyle = getComputedStyle(hostEl);
      colour = hostStyle.color;
      bleed = Number.parseFloat(hostStyle.getPropertyValue("--particle-bleed")) || 28;

      boxWidth = Math.ceil(rect.width) + bleed * 2;
      boxHeight = Math.ceil(rect.height) + bleed * 2;

      // Capped: past two device pixels per CSS pixel the particles are already
      // below the eye's reach and the fill cost keeps climbing.
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvasEl.width = Math.ceil(boxWidth * ratio);
      canvasEl.height = Math.ceil(boxHeight * ratio);
      canvasEl.style.width = `${boxWidth}px`;
      canvasEl.style.height = `${boxHeight}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      // Sampled at CSS resolution, because the stride and the particle
      // coordinates are both in CSS pixels. The device ratio is the drawing
      // side's problem only.
      sampler.width = boxWidth;
      sampler.height = boxHeight;
      sctx.clearRect(0, 0, boxWidth, boxHeight);

      // Taken from the element rather than restated here, so the particles
      // follow the heading through its clamp and through a font swap instead of
      // tracking a second copy of the type ramp that would drift from it.
      const labelStyle = getComputedStyle(labelEl);
      sctx.font = `${labelStyle.fontStyle} ${labelStyle.fontWeight} ${labelStyle.fontSize} ${labelStyle.fontFamily}`;
      // Missing from some 2D contexts, where the word samples a little wider
      // than the heading. Nothing downstream measures against the DOM box.
      sctx.letterSpacing = labelStyle.letterSpacing;
      sctx.textBaseline = "alphabetic";
      sctx.fillStyle = "#000";

      const metrics = sctx.measureText(text);
      const ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent;
      // The baseline CSS itself would have used: half the leading, then the
      // ascent. Centring the ink instead drifts the word against the line above
      // it by a few pixels, and against a heading that size it shows.
      const baseline = bleed + (rect.height - (ascent + descent)) / 2 + ascent;
      // Where the heading actually sits, not where the box starts. The host is
      // a block and fills the column, so drawing at the left edge put the word
      // hard against it while the line above stayed centred. Taken from the
      // label's own box, so the particles follow whatever alignment the
      // heading is given rather than a second opinion about it. The measured
      // ink is then centred inside that box: where a context ignores letter
      // spacing the sampled word runs wider than the DOM one, and splitting
      // the difference keeps it on the same axis instead of leaning right.
      const labelRect = labelEl.getBoundingClientRect();
      const left = bleed + (labelRect.left - rect.left) + (labelRect.width - metrics.width) / 2;
      sctx.fillText(text, left, baseline);

      const pixels = sctx.getImageData(0, 0, boxWidth, boxHeight).data;
      const fontSize = Number.parseFloat(labelStyle.fontSize) || 64;
      const stride = strideFor(fontSize);
      pushRadius = pushRadiusFor(fontSize);
      const next: Particle[] = [];
      for (let y = 0; y < boxHeight; y += stride) {
        for (let x = 0; x < boxWidth; x += stride) {
          // Half alpha, so the antialiased rim of a stroke does not grow a
          // second sparser outline around every letter.
          if (pixels[(y * boxWidth + x) * 4 + 3] <= 128) continue;
          // Carried over by index on a rebuild: a resize should retarget the
          // particles that are already on screen, not restart the assembly.
          const previous = particles[next.length];
          const angle = Math.random() * Math.PI * 2;
          const distance = fontSize * (0.35 + Math.random() * ENTRANCE_SPREAD);
          next.push({
            // On first paint the word arrives from a loose cloud around its
            // final outline. Rebuilds keep the existing positions so a resize
            // does not replay the entrance while somebody is reading.
            x: previous ? previous.x : x + Math.cos(angle) * distance,
            y: previous ? previous.y : y + Math.sin(angle) * distance + fontSize * 0.2,
            vx: previous ? previous.vx : 0,
            vy: previous ? previous.vy : 0,
            // Nudged off the sampling lattice. Landing on it exactly puts every
            // particle in a row with its neighbours and the settled word reads
            // as a halftone screen rather than as a cloud that happens to agree.
            tx: x + (Math.random() - 0.5) * stride,
            ty: y + (Math.random() - 0.5) * stride,
            // Tied to the stride for the same reason the stride is tied to the
            // size: a particle has to stay a fraction of the gap it sits in,
            // or the cloud closes into solid type at the small end.
            size: stride * (0.72 + Math.random() * 0.5),
          });
        }
      }
      particles = next;
      ready = particles.length > 0;
      readOrigin();
      hostEl.dataset.particles = ready && !reduced.matches ? "on" : "off";
      if (ready && !hasEntered && !reduced.matches) {
        hasEntered = true;
        hostEl.dataset.entering = "true";
        window.setTimeout(() => {
          if (hostEl.isConnected) hostEl.dataset.entering = "false";
        }, 1_500);
      }
    };

    const tick = () => {
      frame = requestAnimationFrame(tick);
      ctx.clearRect(0, 0, boxWidth, boxHeight);
      ctx.fillStyle = colour;
      ctx.shadowColor = colour;
      ctx.shadowBlur = 2.5;
      for (const p of particles) {
        let ax = (p.tx - p.x) * STIFFNESS;
        let ay = (p.ty - p.y) * STIFFNESS;
        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const distance = Math.hypot(dx, dy);
          if (distance < pushRadius && distance > 0.5) {
            const force = (1 - distance / pushRadius) * PUSH_FORCE;
            ax += (dx / distance) * force;
            ay += (dy / distance) * force;
          }
        }
        p.vx = (p.vx + ax) * DAMPING;
        p.vy = (p.vy + ay) * DAMPING;
        p.x += p.vx;
        p.y += p.vy;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    };

    const sync = () => {
      const should = ready && onscreen && !reduced.matches && !document.hidden;
      hostEl.dataset.particles = ready && !reduced.matches ? "on" : "off";
      if (should && !frame) {
        frame = requestAnimationFrame(tick);
      } else if (!should && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX - originX;
      pointer.y = event.clientY - originY;
      pointer.active = true;
    };
    const onPointerOut = () => {
      pointer.active = false;
    };

    const viewport = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting;
      sync();
    });
    viewport.observe(hostEl);

    const resized = new ResizeObserver(() => {
      if (!ready || resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        build();
        sync();
      });
    });
    resized.observe(hostEl);

    // Sampling before the display face arrives would trace the fallback and
    // freeze its shapes. Until then the heading is just the heading.
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      build();
      sync();
    });

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerout", onPointerOut, { passive: true });
    window.addEventListener("scroll", readOrigin, { passive: true });
    window.addEventListener("resize", readOrigin);
    reduced.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      cancelled = true;
      viewport.disconnect();
      resized.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("scroll", readOrigin);
      window.removeEventListener("resize", readOrigin);
      reduced.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      if (frame) cancelAnimationFrame(frame);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      hostEl.dataset.particles = "off";
    };
  }, [children]);

  return (
    <span
      ref={host}
      className={className ? `${styles.host} ${className}` : styles.host}
      data-particles="off"
    >
      <span ref={label} className={styles.label}>
        {children}
      </span>
      <canvas ref={surface} className={styles.canvas} aria-hidden="true" />
    </span>
  );
}
