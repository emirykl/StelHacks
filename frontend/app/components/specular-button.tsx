"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEventHandler, type ReactNode } from "react";
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";

import "./specular-button.css";

/**
 * The specular button, vendored from React Bits.
 *
 * A WebGL rim light that follows the cursor: the shader measures the distance
 * from each pixel to a rounded rectangle and lights the edge where it faces
 * the pointer. It is the one piece of decoration in this product that is
 * allowed to be decoration, and it is spent on the two buttons that ask
 * somebody to commit to something: signing in, and entering a hackathon.
 *
 * Five changes from the published source, and no others.
 *
 * It can render as a link. Signing in and registering are navigations, and a
 * `<button>` that calls `router.push` is a link that middle click, open in new
 * tab and copy link address all refuse to work on.
 *
 * It is typed, because this project is.
 *
 * The loop stops when the tab is hidden. The original runs a
 * `requestAnimationFrame` for the life of the page, which on a header that
 * appears on every screen is a shader running behind whatever else somebody is
 * doing. `document.hidden` is enough to stop that without touching the effect
 * anybody actually sees.
 *
 * The sweep holds still for anybody who has asked their system to stop
 * animating things. The original turns regardless, which on a button that
 * turns for the life of the page is exactly the motion that setting exists to
 * refuse.
 *
 * And one line of the shader, marked where it happens: the highlight is kept
 * inside the edge instead of being allowed to spill past it.
 */

const PAD = 20;

const TURN = Math.PI * 2;

/** An angle in [0, 2π), whatever sign it arrived with. */
function wrap(angle: number): number {
  return ((angle % TURN) + TURN) % TURN;
}

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 uCenter;
uniform vec2 uHalfSize;
uniform float uRadius;
uniform float uAngle;
uniform float uPx;
uniform vec3 uLineColor;
uniform vec3 uBaseColor;
uniform float uIntensity;
uniform float uShineSize;
uniform float uShineFade;
uniform float uThickness;
uniform float uBaseWidth;

out vec4 fragColor;

float sdRoundedRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float shapeSDF(vec2 p) { return sdRoundedRect(p, uHalfSize, uRadius); }

