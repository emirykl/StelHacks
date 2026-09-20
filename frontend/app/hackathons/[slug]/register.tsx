"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button, ButtonLink } from "../../components/primitives";
import { CommitButton } from "../../components/commit-button";
import { Modal } from "../../components/modal";
import { useWallet } from "../../components/wallet-context";
import { UNFUNDED, arg, fund, onTestnet, send, type Sent } from "../../../lib/send";
import { browserClient } from "../../../lib/supabase/client";
import { standingOf, type Standing } from "../../../lib/participate";
import { challengeFor } from "../../../lib/organizer";
import { proveAddressHex } from "../../../lib/wallet";

/**
 * The way in, as one control that knows where you are.
 *
 * This was a modal listing three steps, two of which said "not yet" every time
 * it opened. A checklist is the right shape when somebody chooses among the
 * items on it; here the contract allows exactly one of the three at any moment,
 * so the list was a ceremony around a single button and it left the reader to
 * work out which line was theirs.
 *
 * Now the button is the state. It says what can be done next, doing it is one
 * press, and what it says afterwards is what happened. A modal opens only for
 * the one step that genuinely needs a form.
 *
 * Both halves of an identity are still required and they are not the same half:
 * an account is who the organizer can reach and what a team name hangs off, a
 * wallet is what the contract records and what a prize is paid to. Which one is
 * missing is said when it is missing, rather than as a wall in front of
 * everybody who came to read.
 */

