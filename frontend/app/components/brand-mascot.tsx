import styles from "./brand-mascot.module.css";

/** Frames the supplied transparent logo without changing the source artwork. */
export function BrandMascot({ className = "" }: { className?: string }) {
  return (
    <span className={`${styles.mascot} ${className}`} aria-hidden="true">
      <img src="/stelhacks-nobg.png" alt="" width={2000} height={2000} />
    </span>
  );
}