float gaussianLine(float d, float sigma) {
  float x = d / (sigma + 1e-6);
  float k = mix(1.0, 1.6, smoothstep(0.0, 1.5, x));
  return exp(-k * x * x);
}

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float d = shapeSDF(p);
  vec2 L = vec2(cos(uAngle), sin(uAngle));

  // Changed. Everything the shader draws is kept on the inside of the edge.
  //
  // Published, the base stroke and the highlight both spilled outward by about
  // a pixel, which is invisible along a straight edge and not at the two ends
  // of a capsule: there the rim turns through half a circle in a few pixels,
  // the spill from every part of that turn lands in the same place outside it,
  // and the button grew a pale ear on each end. Against the dark page this was
  // drawn for, the spill was the colour of the ground and nobody saw it.
  float inside = 1.0 - smoothstep(0.0, 1.2 * uPx, max(d, 0.0));

  // Dark base stroke hugging the edge for a sense of thickness
  float base = (1.0 - smoothstep(0.0, uBaseWidth, abs(d))) * 0.45 * inside;

  // Symmetric specular: the edges facing toward/away from the light both
  // catch a streak. The angular window (size + fade) is measured with an
  // elliptical normal so it varies continuously along straight edges.
  vec2 nEll = normalize(p / (uHalfSize * uHalfSize) + 1e-6);
  float phi = acos(clamp(abs(dot(nEll, L)), 0.0, 1.0));
  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);
  float line = gaussianLine(d, uThickness);
  float edgeClamp = 1.0 - smoothstep(0.5 * uPx, 3.0 * uPx, abs(d));
  float hi = line * rim * edgeClamp * inside * uIntensity;

  vec3 col = uBaseColor * base + uLineColor * hi;
  float a = clamp(base + hi, 0.0, 1.0);
  fragColor = vec4(col, a);
}
`;

export interface SpecularButtonProps {
  children?: ReactNode;
  size?: "sm" | "md" | "lg";
  radius?: number;
  tint?: string;
  tintOpacity?: number;
  blur?: number;
  textColor?: string;
  lineColor?: string;
  baseColor?: string;
  intensity?: number;
  shineSize?: number;
  shineFade?: number;
  thickness?: number;
  speed?: number;
  followMouse?: boolean;
  proximity?: number;
  autoAnimate?: boolean;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  className?: string;
  type?: "button" | "submit" | "reset";
  /** Renders a link rather than a button, for the presses that navigate. */
  href?: string;
}

export function SpecularButton({
  children = "Get Started",
  size = "lg",
  radius = 18,
  tint = "#ffffff",
  tintOpacity = 0,
  blur = 0,
  textColor = "#f5f5f5",
  lineColor = "#ffffff",
  baseColor = "#525252",
  intensity = 1,
  shineSize = 10,
  shineFade = 40,
  thickness = 1,
  speed = 0.35,
  followMouse = true,
  proximity = 250,
  autoAnimate = false,
  disabled = false,
  onClick,
  className = "",
  type = "button",
  href,
}: SpecularButtonProps) {
  const btnRef = useRef<HTMLElement>(null);
  const fxRef = useRef<HTMLSpanElement>(null);
  const propsRef = useRef({
    radius,
    lineColor,
    baseColor,
    intensity,
    shineSize,
    shineFade,
    thickness,
    speed,
    followMouse,
    proximity,
    autoAnimate,
  });

  propsRef.current = {
    radius,
    lineColor,
    baseColor,
    intensity,
    shineSize,
    shineFade,
    thickness,
    speed,
    followMouse,
    proximity,
    autoAnimate,
  };

  useEffect(() => {
    const btn = btnRef.current;
    const fx = fxRef.current;

    if (btn === null || fx === null) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      dpr,
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const geometry = new Triangle(gl);

    if (geometry.attributes.uv) {
      delete geometry.attributes.uv;
    }

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uCenter: { value: [0, 0] },
        uHalfSize: { value: [1, 1] },
        uRadius: { value: 0 },
        uAngle: { value: 2.4 },
        uPx: { value: dpr },
        uLineColor: { value: [1, 1, 1] },
        uBaseColor: { value: [0.32, 0.32, 0.32] },
        uIntensity: { value: 1 },
        uShineSize: { value: 0.17 },
        uShineFade: { value: 0.7 },
        uThickness: { value: 1 },
        uBaseWidth: { value: dpr },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });
    fx.appendChild(gl.canvas);

    const sizeRef = { w: 1, h: 1 };

    const resize = () => {
      /* Fractional size + explicit center keep the SDF pinned to the exact
         CSS border, instead of drifting up to a pixel from offsetWidth
         rounding. */
      const rect = btn.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      sizeRef.w = w;
      sizeRef.h = h;
      renderer.setSize(w + PAD * 2, h + PAD * 2);
      program.uniforms["uCenter"].value = [(PAD + w / 2) * dpr, (PAD + h / 2) * dpr];
      program.uniforms["uHalfSize"].value = [(w / 2) * dpr, (h / 2) * dpr];
    };

    const ro = new ResizeObserver(resize);
    ro.observe(btn);
    resize();

    /* Light angle steers toward the pointer (anywhere on the page) and falls
       back to a slow sweep when the pointer hasn't moved yet. */
    let pointerAngle: number | null = null;
    let proximityT = 0;

    const onPointerMove = (event: PointerEvent) => {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
      const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
      const dist = Math.hypot(dx, dy);

      /* Over the button itself the light settles on the diagonal (framing the
         corners) and gently sways with the cursor position within it. */
      if (dist === 0) {
        const nx = (event.clientX - cx) / (rect.width / 2);
        const ny = (cy - event.clientY) / (rect.height / 2);
        pointerAngle = Math.atan2(2 / rect.height, -2 / rect.width) + nx * 0.3 + ny * 0.15;
      } else {
        pointerAngle = Math.atan2(cy - event.clientY, event.clientX - cx);
      }

      const t = Math.max(0, 1 - dist / Math.max(propsRef.current.proximity, 1));
      proximityT = t * t * (3 - 2 * t);
    };

    window.addEventListener("pointermove", onPointerMove);

    /* Read every frame rather than once, so the setting changing mid session
       is honoured without a listener. A light that turns forever is motion
       nobody asked for, and somebody who has said so should get the lit rim
       and none of the turning. */
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    let angle = 2.4;
    let idleAngle = 2.4;
    let bright = 0;
    let last = performance.now();
    let raf = 0;

    const lineC = new Color();
    const baseC = new Color();

    const update = (now: number) => {
      raf = requestAnimationFrame(update);

      /* A hidden tab has no cursor over it and nobody looking at it. The
         original ran the shader anyway for as long as the page was open. */
      if (document.hidden) {
        last = now;
        return;
      }

      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const p = propsRef.current;

      if (!still.matches) {
        idleAngle = wrap(idleAngle + p.speed * dt);
      }
      const steer = p.followMouse && pointerAngle !== null && (!p.autoAnimate || proximityT > 0);
      const target = steer ? (pointerAngle as number) : idleAngle;

      /*
        Shortest way round, and it has to be computed on wrapped angles.

        The published source kept neither: `idleAngle` grew for as long as the
        page was open and `angle` followed it up. The wrap below relies on
        JavaScript's `%`, which keeps the sign of the dividend, so once the two
        were more than a turn apart it returned a difference outside the half
        turn it is supposed to and the rim raced round instead of settling. On a
        button sitting on the page it took a few minutes to show up, which is
        why it looked like it happened for no reason.
      */
      angle = wrap(angle);
      const diff = wrap(target - angle + Math.PI) - Math.PI;
      angle = wrap(angle + diff * (1 - Math.exp(-dt * 7)));

      /* Shine fades in with pointer proximity unless autoAnimate keeps it on */
      const brightTarget = p.autoAnimate ? 1 : proximityT;
      bright += (brightTarget - bright) * (1 - Math.exp(-dt * 8));

      lineC.set(p.lineColor);
      baseC.set(p.baseColor);
      program.uniforms["uAngle"].value = angle;
      program.uniforms["uRadius"].value =
        Math.min(p.radius, Math.min(sizeRef.w, sizeRef.h) / 2) * dpr;
      program.uniforms["uLineColor"].value = [lineC.r, lineC.g, lineC.b];
      program.uniforms["uBaseColor"].value = [baseC.r, baseC.g, baseC.b];
      program.uniforms["uIntensity"].value = p.intensity * bright;
      program.uniforms["uShineSize"].value = (p.shineSize * Math.PI) / 180;
      program.uniforms["uShineFade"].value = (p.shineFade * Math.PI) / 180;
      program.uniforms["uThickness"].value = p.thickness * dpr;
      renderer.render({ scene: mesh });
    };

    raf = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointerMove);

      if (gl.canvas.parentNode === fx) {
        fx.removeChild(gl.canvas);
      }

      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  const shell = {
    className: `specular-button specular-button--${size}${className ? ` ${className}` : ""}`,
    style: {
      "--sb-radius": `${radius}px`,
      "--sb-tint": tint,
      "--sb-tint-opacity": tintOpacity,
      "--sb-blur": `${blur}px`,
      "--sb-text-color": textColor,
    } as React.CSSProperties,
  };

  const inside = (
    <>
      <span ref={fxRef} className="specular-button__fx" aria-hidden="true" />
      <span className="specular-button__label">{children}</span>
    </>
  );

  if (href !== undefined) {
    return (
      <Link
        ref={btnRef as React.Ref<HTMLAnchorElement>}
        href={href}
        onClick={onClick}
        aria-disabled={disabled || undefined}
        {...shell}
      >
        {inside}
      </Link>
    );
  }

  return (
    <button
      ref={btnRef as React.Ref<HTMLButtonElement>}
      type={type}
      disabled={disabled}
      onClick={onClick}
      {...shell}
    >
      {inside}
    </button>
  );
}

export default SpecularButton;