export function Register({
  contractId,
  slug,
  registrationClosesAt,
}: {
  contractId: string;
  slug: string | null;
  /**
   * When applying stops being possible, from the frozen rules.
   *
   * Needed because the phase does not say. Registration and submission close at
   * different moments and the contract keeps running through both; an event can
   * be past its sign up deadline and still be `Open`, which is exactly the
   * window in which this offered a button the contract would refuse.
   */
  registrationClosesAt: number | null;
}) {
  const { wallet, known, connect } = useWallet();
  const router = useRouter();

  const [account, setAccount] = useState<boolean | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState(false);
  const [naming, setNaming] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [result, setResult] = useState<Sent | null>(null);
  const [funding, setFunding] = useState(false);

  const address = wallet?.address ?? null;

  useEffect(() => {
    const db = browserClient();

    if (db === null) {
      /* No accounts on this deployment, so there is no account to be missing
         and the wallet is the whole of the identity. */
      setAccount(true);

      return;
    }

    let live = true;

    void db.auth.getUser().then(({ data }) => {
      if (live) {
        setAccount(data.user !== null);
      }
    });

    return () => {
      live = false;
    };
  }, []);

  const reread = useCallback(async () => {
    setStanding(address === null ? null : await standingOf(contractId, address));
  }, [contractId, address]);

  useEffect(() => {
    void reread();
  }, [reread]);

  async function run(work: () => Promise<Sent>) {
    setBusy(true);
    setResult(null);

    const outcome = await work();

    /* Declining in the wallet is a decision, not a failure, and gets no
       message. Anything else does. */
    setResult(outcome.ok || !outcome.refused ? outcome : null);
    setBusy(false);

    if (outcome.ok) {
      await reread();
    }
  }

  /**
   * Found the team on chain, then write down what it is called.
   *
   * In that order, and the chain call is the one that counts: a team exists the
   * moment the contract says so, and the name is a label hung on it afterwards.
   * If the naming fails the team is still there and still theirs, so the failure
   * is reported without pretending the founding did not happen.
   */
  async function found() {
    if (address === null) {
      return;
    }

    setBusy(true);
    setResult(null);

    const outcome = await send(
      contractId,
      "create_team",
      [await arg.address(address)],
      address,
    );

    if (!outcome.ok) {
      setResult(outcome.refused ? null : outcome);
      setBusy(false);

      return;
    }

    /* Asked again rather than read off the transaction, because the id is what
       the contract assigned and this is the call that knows it. */
    const after = await standingOf(contractId, address);

    setStanding(after);
    setNaming(false);
    setBusy(false);
    setTeamName("");
    setResult(outcome);

    const id = after.teams[0];

    if (id === undefined) {
      return;
    }

    try {
      const issuedAt = Math.floor(Date.now() / 1000);
      const db = browserClient();
      const account = db === null ? null : (await db.auth.getUser()).data.user?.id ?? null;

      if (account === null) {
        return;
      }

      await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract: contractId,
          teamId: id,
          name: teamName.trim(),
          issuedAt,
          signature: await proveAddressHex(
            address,
            challengeFor(contractId, account, issuedAt, "team"),
          ),
        }),
      });
    } catch {
      /* The team is founded either way. A name that did not save is worth
         saying nothing about here rather than reporting a failure over a
         transaction that succeeded. */
    }
  }

  /**
   * Get the wallet an account, then clear the message that offered to.
   *
   * The application is not retried automatically. Funding is a different thing
   * from entering, and pressing one button should not sign something; what it
   * does is put the person back where they were, with the button that was
   * refused now able to work.
   */
  async function topUp() {
    if (address === null) {
      return;
    }

    setFunding(true);

    const outcome = await fund(address);

    setResult(outcome.ok ? null : outcome);
    setFunding(false);

    if (outcome.ok) {
      await reread();
    }
  }

  /* Checked on the press rather than on the page, so somebody reading a
     hackathon is never told what they are missing for something they have not
     asked to do. */
  function ready(): boolean {
    if (account !== true || address === null) {
      setGate(true);

      return false;
    }

    return true;
  }

  return (
    <div className="grid gap-3">
      <Next
        standing={known && address === null ? null : standing}
        shut={
          registrationClosesAt !== null &&
          registrationClosesAt <= Math.floor(Date.now() / 1000)
        }
        busy={busy}
        onApply={() =>
          ready() &&
          void run(async () => send(contractId, "apply", [await arg.address(address!)], address!))
        }
        onTeam={() => ready() && setNaming(true)}
        onFind={() => router.push("?tab=find-team")}
        onSubmit={() => ready() && router.push(`/hackathons/${slug}/submit`)}
      />

      {result !== null && (
        <div className="grid gap-2">
          <p
            className={`max-w-[22rem] text-[0.875rem] leading-relaxed ${
              result.ok ? "text-verified" : "text-broken"
            }`}
          >
            {result.ok ? "Signed and recorded." : result.why}
          </p>

          {/* The one failure with a fix on this page, so the fix is on this page.
              Sending somebody to find a faucet is sending them away from the
              thing they were doing over a step that takes a second. */}
          {!result.ok && result.why === UNFUNDED && onTestnet() && (
            <div>
              <Button
                size="sm"
                disabled={funding}
                onClick={() => void topUp()}
              >
                {funding ? "Asking the faucet" : "Fund it on testnet"}
              </Button>
            </div>
          )}
        </div>
      )}

      <Modal open={gate} onClose={() => setGate(false)} title="Before you can enter">
        <div className="grid gap-6">
          <h2 className="text-[1.5rem] text-ink">Before you can enter</h2>

          {account !== true ? (
            <Missing
              what="an account"
              why="Your account is how the organizer reaches you and how your team gets a name. It signs nothing."
            >
              <ButtonLink href="/login">Sign in</ButtonLink>
            </Missing>
          ) : (
            <Missing
              what="a wallet"
              why="Entering is signed by a wallet, and the prize is paid to the address that signs it."
            >
              <Button onClick={() => void connect()}>Connect a wallet</Button>
            </Missing>
          )}
        </div>
      </Modal>

      <Modal open={naming} onClose={() => setNaming(false)} title="Name your team">
        <div className="grid gap-6">
          <div>
            <h2 className="text-[1.5rem] text-ink">Name your team</h2>

            {/* The suggestion is worth making because most teams have one name
                in their head, not two, and inventing a second one at this
                moment is a decision nobody came here to make. */}
            <p className="mt-2 max-w-[30rem] text-[0.9375rem] leading-relaxed text-ink-soft">
              The chain knows your team by a number. The name is what everybody
              else will look for it under, and you can change it later. Most
              teams use what they are building.
            </p>
          </div>

          <input
            value={teamName}
            onChange={(event) => setTeamName(event.target.value.slice(0, 80))}
            placeholder="Payments Crew"
            aria-label="Team name"
            className="h-11 w-full bg-paper px-4 text-[1rem] text-ink outline-none ring-1 ring-inset ring-rule transition-shadow duration-150 ease-settle focus:ring-ink"
          />

          <div>
            <CommitButton
              disabled={busy || teamName.trim().length === 0}
              onClick={() => void found()}
            >
              {busy ? "Signing" : "Start the team"}
            </CommitButton>
          </div>
        </div>
      </Modal>

    </div>
  );
}

