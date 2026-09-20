"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../page.module.css";

/**
 * The five panels, four of them with a drawing.
 *
 * Nothing here moves. The drawings used to arrive from a direction each, tied
 * to the scroll, and the section was busier for it than it was clear: the
 * reader is here to read five short sentences, and a picture travelling across
 * the frame while they do is competing with them. A panel replaces the one
 * before it, the picture beside it is simply there, and the only motion left in
 * the section is the scroll itself.
 *
 * The art is yellow on black and the section behind it is very nearly black, so
 * the backgrounds are dropped with a screen blend rather than cut out of the
 * files. Nothing is re-encoded, the glow around each drawing lands on the page
 * instead of inside a rectangle, and there is no matte edge where a cut would
 * have left one.
 */
const features = [
  {
    label: "Official",
    title: "STELLAR’S",
    accent: "OFFICIAL HOME.",
    description: "One hackathon platform for Stellar, its ecosystem and its builders.",
    art: "/landing/official.jpeg",
  },
  {
    label: "Onchain",
    title: "BUILT ON",
    accent: "STELLAR.",
    description: "Participation, submissions and results. Recorded onchain.",
    art: "/landing/onchain.jpeg",
  },
  {
    label: "Judging",
    title: "THREE WAYS.",
    accent: "YOU DECIDE.",
    description: "Full jury. Weighted jury and community vote. Full community vote. All onchain.",
    art: "/landing/judge.jpeg",
  },
  {
    label: "Escrow",
    title: "PRIZES LOCKED.",
    accent: "WINNERS PAID.",
    description: "Prizes secured in onchain escrow. Distributed by smart contracts.",
    art: "/landing/escrow.jpeg",
  },
  {
    label: "Anchors",
    title: "ONCHAIN TO",
    accent: "REAL WORLD.",
    description: "Cash out through supported Stellar anchors.",
    art: null,
  },
] as const satisfies readonly {
  label: string;
  title: string;
  accent: string;
  description: string;
  art: string | null;
}[];

/** Native scrolling pins one viewport while its feature panels advance. */
export function LandingFeatures() {
  const section = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = section.current;
    const pin = frame.current;
    if (!track || !pin) return;
    let raf = 0;

    const update = () => {
      raf = 0;
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      const travel = track.offsetHeight - pin.offsetHeight;
      const progress = travel > 0 ? (top - track.getBoundingClientRect().top) / travel : 0;
      setActive(Math.min(features.length - 1, Math.max(0, Math.floor(progress * features.length))));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(track);
    observer.observe(pin);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  function show(index: number) {
    const track = section.current;
    const pin = frame.current;
    if (!track || !pin) return;
    const top = parseFloat(getComputedStyle(pin).top) || 0;
    const travel = track.offsetHeight - pin.offsetHeight;
    // Land in the middle of the panel's interval, clear of the rounding
    // boundary at either end.
    const offset = (index + 0.5) / features.length;
    window.scrollTo({
      top: window.scrollY + track.getBoundingClientRect().top - top + travel * offset,
      behavior: "instant",
    });
    setActive(index);
  }

  return (
    <section ref={section} id="built-different" className={styles.featureTrack} style={{ height: `${features.length * 100}svh` }} aria-label="Built for the Stellar ecosystem">
      <div ref={frame} className={styles.featurePin} data-feature-pin>
        <div className={styles.featureLayout}>
          <div className={styles.featureSidebar}>
            <p className={styles.eyebrow}>Built for Stellar</p>
            <nav className={styles.featureNav} aria-label="Explore StelHacks features">
              {features.map((feature, index) => (
                <button
                  key={feature.label}
                  type="button"
                  aria-pressed={active === index}
                  aria-controls={`feature-${index}`}
                  onClick={() => show(index)}
                >
                  <span className={styles.featureDot} aria-hidden="true" />
                  {feature.label}
                </button>
              ))}
            </nav>
          </div>
          <div className={styles.featurePanels}>
            {features.map((feature, index) => (
              <article key={feature.label} id={`feature-${index}`} hidden={active !== index} className={styles.featurePanel}>
                <div className={styles.featureWords}>
                  <h2 className={styles.sectionTitle}>{feature.title}<br /><span>{feature.accent}</span></h2>
                  <p className={styles.featureDescription}>{feature.description}</p>
                </div>

                {/* The alt is empty because every one of these draws the
                    sentence next to it a second time. */}
                {feature.art !== null && (
                  <img
                    src={feature.art}
                    alt=""
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding="async"
                    className={styles.featureArt}
                  />
                )}
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
