"use client";

import { useEffect, useRef } from "react";
import styles from "../page.module.css";

export function HeroAnimation() {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const player = video.current;
    if (!player) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const sync = () => {
      if (reducedMotion.matches || !visible || document.hidden) {
        player.pause();
      } else {
        // Autoplay may be blocked by the browser; the play control stays available.
        void player.play().catch(() => undefined);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(player);
    reducedMotion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      player.pause();
    };
  }, []);

  return (
    <div className={styles.heroMedia} data-hero-media>
      <video
        ref={video}
        poster="/gif/catmain1-poster-transparent.png"
        width={1920}
        height={1080}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="StelHacks cats building on laptops around the globe under hackathon and Stellar flags"
        className={styles.heroAnimation}
      >
        <source src="/gif/catmain1-seamless.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