/**
 * The one thing that can be done now, or the one thing being waited on.
 *
 * Waiting is amber rather than grey. Grey reads as switched off, and an
 * application sitting with an organizer is not switched off: it is the only
 * thing happening, and it is happening to somebody else.
 */
function Next({
  standing,
  shut,
  busy,
  onApply,
  onTeam,
  onFind,
  onSubmit,
}: {
  standing: Standing | null;
  /** Whether the sign up window has closed. */
  shut: boolean;
  busy: boolean;
  onApply: () => void;
  onTeam: () => void;
  onFind: () => void;
  onSubmit: () => void;
}) {
  if (busy) {
    return <CommitButton disabled>Signing</CommitButton>;
  }

  /* Applying is over, and nobody applied in time. Said rather than offered: the
     contract refuses `apply` past this deadline, so the button could only have
     cost a signature to be told so. */
  if (shut && (standing === null || standing.application === "none")) {
    return <Waiting closed>Registration closed</Waiting>;
  }

  /* Nothing read yet, or no wallet to read with. Either way the first press is
     what finds out, so the button that starts it is what is shown. */
  if (standing === null || standing.application === "none") {
    return <CommitButton onClick={onApply}>Register as a hacker</CommitButton>;
  }

  if (standing.application === "pending") {
    return <Waiting>Waiting for the organizer</Waiting>;
  }

  if (standing.application === "rejected") {
    return <p className="text-[1rem] text-broken">Your application was refused.</p>;
  }

  if (standing.teams.length === 0) {
    return (
      <div className="grid gap-2">
        <CommitButton onClick={onTeam}>Start a team</CommitButton>

        <button
          type="button"
          onClick={onFind}
          className="text-left text-[0.875rem] text-ink-soft underline decoration-rule underline-offset-4 transition-colors duration-150 ease-settle hover:text-ink hover:decoration-ink"
        >
          or join someone else&rsquo;s
        </button>
      </div>
    );
  }

  if (!standing.submitted) {
    return <CommitButton onClick={onSubmit}>Submit your project</CommitButton>;
  }

  return <Waiting done>Submitted</Waiting>;
}

/**
 * A state rather than a control, in the colour of what it is.
 *
 * Amber for something still in motion, green for something finished, grey for a
 * door that has shut. Grey reads as switched off, which is wrong for waiting and
 * exactly right here.
 */
function Waiting({
  children,
  done = false,
  closed = false,
}: {
  children: React.ReactNode;
  done?: boolean;
  closed?: boolean;
}) {
  return (
    <p
      className={`flex items-center gap-2 text-[1rem] ${
        closed ? "text-ink-faint" : done ? "text-verified" : "text-signal-deep dark:text-signal"
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-full ${
          closed ? "bg-ink-faint" : done ? "bg-verified" : "bg-signal-deep dark:bg-signal"
        }`}
      />
      {children}
    </p>
  );
}

/** One of the two halves, named, with the way to get it. */
function Missing({
  what,
  why,
  children,
}: {
  what: string;
  why: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-[34rem]">
      <p className="text-[1rem] text-ink">You need {what} first.</p>

      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">{why}</p>

      <div className="mt-5">{children}</div>
    </div>
  );
}
