"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { countryName, flagOf } from "../../lib/countries";
import { units } from "../../lib/money";
import { TokenMark } from "../components/token";
import type { Statistics } from "../../lib/statistics";
import styles from "./statistics.module.css";
import { titleOf } from "../../lib/words";

const number = (value: number) => value.toLocaleString("en-US");
const date = (value: string) => new Date(value).toLocaleDateString("en-US", {
  month: "short", day: "numeric", timeZone: "UTC",
});
const colors = ["#18a84b", "#2f6fed", "#9b9892"];

export function Dashboard({ data }: { data: Statistics }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className={styles.dashboard} aria-busy={pending}>
      <header className={styles.heading}>
        <h1>Statistics</h1>
        <div className={styles.toolbar}>
          <nav className={styles.tabs} aria-label="Statistics period">
            {[["current", "Current"], ["all", "All hackathons"], ["past", "Past"]].map(([value, label]) => (
              <Link key={value} href={`/statistics?event=${value}`} aria-current={data.scope === value ? "page" : undefined}>
                {label}
              </Link>
            ))}
          </nav>
          <label className={styles.selectLabel}>
            <span className="sr-only">Choose a hackathon</span>
            <select
              value={["all", "current", "past"].includes(data.scope) ? "" : data.scope}
              onChange={(event) => {
                if (event.target.value) startTransition(() => router.push(`/statistics?event=${encodeURIComponent(event.target.value)}`));
              }}
            >
              <option value="" disabled>Select hackathon</option>
              {data.events.map((event) => (
                <option key={event.contract_id} value={event.contract_id}>
                  {event.name}{event.phase === 8 || event.phase === 9 ? " · Past" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className={styles.metrics}>
        <Metric label="Total users" value={data.totalUsers} icon="users" title="All registered StelHacks profiles" />
        <Metric label="New users (30 days)" value={data.newUsers} icon="new" title="New StelHacks profiles in the past 30 days" />
        <Metric label="Approved registrations" value={data.registrations} icon="registrations" title={`${data.label} · ${number(data.wallets)} unique wallets`} />
        <Metric label="Countries participating" value={data.countryCount} icon="globe" title={`${data.label} · Self-reported countries`} />
      </div>

      <div className={styles.grid}>
        <Panel title="Registrations over time" detail={`${data.label} · Cumulative wallet registrations · UTC${data.missingDate ? ` · ${data.missingDate} registrations without dates excluded` : ""}`}>
          <Timeline points={data.timeline} missingDates={data.missingDate > 0} />
        </Panel>
        <Panel title="Top 10 countries by registrations" detail={`${data.label} · ${data.missingCountry} registrations without a shared country`}>
          <Countries countries={data.countries} />
        </Panel>
        <Panel title="Prize money paid out" detail={`${data.label} · Each token's own amount, shares by approximate dollar value · Sweeps and returned no-awards excluded`}>
          <Payouts assets={data.paidAssets} />
        </Panel>
        <Panel title="Project status" detail={`${data.label} · Latest indexed status per team entry`}>
          <Pie items={[
            { label: "Eligible", value: data.projectStatuses[0] },
            { label: "Screened out", value: data.projectStatuses[1] },
            { label: "Disqualified", value: data.projectStatuses[2] },
          ]} />
        </Panel>
        <Panel title="Top 5 tracks by prize money paid" detail={`${data.label} · Paid to winners, in each event's own prize token · ${data.paidTracks} ${data.paidTracks === 1 ? "track has" : "tracks have"} paid out`}>
          <Tracks tracks={data.tracks} />
        </Panel>
      </div>
    </div>
  );
}

function Metric({ label, value, icon, title }: { label: string; value: number; icon: string; title: string }) {
  return (
    <section className={styles.metric} title={title}>
      <div><h2>{label}</h2><MetricIcon name={icon} /></div>
      <p className={styles.value}>{number(value)}</p>
    </section>
  );
}

function MetricIcon({ name }: { name: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "globe" ? <>
        <circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 6.5h14M5 17.5h14" />
      </> : name === "registrations" ? <>
        <rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 2v4m6-4v4M9 13l2 2 4-4" />
      </> : <>
        <circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2" />
        {name === "new" ? <path d="M19 7v6m-3-3h6" /> : <path d="M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" />}
      </>}
    </svg>
  );
}

function Panel({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  return <section className={styles.panel}><h2 title={detail}>{title}</h2>{children}</section>;
}

function Empty({ text = "No data yet" }: { text?: string }) {
  return <div className={styles.empty}>{text}</div>;
}

function Timeline({ points, missingDates }: { points: Statistics["timeline"]; missingDates: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (!points.length) return <Empty text={missingDates ? "Dates unavailable" : "No registrations yet"} />;
  const max = Math.max(points[points.length - 1].total, 1);
  const start = Date.parse(points[0].date);
  const span = Math.max(Date.parse(points[points.length - 1].date) - start, 86_400_000);
  const x = (i: number) => 48 + (Date.parse(points[i].date) - start) / span * 544;
  const y = (i: number) => 264 - points[i].total / max * 224;
  const path = points.map((_, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(i)}`).join(" ");
  const ticks = [...new Set([0, .25, .5, .75, 1].map((fraction) => Math.round(max * fraction)))];
  const active = hovered === null ? null : points[hovered];

  return (
    <div className={styles.timeline}>
      {active && <div className={styles.tooltip}>{date(active.date)} · {number(active.total)}</div>}
      <svg viewBox="0 0 620 310" role="img" aria-label={`Cumulative registrations: ${number(max)} through ${date(points[points.length - 1].date)}`}>
        {ticks.map((value) => <g key={value}>
          <line x1="48" x2="592" y1={264 - value / max * 224} y2={264 - value / max * 224} className={styles.gridline} />
          <text x="36" y={268 - value / max * 224} textAnchor="end" className={styles.axis}>{number(value)}</text>
        </g>)}
        <path d={path} fill="none" stroke="#18a84b" strokeWidth="3" strokeLinejoin="round" />
        {points.map((point, i) => (
          <circle key={point.date} cx={x(i)} cy={y(i)} r={hovered === i || points.length === 1 ? 5 : 3}
            fill="#18a84b" tabIndex={0}
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)} onBlur={() => setHovered(null)}
            aria-label={`${point.date}: ${point.total} registrations`}
          ><title>{`${point.date}: ${number(point.total)} total, ${number(point.count)} new`}</title></circle>
        ))}
        {[...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].map((i) => (
          <text key={points[i].date} x={x(i)} y="294" textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className={styles.axis}>
            {date(points[i].date)}
          </text>
        ))}
      </svg>
      <table className="sr-only">
        <caption>Approved registrations by date (UTC)</caption>
        <thead><tr><th>Date</th><th>New</th><th>Total</th></tr></thead>
        <tbody>{points.map((p) => <tr key={p.date}><td>{p.date}</td><td>{p.count}</td><td>{p.total}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/**
 * What winners were actually paid, as a share per token.
 *
 * The slices are sized in dollars and the legend prints each token's own
 * amount, because those are two different things and only one of them is a
 * fact: XLM and USDC cannot be added without a quote, and the quote is a
 * convenience that can be stale or absent. So the drawing borrows it and the
 * figures never do.
 *
 * With no quote and more than one token there is no whole to take a share of,
 * and the panel falls back to a list rather than inventing an exchange rate to
 * finish a circle with.
 */
function Payouts({ assets }: { assets: Statistics["paidAssets"] }) {
  if (!assets.length) return <Empty text="No prize has been paid yet" />;
  if (assets.length > 1 && assets.some((asset) => asset.dollars === null)) {
    return <PayoutList assets={assets} />;
  }
  return <Pie items={assets.map((asset) => ({
    label: asset.code,
    /* One token is the whole circle whatever it is worth, so an unquoted total
       can still size the only slice there is. */
    value: asset.dollars ?? Number(BigInt(asset.amount)),
    display: units(BigInt(asset.amount)),
    tone: asset.code === "USDC" ? 1 : asset.code === "XLM" ? 0 : 2,
  }))} />;
}

function PayoutList({ assets }: { assets: Statistics["paidAssets"] }) {
  return (
    <ul className={styles.payouts}>
      {assets.map(({ code, amount, payouts }) => (
        <li key={code} className={styles.payout}>
          <span className={styles.payoutMark}><TokenMark code={code} className={styles.payoutIcon} /></span>
          <span className={styles.payoutLabel}>
            <strong>{code}</strong>
            <span>{number(payouts)} {payouts === 1 ? "payment" : "payments"}</span>
          </span>
          <span className={styles.payoutAmount}>{units(BigInt(amount))}</span>
        </li>
      ))}
    </ul>
  );
}

// Only the tracks that paid something, so an event still judging draws nothing
// rather than five zero length bars.
function Tracks({ tracks }: { tracks: Statistics["tracks"] }) {
  if (!tracks.length) return <Empty text="No prize has been paid yet" />;
  // Compared as a number only for the bar's width. The figure beside it is
  // formatted from the integer, so nothing a reader sees goes through a float.
  const max = Number(BigInt(tracks[0].amount));
  return (
    <div className={styles.countryChart}>
      <ol className={styles.countries}>
        {tracks.map(({ track, amount }) => (
          <li key={track}>
            <span className={styles.country} title={track}>{titleOf(track)}</span>
            <div className={styles.barTrack}><div style={{ width: `${Number(BigInt(amount)) / max * 100}%` }} /></div>
            <strong>{units(BigInt(amount))}</strong>
          </li>
        ))}
      </ol>
      <div className={styles.countryAxis} aria-hidden="true"><span>0</span><span>{units(BigInt(tracks[0].amount))}</span></div>
    </div>
  );
}

function Countries({ countries }: { countries: Statistics["countries"] }) {
  if (!countries.length) return <Empty text="No country data yet" />;
  const max = countries[0].count;
  return (
    <div className={styles.countryChart}>
      <ol className={styles.countries}>
        {countries.slice(0, 10).map(({ code, count }) => (
          <li key={code}>
            {/* The flag before the name, drawn from the code itself rather than
                fetched: two regional indicator letters are the country's flag
                on every platform that has one, and nothing is downloaded. A
                runtime without the glyphs shows the two letters, which is the
                code the profile actually stores. */}
            <span className={styles.country} title={countryName(code)}>
              <span aria-hidden>{flagOf(code)}</span> {countryName(code)}
            </span>
            <div className={styles.barTrack}><div style={{ width: `${count / max * 100}%` }} /></div>
            <strong>{number(count)}</strong>
          </li>
        ))}
      </ol>
      <div className={styles.countryAxis} aria-hidden="true"><span>0</span><span>{number(max)}</span></div>
    </div>
  );
}

/**
 * `value` sizes the slice, `display` is what the legend prints.
 *
 * They come apart wherever the share and the figure are in different units — a
 * prize total is a share of some dollars and a figure in its own token — and
 * keeping one field for both would force such a panel to print the number it
 * divided by instead of the number it means.
 *
 * `tone` picks the colour by hand instead of by position, for a panel whose
 * slices mean something outside it: a token keeps its colour whether or not
 * the other one was paid that month.
 */
function Pie({ items }: { items: { label: string; value: number; display?: string; tone?: number }[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <Empty />;
  let offset = 0;
  const pointAt = (angle: number, radius: number) => ({
    x: 100 + radius * Math.cos(angle), y: 100 + radius * Math.sin(angle),
  });

  return (
    <div className={styles.pieRow}>
      <svg className={styles.pie} viewBox="0 0 200 200" role="img" aria-label={items.map((item) => `${item.label}: ${item.display ?? number(item.value)}`).join(", ")}>
        {items.map((item, i) => {
          if (item.value === 0) return null;
          const tone = item.tone ?? i;
          const fraction = item.value / total;
          const begin = offset * Math.PI * 2 - Math.PI / 2;
          offset += fraction;
          const end = offset * Math.PI * 2 - Math.PI / 2;
          const a = pointAt(begin, 96);
          const b = pointAt(end, 96);
          const label = pointAt((begin + end) / 2, fraction === 1 ? 0 : 60);
          const title = `${item.label}: ${item.display ?? number(item.value)} (${Math.round(fraction * 100)}%)`;
          return <g key={item.label}>
            {fraction === 1
              ? <circle cx="100" cy="100" r="96" fill={colors[tone]}><title>{title}</title></circle>
              : <path d={`M100 100 L${a.x} ${a.y} A96 96 0 ${fraction > .5 ? 1 : 0} 1 ${b.x} ${b.y} Z`} fill={colors[tone]} stroke="var(--color-paper)" strokeWidth="1"><title>{title}</title></path>}
            {fraction >= .08 && <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="middle" fill={tone === 1 ? "var(--color-paper)" : "var(--color-ink)"} fontSize="11" fontWeight="500">{`${Math.round(fraction * 100)}%`}</text>}
          </g>;
        })}
      </svg>
      <ul className={styles.legend}>
        {items.map((item, i) => <li key={item.label}>
          <span className={styles.legendDot} style={{ background: colors[item.tone ?? i] }} />
          <span>{item.label}</span><strong>{item.display ?? number(item.value)}</strong>
        </li>)}
      </ul>
    </div>
  );
}
