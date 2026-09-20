import { CommitButton } from "./components/commit-button";
import { BrandMascot } from "./components/brand-mascot";
import { HeroAnimation } from "./components/hero-animation";
import { LandingFeatures } from "./components/landing-features";
import { ParticleText } from "./components/particle-text";
import { currentUser, serverClient } from "../lib/supabase/server";
import { tierOf } from "../lib/organizing";
import { ApplyTrigger } from "./components/organizer-apply";
import styles from "./page.module.css";
import type { CSSProperties } from "react";

export default async function Home() {
  const user = await currentUser();
  const db = user === null ? null : await serverClient();
  // Match the create page’s grant check, including its fail-closed behavior.
  const canHost = db !== null && user !== null && (await tierOf(db, user.id)) !== null;
  return (
    <main className={styles.landing}>
      <section className={`${styles.screen} ${styles.hero}`} aria-labelledby="hero-title">
        <div className={styles.binaryRain} aria-hidden="true">
          {["01", "10", "001", "11", "010", "101", "0", "110", "01", "100", "011", "1", "0101", "001", "1010", "11", "0001", "10", "0110", "1", "1001", "010", "111", "0010"].map((bits, index) => (
            <span key={`${bits}-${index}`} style={{ "--i": index } as CSSProperties}>{bits}</span>
          ))}
        </div>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <h1 id="hero-title" className={styles.heroTitle}>
              <span>BUILD ON</span>
              <ParticleText className={styles.stellar}>STELHACKS</ParticleText>
            </h1>
            <p className={styles.subtitle}>
              Stellar&apos;s Official On Chain Hackathon Platform
            </p>
            <div className={styles.heroAction}>
              <CommitButton href="/hackathons" size="lg" prominent className={styles.actionButton}>
                <span className={styles.buttonLabel}>Explore hackathons <BrandMascot /></span>
              </CommitButton>
            </div>
          </div>
          <HeroAnimation />
        </div>
      </section>

      <LandingFeatures />

      <section id="start-building" className={`${styles.screen} ${styles.join}`} aria-labelledby="join-title">
        <div className={styles.joinContent}>
          <h2 id="join-title" className={styles.joinTitle}>LESS TALK.<br />MORE <span>BUILD.</span></h2>
          <div className={styles.joinActions}>
            <CommitButton href="/hackathons" size="lg" prominent className={styles.actionButton}>
              <span className={styles.buttonLabel}>See Hackathons <BrandMascot /></span>
            </CommitButton>
            {canHost ? (
              <CommitButton href="/create" size="lg" prominent className={styles.actionButton}>
                <span className={styles.buttonLabel}>Create Hackathon <BrandMascot /></span>
              </CommitButton>
            ) : (
              <ApplyTrigger appearance="specular" className={styles.actionButton}>
                <span className={styles.buttonLabel}>Apply for Host Hackathon <BrandMascot /></span>
              </ApplyTrigger>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
