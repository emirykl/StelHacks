"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ApplicationForm } from "../organize/form";
import { ButtonLink } from "./primitives";
import { Modal, ModalClose } from "./modal";
import { myStanding } from "../organize/actions";
import type { Standing } from "../../lib/organizing";

/**
 * The way in for somebody who wants to run an event rather than enter one.
 *
 * The site had no such way in at all. `/create` existed, nothing linked to it,
 * and nothing stopped whoever found it, so both halves of the problem were open
 * at once: the person who wanted to organize could not find the door, and the
 * person who should not have gone through it was not stopped.
 *
 * This is the door. It opens over whatever page somebody was reading, because
 * they are in the middle of being persuaded and a navigation would end that.
 *
 * What the panel shows depends on where the reader already stands, and all four
 * states are real. Signing in first is not a formality: approval is a row
 * attached to an account, so there has to be an account for it to attach to.
 */

export function ApplyTrigger({
  className,
  children,
}: {
  className?: string;
  /** Drawn by the caller, because the landing card and the footer link are not the same object. */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [standing, setStanding] = useState<Standing | null>(null);

  /* Asked for on the first open and then kept. The trigger sits in the layout's
     footer, so reading the session to render it would cost every page in the
     product its static render for a panel almost nobody opens. */
  useEffect(() => {
    if (!open || standing !== null) {
      return;
    }

    let live = true;

    void myStanding().then((now) => {
      if (live) {
        setStanding(now);
      }
    });

    return () => {
      live = false;
    };
  }, [open, standing]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Run a hackathon">
        <ModalClose onClose={() => setOpen(false)} />

        <ApplyPanel standing={standing} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

/**
 * The panel's contents, which are also the whole of `/organize`.
 *
 * Shared rather than written twice, so the two cannot drift into saying
 * different things about the same account. The page hands it a standing it read
 * on the server and never sees the waiting state; the modal hands it null until
 * the answer arrives.
 */
export function ApplyPanel({
  standing,
  onDone,
}: {
  standing: Standing | null;
  /** Present inside the modal, absent on the page, which has nothing to close. */
  onDone?: () => void;
}) {
  if (standing === null) {
    /* A line rather than a spinner. The panel is already the size it will be
       and the wait is one request long; a spinner would be a second thing
       moving on a surface that just moved. */
    return <p className="label text-ink-faint">One moment</p>;
  }

  if (!standing.signedIn) {
    return (
      <Panel
        title="Run a hackathon"
        line="Approval is attached to an account, so there has to be one first. It takes a click."
      >
        <ButtonLink href="/login?next=%2Forganize">Sign in to apply</ButtonLink>
      </Panel>
    );
  }

  if (standing.status === "pending") {
    return (
      <Panel
        title="With us"
        line="Your application is in the queue. We read them by hand and write back."
      />
    );
  }

  if (standing.status === "approved") {
    return (
      <Panel title="You are an organizer" line="The rules you write get frozen when you lock them.">
        <ButtonLink href="/create">Create a hackathon</ButtonLink>
      </Panel>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h2 className="display text-[1.5rem]">Run a hackathon</h2>

        {/* Said once, at the top, rather than as a line under each field. What
            a reader needs before typing is why they are being asked at all. */}
        <p className="text-[1rem] leading-relaxed text-ink-soft">
          {standing.status === "rejected"
            ? "You can apply again whenever something has changed."
            : "Tell us what you want to run. We answer by hand."}
        </p>

        {standing.note !== null && (
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
            Last time: {standing.note}
          </p>
        )}
      </div>

      <ApplicationForm email={standing.email} onSent={onDone} />
    </div>
  );
}

function Panel({
  title,
  line,
  children,
}: {
  title: string;
  line: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <h2 className="display text-[1.5rem]">{title}</h2>

        <p className="text-[1rem] leading-relaxed text-ink-soft">{line}</p>
      </div>

      {children !== undefined && <div>{children}</div>}
    </div>
  );
}
