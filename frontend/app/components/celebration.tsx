"use client";

import { useEffect, useRef } from "react";

/**
 * The one moment in this product worth celebrating on screen.
 *
 * Somebody has just signed money into a stranger's prize pool, irreversibly,
 * for people they will probably never meet. Every other confirmation here is a
 * hash and a sentence; this one gets the coins.
 *
 * Drawn rather than installed. A confetti library is a dependency and a bundle
 * on every page that might one day show one, and what it does is two hundred
 * rectangles under gravity — which is this file, at a size somebody can read in
 * one sitting.
 *
 * It paints nothing at all under reduced motion. A burst of moving objects is
 * the exact thing that setting is asking not to be shown, and the panel behind
 * it already says in words that the money landed.
 */

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians, and the speed it turns at, so the shapes tumble rather than slide. */
  spin: number;
  turn: number;
  size: number;
  colour: string;
  /** A coin is drawn as a struck disc; everything else is a paper rectangle. */
  coin: boolean;
  /** Seconds of life left, which is also what fades it out at the end. */
  life: number;
}

/* The product's own palette. Confetti in somebody else's colours is confetti
   from somebody else's site, and the gold is the same yellow the heading and
   the prize figures are set in. */
const COLOURS = ["#ffd91a", "#f5c400", "#1f8a4c", "#111110", "#ffffff"];
const GRAVITY = 900;
const DRAG = 0.86;

export function Celebration({ fire }: { fire: boolean }) {
  const surface = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = surface.current;

    if (!fire || !canvasEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvasEl.getContext("2d");

    if (!ctx) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    let width = window.innerWidth;
    let height = window.innerHeight;

    const measure = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvasEl.width = Math.ceil(width * ratio);
      canvasEl.height = Math.ceil(height * ratio);
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    measure();

    /* Two cannons at the lower corners rather than one shower from the top.
       The corners throw across the middle of the screen, which is where the
       panel saying what just happened is, so the two are read together. */
    const pieces: Piece[] = [];

    for (const [originX, aim] of [
      [width * 0.08, -Math.PI / 3.4],
      [width * 0.92, -Math.PI + Math.PI / 3.4],
    ] as const) {
      for (let at = 0; at < 90; at += 1) {
        const angle = aim + (Math.random() - 0.5) * 0.7;
        const speed = 900 + Math.random() * 700;
        /* One in four is a coin. Enough that money is what the burst is about,
           few enough that it still reads as confetti rather than as a jackpot
           machine. */
        const coin = at % 4 === 0;

        pieces.push({
          x: originX,
          y: height * 0.92,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          spin: Math.random() * Math.PI * 2,
          turn: (Math.random() - 0.5) * 12,
          size: coin ? 7 + Math.random() * 5 : 5 + Math.random() * 7,
          colour: coin ? "#ffd91a" : COLOURS[at % COLOURS.length]!,
          coin,
          life: 2.6 + Math.random() * 1.6,
        });
      }
    }

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      /* Clamped, because a tab that was hidden hands back a step of several
         seconds and every piece would leave the screen inside one frame. */
      const step = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      ctx.clearRect(0, 0, width, height);

      let alive = false;

      for (const piece of pieces) {
        if (piece.life <= 0) continue;

        alive = true;
        piece.life -= step;
        piece.vy += GRAVITY * step;
        piece.vx *= DRAG ** step;
        piece.vy *= DRAG ** step;
        piece.x += piece.vx * step;
        piece.y += piece.vy * step;
        piece.spin += piece.turn * step;

        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.spin);
        ctx.globalAlpha = Math.min(1, piece.life);
        ctx.fillStyle = piece.colour;

        if (piece.coin) {
          /* Squashed by its own rotation rather than spun as a flat disc, so a
             coin turns edge on the way a tossed one does. */
          ctx.beginPath();
          ctx.ellipse(0, 0, piece.size, piece.size * Math.abs(Math.cos(piece.spin)), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#b98a00";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else {
          ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.6);
        }

        ctx.restore();
      }

      frame = alive ? requestAnimationFrame(tick) : 0;

      if (!alive) ctx.clearRect(0, 0, width, height);
    };

    frame = requestAnimationFrame(tick);
    window.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("resize", measure);
      if (frame) cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
    };
  }, [fire]);

  if (!fire) {
    return null;
  }

  /* Over everything, including the panel that triggered it, and deaf to the
     pointer: the button underneath has to stay pressable while this plays. */
  return (
    <canvas
      ref={surface}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100]"
    />
  );
}
