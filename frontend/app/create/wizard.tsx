"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "../components/primitives";
import { ImagePicker } from "./image-picker";
import { useWallet } from "../components/wallet-context";
import { deploy, send, type Sent } from "../../lib/send";
import { PRIZE_ASSETS } from "../../lib/money";
import { proveAddressHex } from "../../lib/wallet";
import { rulesFor } from "../../lib/rules";
import {
  WEIGHT_TOTAL_BPS,
  configureArgs,
  createArgs,
  feeFor,
  toSmallestUnit,
  totalPrize,
  type Draft,
  type Track,
} from "../../lib/constitution";

/**
 * Writing the rules, before they are frozen.
 *
 * Everything on this form ends up inside one hashed object. After the lock it
 * cannot be edited, only cancelled, so the form's job is not to be quick: it is
 * to make the two things that decide an outcome impossible to get wrong without
 * noticing. Those are the prize table, which the vault has to match exactly,
 * and the rubric weights, which have to add up.
 *
 * Both are shown as running totals rather than validated on submit. A number
 * that goes wrong should look wrong while it is being typed.
 */

/**
 * The core wasm already uploaded to the network, from `docs/deployments.md`.
 *
 * This form used to ask for a contract address and note that it was "the
 * hackathon contract you deployed", which put a command line step in the middle
 * of a web form and asked for its output. Every event deploys its own instance
 * anyway, so the form deploys one: the address is a consequence of pressing the
 * button, not a prerequisite for it.
 */
const CORE_WASM = "b3ded1878cd895eef0a7be2ebce8a0641338d6fe129b2fd852fa5d008f3deb63";

export function Wizard({
  feeBps,
  userId,
  editing = null,
}: {
  feeBps: number;
  userId: string;
  /**
   * The hackathon whose draft rules are being rewritten, or nothing when this
   * is a new one.
   *
   * The same form either way, because it is the same document. A separate edit
   * screen would be a second place for the rules to be described and the two
   * would drift, which on a form whose output gets hashed and frozen is the
   * kind of drift nobody finds until it is permanent.
   */
  editing?: string | null;
}) {
  const { wallet, known } = useWallet();
  const router = useRouter();

  const [asset, setAsset] = useState("");
  const [tracks, setTracks] = useState<Track[]>([blankTrack()]);
  const [judges, setJudges] = useState<string[]>([""]);
  const [dates, setDates] = useState(defaultDates);
  const [settlementDelay, setSettlementDelay] = useState(86_400);

  /* What a submission has to carry. The default is the one most events mean:
     show the code, everything else is up to the team. */
  const [requires, setRequires] = useState({
    repository: true,
    demoVideo: false,
    liveUrl: false,
  });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Sent | null>(null);

  /* What the hackathon looks like. None of it decides anything, so none of it
     is in the constitution and none of it is frozen; it is written beside the
     contract afterwards and can be corrected. */
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [location, setLocation] = useState("");
  const [tags, setTags] = useState("");
  const [logo, setLogo] = useState("");
  const [banner, setBanner] = useState("");

  /* The ticker for whichever token was picked, so an amount typed three cards
     further down says what it is an amount of. Empty until one is chosen, which
     is also when the prize boxes are still meaningless. */
  const assetCode = PRIZE_ASSETS.find((choice) => choice.contract === asset)?.code ?? "";

  /*
    What a lumen costs, read once when lumens are what this event pays in.

    Prizes are typed in dollars, because that is the unit an organizer has a
    budget in and the unit a participant compares two hackathons in. The
    contract holds tokens, so the two have to be reconciled somewhere, and the
    honest place is here, in the open, at a rate that is shown before anybody
    signs. Read through our own route rather than straight from the price feed:
    the answer is the same for everybody, and this is the one number on the form
    that decides how much money is committed.
  */
  const [rate, setRate] = useState<number | null>(null);
  const [rateFailed, setRateFailed] = useState(false);

  useEffect(() => {
    if (assetCode !== "XLM") {
      return;
    }

    let live = true;

    void fetch("/api/rate")
      .then((answer) => answer.json() as Promise<{ price: number | null }>)
      .then((said) => {
        if (!live) {
          return;
        }

        setRate(said.price);
        setRateFailed(said.price === null);
      })
      .catch(() => live && setRateFailed(true));

    return () => {
      live = false;
    };
  }, [assetCode]);

  /* One dollar is one USDC by definition, so the stablecoin needs no quote and
     must not wait for one. */
  const quote = assetCode === "USDC" ? 1 : rate;

  /*
    Editing takes the amounts in the token, not in dollars.

    A new hackathon is budgeted in dollars, because that is the unit an
    organizer thinks in. An existing one already has a prize table in the token,
    frozen into a draft on chain, and showing it back in dollars would mean
    converting out at one rate and back in at another. Opening the form and
    saving it untouched would then change every prize, which is the one thing an
    edit screen must never do.
  */
  const inTokens = editing !== null;

  /* One is the identity here: an amount already in the token converts to
     itself, so the same pipeline serves both modes without a second path. */
  const priceOfOne = inTokens ? 1 : quote;

  /*
    The prize table as the contract will hold it.

    Everything typed above this line is in whichever unit the mode asks for.
    Everything below it, including the figure the vault is asked for and the
    amounts written into the frozen rules, is in the token. Converting once,
    here, is what keeps a form that reads in dollars from ever encoding a dollar
    into a field that means lumens.
  */
  const priced = useMemo(
    () =>
      tracks.map((track) => ({
        ...track,
        prizes: track.prizes.map((prize) => ({
          ...prize,
          amount: inAsset(prize.amount, priceOfOne),
        })),
      })),
    [tracks, priceOfOne],
  );

  const total = useMemo(() => totalPrize(priced), [priced]);

  /* Rounded down, the way the contract rounds it, so the number on screen is
     the number the vault will be asked for rather than one a rounding rule
     later disagrees with by a stroop. */
  const fee = (total * BigInt(feeBps)) / BigInt(10_000);
  const deposit = total + fee;

  /*
    The same three figures in dollars, or nothing when no rate is available.

    Computed from the token amounts rather than from what was typed, so the two
    halves of the card cannot disagree, and so the edit mode gets them for free
    without the round trip it exists to avoid.
  */
  const dollars =
    quote === null
      ? null
      : {
          total: dollarsOf(total, quote),
          fee: dollarsOf(fee, quote),
          deposit: dollarsOf(deposit, quote),
        };

  /* Null when this deployment was told to charge and has nowhere to send it,
     which is a misconfiguration rather than a free event. Creation is blocked
     rather than quietly turned into a free one. */
  const platformFee = wallet === null ? null : feeFor(feeBps, wallet.address);

  /*
    The draft as it stands, put back into the form.

    Read from the contract rather than from our tables, because the contract is
    what holds the rules and what `configure` will be checked against. The
    presentation columns come from our side, since the chain has never heard of
    a tagline.

    Loading is its own state rather than an empty form that fills in. A form
    that appears blank and then repopulates is one somebody starts typing into,
    and every keystroke before the answer arrives is lost.
  */
  const [loading, setLoading] = useState(editing !== null);

  useEffect(() => {
    if (editing === null) {
      return;
    }

    let live = true;

    void (async () => {
      const [rules, written] = await Promise.all([
        rulesFor(editing).catch(() => null),
        fetch(`/api/hackathon?contract=${editing}`)
          .then((answer) => (answer.ok ? answer.json() : null))
          .catch(() => null),
      ]);

      if (!live) {
        return;
      }

      if (rules !== null) {
        setAsset(rules.prizeAsset ?? "");
        setJudges(rules.judgeAddresses.length > 0 ? rules.judgeAddresses : [""]);
        setDates({
          opens: momentAt(rules.schedule.registrationOpens),
          registrationCloses: momentAt(rules.schedule.registrationCloses),
          submissionCloses: momentAt(rules.schedule.submissionCloses),
          screeningCloses: momentAt(rules.schedule.screeningCloses),
          judgingCloses: momentAt(rules.schedule.judgingCloses),
        });
        setSettlementDelay(rules.settlementDelay);
        setRequires(rules.requires);

        setTracks(
          rules.tracks.map((track) => ({
            id: track.id,
            noAwardAllowed: track.noAwardAllowed,
            criteria: track.criteria.map((criterion) => ({
              id: criterion.id,
              weightBps: criterion.weightBps,
            })),
            /* Ranked, because the contract stores the tiers as a flat list
               across every track and the order it returns them in is its own
               business rather than a promise. */
            prizes: rules.tiers
              .filter((tier) => tier.track === track.id)
              .sort((a, b) => a.rank - b.rank)
              .map((tier) => ({ rank: tier.rank, amount: unitsToString(tier.amount) })),
          })),
        );
      }

      if (written !== null) {
        setName(String(written.name ?? ""));
        setTagline(String(written.tagline ?? ""));
        setLocation(String(written.location ?? ""));
        setLogo(String(written.logo_url ?? ""));
        setBanner(String(written.banner_url ?? ""));
        setTags(Array.isArray(written.tags) ? written.tags.join(", ") : "");
      }

      setLoading(false);
    })();

    return () => {
      live = false;
    };
  }, [editing]);

  /* Said as a sentence rather than only greying the button out, because a form
     this long has an off screen reason for being unsubmittable more often than
     not. */
  const outOfOrder = disordered(dates);

  const ready =
    platformFee !== null &&
    name.trim().length > 0 &&
    asset.length === 56 &&
    /* No rate, no creation. Guessing one would write a prize table that pays a
       number nobody agreed to, into a document that cannot be corrected. */
    priceOfOne !== null &&
    wallet !== null &&
    outOfOrder === null &&
    priced.every(complete) &&
    judges.some((judge) => judge.length === 56);

  async function create() {
    /* The fee is checked here as well as in `ready`, because this is the guard
       that makes the draft below well typed rather than the one that greys out
       a button. */
    if (wallet === null || platformFee === null) {
      return;
    }

    setBusy(true);
    setResult(null);

    /* Local wall clock in, seconds since the epoch out. The organizer picked
       these against their own clock and the contract keeps time in UTC, so the
       conversion happens once, here, rather than at five call sites. */
    const opensAt = secondsAt(dates.opens);

    const draft: Draft = {
      metadataHash: new Uint8Array(32),
      prizeAsset: asset,
      /* The converted table, never the typed one. The contract has no notion of
         a dollar and would read 3000 as three thousand lumens. */
      tracks: priced,
      judges: judges.filter((judge) => judge.length === 56).map((address) => ({ address, tracks: [] })),
      judgeQuorum: 1,
      schedule: {
        registrationOpensAt: opensAt,
        registrationClosesAt: secondsAt(dates.registrationCloses),
        submissionOpensAt: opensAt,
        submissionClosesAt: secondsAt(dates.submissionCloses),
        screeningClosesAt: secondsAt(dates.screeningCloses),
        judgingClosesAt: secondsAt(dates.judgingCloses),
      },
      /* One person, one project. The contract can allow more and says so in the
         constitution either way, but the default is the rule most events mean
         and the one somebody would be surprised to find switched off. */
      requires,
      multiTeamAllowed: false,
      maxTeamSize: 5,
      settlementDelay,
      platformFee,
    };

    /*
      Editing an existing draft replaces its rules in place.

      One signature rather than three, no deployment, and the same hackathon at
      the same address afterwards. The contract refuses this once the rules are
      locked, which is what keeps the edit path from being a way around the
      freeze rather than something the freeze has to be defended from here.
    */
    if (editing !== null) {
      const outcome = await send(
        editing,
        "configure",
        (await configureArgs(wallet.address, draft)).map((value) => ({ value })),
        wallet.address,
      );

      setResult(outcome);
      setBusy(false);

      if (!outcome.ok) {
        return;
      }

      await describe(editing);
      router.push(`/manage/${editing}`);

      return;
    }

    /* The organizer is the connected wallet, not the signed in account. The
       contract knows nothing about an email address; what it records as the
       organizer is the address that will later lock the rules and move the
       phase. */
    const args = await createArgs(wallet.address, draft);

    /*
      Two signatures, in this order, because the second needs the first.

      The instance is deployed empty: `create` is an ordinary entry point rather
      than a constructor, so passing the constitution to the deployment would
      fail inside the wasm with a missing value. The same shape the vault has,
      and for the same reason.
    */
    const built = await deploy(CORE_WASM, [], wallet.address);

    if (!built.ok || built.contractId === undefined) {
      setResult(built.ok ? { ok: false, why: "the contract deployed but did not report its address", refused: false } : built);
      setBusy(false);
      return;
    }

    const contractId = built.contractId;

    const outcome = await send(
      contractId,
      "create",
      args.map((value) => ({ value })),
      wallet.address,
    );

    setResult(outcome);
    setBusy(false);

    if (!outcome.ok) {
      return;
    }

    /* The look is written after the contract exists, because the handler that
       takes it asks the chain who the organizer is and there is nobody to ask
       about until then. A failure here does not undo the hackathon: the rules
       are on chain and the description can be written again. */
    await describe(contractId);

    /* Straight on to the next thing rather than a page that says "done" and
       leaves somebody wondering what happens now. Creating is the first of
       four steps and the console is where the other three live. */
    router.push(`/manage/${contractId}`);
  }

  /**
   * Sign for the presentation columns and hand them over.
   *
   * The signature proves the organizer's key, which is the only thing that
   * decides whether this may be written. The account and the time are in the
   * challenge as well, so one captured from somebody else, or captured at all,
   * stops working.
   */
  async function describe(contractId: string) {
    if (wallet === null) {
      return;
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const account = await accountId();

    if (account === null) {
      return;
    }

    const message = `stelhacks.v1.metadata:${contractId}:${account}:${issuedAt}`;
    const signature = await proveAddressHex(wallet.address, message).catch(() => null);

    if (signature === null) {
      return;
    }

    await fetch("/api/hackathon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contract: contractId,
        issuedAt,
        signature,
        name: name.trim(),
        tagline: tagline.trim(),
        location: location.trim(),
        logo_url: logo.trim(),
        banner_url: banner.trim(),
        tags: tags
          .split(",")
          /* The placeholder writes them with a hash because that is how
             everyone writes a tag, so the hash has to come off here. Stored
             with it, the same tag typed both ways would be two tags and the
             filter list on the listing would show both. */
          .map((tag) => tag.trim().replace(/^#+/, "").trim().toLowerCase())
          .filter((tag) => tag.length > 0)
          .slice(0, 8),
      }),
    }).catch(() => null);
  }

  if (!known) {
    return <p className="label text-ink-faint">Checking your wallet</p>;
  }

  if (loading) {
    return <p className="label text-ink-faint">Reading the draft</p>;
  }

  if (wallet === null) {
    return (
      <p className="max-w-[38rem] text-[0.9375rem] leading-relaxed text-ink-soft">
        Connect a wallet first. The address you connect is the one the contract
        will record as the organizer, and it is the only address that can lock
        these rules or move the event on afterwards.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <Section index={1} title="What it is">
        <Grid>
          <Field
            label="Hackathon name"
            value={name}
            onChange={setName}
            placeholder="Open House"
          />
          <Field label="Location" value={location} onChange={setLocation} placeholder="Virtual" />
        </Grid>

        <div className="mt-6 space-y-6">
          {/* "Tagline" is a word from a brand deck. What it is asking for is
              the sentence under the name on a card, so it says that. */}
          <Field
            label="Short description"
            value={tagline}
            onChange={setTagline}
            placeholder="Build payments that settle in five seconds"
            note="Shown under the name on the listing. The full description is written later."
          />

          <Field
            label="Tags"
            value={tags}
            onChange={setTags}
            placeholder="#payments, #stellar, #soroban"
            note="Comma separated, eight at most"
          />

          {/* Files rather than links. Both used to ask for a URL, which is a
              question an organizer with a picture on their laptop cannot
              answer.

              One under the other rather than side by side, because the two
              frames are different shapes and a pair of columns has one width to
              give them. Half the row made the banner a hundred pixels tall
              beside a logo twice its height, which is too small to tell whether
              a picture survives being cropped to it, and left the column under
              it empty. Down the page each frame gets the width its own ratio
              wants. */}
          <ImagePicker label="Logo" shape="logo" userId={userId} value={logo} onChange={setLogo} />

          <ImagePicker
            label="Banner"
            shape="banner"
            userId={userId}
            value={banner}
            onChange={setBanner}
          />
        </div>
      </Section>

      <Section
        index={2}
        title="Prize currency"
        note="Which token winners are paid in. Both run on the Stellar network. Prizes are written in dollars below and converted to this token at the rate on the day you create the event."
      >
        <div className="flex flex-wrap gap-3">
          {PRIZE_ASSETS.map((choice) => {
            const picked = asset === choice.contract;

            return (
              <button
                key={choice.contract}
                type="button"
                onClick={() => setAsset(choice.contract)}
                className={`flex min-w-[12rem] flex-1 items-center gap-3.5 rounded-[0.875rem] px-5 py-4 text-left transition-colors duration-150 ease-settle ${
                  picked
                    ? "bg-ink text-paper ring-2 ring-inset ring-ink"
                    : "bg-paper text-ink ring-1 ring-inset ring-rule hover:bg-paper-sunk"
                }`}
              >
                <AssetMark code={choice.code} onDark={picked} />

                <span className="grid gap-0.5">
                  <span className="text-[1.125rem] leading-none">{choice.code}</span>

                  <span
                    className={`text-[0.8125rem] ${picked ? "text-paper/70" : "text-ink-faint"}`}
                  >
                    {choice.name}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/*
          The rate, and what it means, said before anything is signed.

          A prize written in dollars becomes a fixed number of lumens the moment
          this is created, and the contract pays that number however the price
          moves afterwards. That is not a footnote: it is the difference between
          what the organizer budgeted and what a winner receives, and somebody
          who was not told would reasonably assume otherwise.
        */}
        {assetCode === "XLM" && !inTokens && (
          <div className="mt-5 rounded-[0.75rem] bg-paper-sunk px-5 py-4">
            {rateFailed ? (
              <p className="text-[0.875rem] leading-relaxed text-broken">
                The lumen price could not be read, so a dollar amount cannot be
                turned into lumens. Nothing can be created until it can. Reload,
                or pay in USDC instead.
              </p>
            ) : rate === null ? (
              <p className="label text-ink-faint">Reading the lumen price</p>
            ) : (
              <>
                <p className="text-[0.875rem] leading-relaxed text-ink">
                  1 XLM is ${rate.toFixed(4)} right now.
                </p>

                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">
                  Prizes are converted at this rate and the lumen amount is what
                  gets frozen into the rules. If the price moves afterwards the
                  number of lumens paid does not change, so the dollar value a
                  winner receives will differ from the figure you typed. USDC
                  holds its dollar value and avoids this.
                </p>
              </>
            )}
          </div>
        )}
      </Section>

      <Section
        index={3}
        title="Tracks and prizes"
        note="A track is one category projects compete in, with its own prize money and its own scoring. Most events need only one. Give it a short name, say what each place wins, and list what judges score on."
      >
        <div className="space-y-10">
          {tracks.map((track, index) => (
            <TrackForm
              key={index}
              track={track}
              index={index}
              code={assetCode}
              price={priceOfOne}
              usd={quote}
              inTokens={inTokens}
              removable={tracks.length > 1}
              onChange={(next) => setTracks(tracks.map((t, i) => (i === index ? next : t)))}
              onRemove={() => setTracks(tracks.filter((_, i) => i !== index))}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setTracks([...tracks, blankTrack()])}
          className="label mt-8 flex h-10 items-center gap-2 rounded-full px-4 text-ink ring-1 ring-inset ring-rule transition-colors duration-150 ease-settle hover:bg-paper-sunk"
        >
          <span aria-hidden className="text-[1rem] leading-none">+</span>
          Add a track
        </button>
      </Section>

      <Section
        index={4}
        title="Judges"
        note="One Stellar wallet address for each judge. Not a name and not an email: the contract only knows addresses, and only the ones listed here may score."
      >
        <div className="space-y-4">
          {judges.map((judge, index) => (
            <div key={index} className="flex items-end gap-3">
              <div className="flex-1">
                <Field
                  label={`Judge ${index + 1}`}
                  value={judge}
                  onChange={(next) => setJudges(judges.map((j, i) => (i === index ? next : j)))}
                  placeholder="G…"
                  note="Starts with G, 56 characters"
                  mono
                />
              </div>

              {judges.length > 1 && (
                <Remove onClick={() => setJudges(judges.filter((_, i) => i !== index))} />
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setJudges([...judges, ""])}
          className="label mt-6 flex h-10 items-center gap-2 rounded-full px-4 text-ink ring-1 ring-inset ring-rule transition-colors duration-150 ease-settle hover:bg-paper-sunk"
        >
          <span aria-hidden className="text-[1rem] leading-none">+</span>
          Add a judge
        </button>
      </Section>

      {/*
        Five instants, in order, as a list.

        Two revisions got here. It asked for four numbers of days and derived
        the dates from whenever the form happened to be submitted, so an
        organizer who knew their event ran the twelfth to the twenty sixth had
        to do that arithmetic backwards. Then it took dates, which meant every
        deadline landed at one minute to midnight and a hackathon closing at
        five in the afternoon could not be expressed at all.

        A list rather than a grid of eight cells. These are one sequence and
        each is only meaningful against the one above it, so they are read down
        a column with their times in a single tab stop, which is what makes a
        gap or an inversion visible without doing the subtraction.
      */}
      <Section
        index={5}
        title="Schedule"
        note="Five moments, in your own timezone, each one after the one before it."
      >
        <div className="border-t border-rule">
          <Moment
            label="Opens"
            hint="Sign up and building both start"
            value={dates.opens}
            onChange={(v) => setDates({ ...dates, opens: v })}
          />

          <Moment
            label="Registration closes"
            hint="Last moment to sign up"
            value={dates.registrationCloses}
            onChange={(v) => setDates({ ...dates, registrationCloses: v })}
          />

          <Moment
            label="Submissions close"
            hint="The build deadline"
            value={dates.submissionCloses}
            onChange={(v) => setDates({ ...dates, submissionCloses: v })}
          />

          <Moment
            label="Entry check ends"
            hint="By when you will have checked the entries are eligible"
            value={dates.screeningCloses}
            onChange={(v) => setDates({ ...dates, screeningCloses: v })}
          />

          <Moment
            label="Judging ends"
            hint="Last moment for judges to score"
            value={dates.judgingCloses}
            onChange={(v) => setDates({ ...dates, judgingCloses: v })}
          />

          {/*
            What a submission has to carry, decided here rather than assumed.

            This was fixed in code at "a repository, and nothing else", which is
            the common answer and was nobody's choice. It is frozen with
            everything else, so a team reads it before they build and the
            submission form holds them to it.

            The contract does not enforce it: `submit_project` takes one link
            and a digest and never reads these flags. That is why they are worth
            announcing well — screening is where a breach is acted on, and an
            organizer striking out an entry should be pointing at a rule that
            was on the page from the start.
          */}
          <div className="border-b border-rule py-4">
            <p className="label text-[0.8125rem] text-ink">A submission must have</p>

            <div className="mt-3 grid gap-2.5">
              <Requirement
                label="A repository"
                checked={requires.repository}
                onChange={(next) => setRequires({ ...requires, repository: next })}
              />

              <Requirement
                label="A demo video"
                checked={requires.demoVideo}
                onChange={(next) => setRequires({ ...requires, demoVideo: next })}
              />

              <Requirement
                label="Something running"
                checked={requires.liveUrl}
                onChange={(next) => setRequires({ ...requires, liveUrl: next })}
              />
            </div>

            <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-faint">
              Whatever is left unticked is offered to teams as optional. A pitch
              deck is always optional: the frozen rules have no field for one.
            </p>
          </div>

          {/* A duration rather than a moment, because it is counted from the
              ranking and nobody knows when that will be until it happens. */}
          <label className="grid gap-2">
            <span className="label text-ink-soft">Payments open</span>

            <select
              value={String(settlementDelay)}
              onChange={(event) => setSettlementDelay(Number(event.target.value))}
              className="w-full rounded-[0.75rem] border border-rule bg-paper px-4 py-3 text-[0.9375rem] text-ink outline-none transition-colors duration-150 ease-settle focus:border-ink"
            >
              {SETTLEMENT_DELAYS.map((choice) => (
                <option key={choice.seconds} value={choice.seconds}>
                  {choice.label}
                </option>
              ))}
            </select>

            <span className="text-[0.8125rem] text-ink-faint">
              How long after the ranking before the vault may pay. A gap gives
              you time to catch a mistake while the money is still in the vault.
            </span>
          </label>
        </div>

        {outOfOrder !== null && (
          <p className="mt-5 text-[0.875rem] leading-relaxed text-broken">{outOfOrder}</p>
        )}
      </Section>

      {/*
        What the vault will have to hold, as one object.

        Three lines that only mean anything together: the prizes, the cut on top
        of them, and the sum somebody actually deposits. They were a hatched band
        running the full width of the window while the form beside them was
        capped, so the one figure on this page carrying real money was also the
        only thing not aligned with anything.

        Inverted, because it is the last thing read before signing and the only
        card here that is a consequence rather than a question.
      */}
      <section className="rounded-[1.25rem] bg-night p-7 text-night-ink sm:p-9">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="label text-night-ink-soft">Total prize</p>

            {/* Said, because the figure is a sum of things typed far apart. A
                number this size with a bare label reads as one prize rather
                than as every place in every track added together. */}
            <p className="mt-1 text-[0.8125rem] text-night-ink-soft">
              Every place in every track, added up
            </p>
          </div>

          {/* Whichever unit was typed leads and the other follows, in that
              order on every line of this card. Reversing them on one line and
              not another is how somebody reads the wrong number. */}
          <div className="text-right">
            <p className="tabular text-[clamp(1.75rem,4vw,2.5rem)]">
              {inTokens
                ? `${format(total)}${assetCode.length > 0 ? ` ${assetCode}` : ""}`
                : `$${dollars?.total ?? "—"}`}
            </p>

            <p className="tabular mt-1 text-[0.9375rem] text-night-ink-soft">
              {inTokens
                ? dollars === null
                  ? ""
                  : `$${dollars.total}`
                : assetCode.length > 0
                  ? `${format(total)} ${assetCode}`
                  : ""}
            </p>
          </div>
        </div>

        {/* Shown even at zero, because "no fee" is worth reading once and is
            otherwise indistinguishable from a line somebody forgot to look
            for. */}
        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-4 border-t border-night-rule pt-5">
          <p className="label text-night-ink-soft">
            Platform fee {(feeBps / 100).toFixed(feeBps % 100 === 0 ? 0 : 2)}%
          </p>

          <p className="tabular text-[1.0625rem] text-night-ink-soft">
            {format(fee)}
            {assetCode.length > 0 && ` ${assetCode}`}
            {dollars !== null && ` · $${dollars.fee}`}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-4 border-t border-night-rule pt-4">
          <div>
            <p className="label">You deposit</p>

            {/* The one line on this card that is a token amount first. It is
                what the vault is asked for, to the stroop, and the dollar
                figure beside it is only what that came to today. */}
            <p className="mt-1 text-[0.8125rem] text-night-ink-soft">
              What the vault has to hold before the event can open
            </p>
          </div>

          <div className="text-right">
            <p className="tabular text-[1.25rem]">
              {assetCode.length > 0 ? `${format(deposit)} ${assetCode}` : format(deposit)}
            </p>

            {dollars !== null && (
              <p className="tabular mt-1 text-[0.875rem] text-night-ink-soft">
                ${dollars.deposit} today
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Centred under the column rather than pinned to its left edge, so the
          last thing on a long centred form is where the eye already is. */}
      <div className="flex flex-col items-center gap-4 pb-4 text-center">
        <Button disabled={!ready || busy} onClick={() => void create()}>
          {busy ? "Signing" : inTokens ? "Save the changes" : "Create in draft"}
        </Button>

        <p className="max-w-[32rem] text-[0.875rem] leading-relaxed text-ink-soft">
          {platformFee === null && wallet !== null
            ? "This deployment is set to charge a fee but has no collector address configured, so nothing can be created until it does."
            : inTokens
              ? "One signature. It replaces the draft rules at the same address, and stays possible only until you lock them."
              : "Two signatures: one puts this hackathon's own contract on chain, one writes these rules into it. Nothing is frozen yet."}
        </p>

        {result !== null && (
          <p
            className={`max-w-[36rem] text-[0.875rem] leading-relaxed ${
              result.ok ? "text-verified" : "text-broken"
            }`}
          >
            {result.ok ? `Created. ${result.hash}` : result.why}
          </p>
        )}
      </div>
    </div>
  );
}

function TrackForm({
  track,
  index,
  code,
  price,
  usd,
  inTokens,
  removable,
  onChange,
  onRemove,
}: {
  track: Track;
  index: number;
  /** The ticker picked above, printed beside every amount. Empty until then. */
  code: string;
  /** What the boxes below are divided by to reach the token. One in edit mode. */
  price: number | null;
  /** What one token costs in dollars, for the line under each box. */
  usd: number | null;
  /** Whether the boxes below are token amounts rather than dollars. */
  inTokens: boolean;
  removable: boolean;
  onChange: (next: Track) => void;
  onRemove: () => void;
}) {
  const weight = track.criteria.reduce((sum, c) => sum + c.weightBps, 0);
  const balanced = weight === WEIGHT_TOTAL_BPS;

  return (
    <div className="border-l-2 border-rule pl-6">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0 flex-1 max-w-[24rem]">
          <Field
            label={`Track ${index + 1} name`}
            value={track.id}
            onChange={(id) => onChange({ ...track, id: id.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
            placeholder="payments"
            note="One word, lowercase. It appears on every project entered here."
            mono
          />
        </div>

        {removable && <Remove onClick={onRemove} />}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div>
          <p className="label text-[0.8125rem] text-ink">Prizes</p>

          {/* Where the money is typed, which was the one thing the currency
              card three sections up could not say for itself. */}
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-faint">
            What each place wins, in {inTokens ? (code.length > 0 ? code : "the prize token") : "dollars"}
          </p>

          <div className="mt-3 space-y-2">
            {track.prizes.map((prize, at) => {
              /* The same amount in the other unit, under the box rather than
                 replacing what was typed. What somebody entered stays theirs;
                 this is what it comes to, and which way round that runs is the
                 only thing the two modes disagree about. */
              const other = inTokens
                ? usd === null
                  ? ""
                  : `$${dollarsOf(toSmallestUnit(prize.amount), usd)}`
                : (() => {
                    const converted = inAsset(prize.amount, price);
                    return converted.length === 0 || code.length === 0
                      ? ""
                      : `${format(toSmallestUnit(converted))} ${code}`;
                  })();

              return (
                <div key={prize.rank}>
                  <div className="flex items-center gap-3">
                    <span className="label w-12 text-ink-faint">{ordinal(prize.rank)}</span>

                    <div className="flex h-10 flex-1 items-center bg-paper ring-1 ring-inset ring-rule transition-shadow duration-150 ease-settle focus-within:ring-ink">
                      {!inTokens && <span className="label pl-3 text-ink-faint">$</span>}

                      <input
                        value={prize.amount}
                        onChange={(event) =>
                          onChange({
                            ...track,
                            prizes: track.prizes.map((p, i) =>
                              i === at
                                ? { ...p, amount: event.target.value.replace(/[^0-9.]/g, "") }
                                : p,
                            ),
                          })
                        }
                        inputMode="decimal"
                        placeholder="0"
                        className="tabular h-full min-w-0 flex-1 bg-transparent px-2.5 text-[0.9375rem] text-ink outline-none"
                      />

                      {inTokens && code.length > 0 && (
                        <span className="label pr-3 text-ink-faint">{code}</span>
                      )}
                    </div>

                    {track.prizes.length > 1 && (
                      <Remove
                        onClick={() =>
                          onChange({
                            ...track,
                            prizes: track.prizes
                              .filter((_, i) => i !== at)
                              .map((p, i) => ({ ...p, rank: i + 1 })),
                          })
                        }
                      />
                    )}
                  </div>

                  {other.length > 0 && (
                    <p className="tabular mt-1 pl-[3.75rem] text-[0.75rem] text-ink-faint">
                      {other}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() =>
              onChange({
                ...track,
                prizes: [...track.prizes, { rank: track.prizes.length + 1, amount: "" }],
              })
            }
            className="label mt-3 text-ink-soft transition-colors duration-150 ease-settle hover:text-ink"
          >
            + add a place
          </button>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <p className="label text-[0.8125rem] text-ink">Scoring</p>

            {/* The weights have to add up exactly or the contract refuses the
                whole constitution. Saying so as it happens is the difference
                between fixing one number and rereading a rejected form. */}
            <p className={`label ${balanced ? "text-verified" : "text-ink-faint"}`}>
              {(weight / 100).toFixed(0)}%
            </p>
          </div>

          <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-faint">
            What judges mark each project on, and how much each one counts. They
            have to add up to 100.
          </p>

          <div className="mt-3 space-y-2">
            {track.criteria.map((criterion, at) => (
              <div key={at} className="flex items-center gap-3">
                <input
                  value={criterion.id}
                  onChange={(event) =>
                    onChange({
                      ...track,
                      criteria: track.criteria.map((c, i) =>
                        i === at
                          ? { ...c, id: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }
                          : c,
                      ),
                    })
                  }
                  placeholder="impact"
                  className="h-10 flex-1 bg-paper px-3 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
                />

                <input
                  value={criterion.weightBps === 0 ? "" : String(criterion.weightBps / 100)}
                  onChange={(event) =>
                    onChange({
                      ...track,
                      criteria: track.criteria.map((c, i) =>
                        i === at
                          ? { ...c, weightBps: Math.round(Number(event.target.value || 0) * 100) }
                          : c,
                      ),
                    })
                  }
                  inputMode="numeric"
                  placeholder="0"
                  className="tabular h-10 w-16 bg-paper px-3 text-center text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-ink"
                />

                {track.criteria.length > 1 && (
                  <Remove
                    onClick={() =>
                      onChange({ ...track, criteria: track.criteria.filter((_, i) => i !== at) })
                    }
                  />
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              onChange({ ...track, criteria: [...track.criteria, { id: "", weightBps: 0 }] })
            }
            className="label mt-3 text-ink-soft transition-colors duration-150 ease-settle hover:text-ink"
          >
            + add a criterion
          </button>

          {/* A hairline that fills as the weights approach a hundred. It is the
              only moving thing on the page and it moves for the one number that
              silently invalidates everything else. */}
          <div className="mt-4 h-px w-full bg-rule">
            <div
              className={`h-px transition-[width,background-color] duration-300 ease-settle ${
                balanced ? "bg-verified" : "bg-ink-faint"
              }`}
              style={{ width: `${Math.min(100, weight / 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One step of the form, as a card.
 *
 * It used to print its title twice, once through the numbered spec label and
 * again as a heading under it, which read as a rendering fault rather than as
 * emphasis. The number now sits in its own token beside a single title, which is
 * what the numbering was for.
 *
 * A card rather than open page. The form is long and every section used to run
 * to the same left edge with nothing marking where one ended and the next began;
 * a reader had to use the headings as fences. A surface with an edge does that
 * on its own, and it is also what lets the whole thing be centred rather than
 * pinned left with a third of the window empty beside it.
 */
function Section({
  index,
  title,
  note,
  children,
}: {
  /* A plain number rather than a zero padded string. "01" is a catalogue
     reference; there are five of these and nobody is looking one up. */
  index: number;
  title: string;
  /** What the section is asking for, when the fields alone do not say. */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.25rem] bg-paper p-8 ring-1 ring-rule sm:p-10">
      <div className="flex items-center gap-3.5">
        <span className="tabular grid size-9 shrink-0 place-items-center rounded-full bg-paper-sunk text-[1rem] font-semibold text-ink-soft ring-1 ring-inset ring-rule">
          {index}
        </span>

        <h2 className="text-[1.5rem] text-ink">{title}</h2>
      </div>

      {note !== undefined && (
        <p className="mt-3 max-w-[42rem] text-[0.9375rem] leading-relaxed text-ink-soft">{note}</p>
      )}

      <div className="mt-8">{children}</div>
    </section>
  );
}

/* No width cap of its own any more. The card is the measure, so a field that
   set its own would be two rules about the same edge and the narrower one would
   win invisibly. */
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-6 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  note,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  note?: string;
  mono?: boolean;
}) {
  return (
    <label className="grid gap-2">
      {/* Ink rather than the faint grey these used to be. A label is the
          question and the grey text inside the box is an example answer; when
          both were the same weight the form read as a column of grey with no
          indication which parts somebody was meant to supply. */}
      <span className="label text-[0.8125rem] text-ink">{label}</span>

      {/* Not trimmed here. Trimming on every keystroke eats the space the moment
          it is typed, so "Stellar Türkiye" can only ever be entered as
          "StellarTürkiye" and the field looks broken rather than strict. What
          gets saved is trimmed at submit, which is where it belongs: a value is
          tidied when it is committed, not while somebody is still typing it. */}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`h-12 rounded-[0.625rem] bg-paper px-4 text-[1rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-2 focus:ring-ink ${
          mono ? "tabular text-[0.875rem]" : ""
        }`}
      />

      {note !== undefined && (
        <span className="text-[0.8125rem] leading-relaxed text-ink-faint">{note}</span>
      )}
    </label>
  );
}

/**
 * One point in the schedule: what it is on the left, when it is on the right.
 *
 * A native datetime input rather than a written one. It is the only control
 * here that every platform already renders in the reader's own locale, and a
 * picker we wrote would be a second opinion about what the fourth of the month
 * at six means.
 */
function Moment({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule py-4">
      <span className="grid gap-0.5">
        <span className="label text-[0.8125rem] text-ink">{label}</span>

        <span className="text-[0.8125rem] text-ink-faint">{hint}</span>
      </span>

      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="tabular h-11 w-[15rem] rounded-[0.625rem] bg-paper px-3.5 text-[0.9375rem] text-ink ring-1 ring-inset ring-rule outline-none transition-shadow duration-150 ease-settle focus:ring-2 focus:ring-ink"
      />
    </label>
  );
}

/**
 * The token's own mark, in its own colours.
 *
 * The real marks rather than something drawn to look like them, because these
 * are two currencies somebody is about to commit money in and an approximation
 * is a small lie in the one place on the form where recognising the thing at a
 * glance is the whole job. Both are the published token icons: the lumen's
 * shuttle on black, and USDC's blue disc.
 *
 * Inlined rather than fetched. Two marks at twenty four pixels are not worth a
 * request each, and a logo that arrives after the card it sits in is a card
 * that moves while somebody is reading it.
 *
 * `onDark` is the selected card, where the lumen's black disc would otherwise
 * disappear into the ground it is drawn on.
 */
function AssetMark({ code, onDark }: { code: string; onDark: boolean }) {
  const ring = onDark ? "ring-1 ring-white/30" : "";

  if (code === "USDC") {
    return (
      <svg
        aria-hidden
        viewBox="0 0 2000 2000"
        className={`size-7 shrink-0 rounded-full ${ring}`}
      >
        <path
          d="M1000 2000c554.17 0 1000-445.83 1000-1000S1554.17 0 1000 0 0 445.83 0 1000s445.83 1000 1000 1000z"
          fill="#2775ca"
        />
        <path
          d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34s41.67-95.83 125-95.83c75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-16.67-91.67-91.67-162.5-187.5-170.83v-100c0-16.67-12.5-29.17-33.33-33.34h-62.5c-16.67 0-29.17 12.5-33.34 33.34v95.83c-125 16.67-204.16 100-204.16 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5s-58.34 112.5-137.5 112.5c-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c16.66 104.16 83.33 179.16 220.83 200v100c0 16.66 12.5 29.16 33.33 33.33h62.5c16.67 0 29.17-12.5 33.34-33.33v-100c125-20.84 208.33-108.34 208.33-220.84z"
          fill="#fff"
        />
        <path
          d="M787.5 1595.83c-325-116.66-491.67-479.16-370.83-800 62.5-175 200-308.33 370.83-370.83 16.67-8.33 25-20.83 25-41.67V325c0-16.67-8.33-29.17-25-33.33-4.17 0-12.5 0-16.67 4.16-395.83 125-612.5 545.84-487.5 941.67 75 233.33 254.17 412.5 487.5 487.5 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-8.33 4.17-16.66v-58.34c0-12.5-12.5-29.16-25-37.5zM1229.17 295.83c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 8.33-4.17 16.67v58.33c0 16.67 12.5 33.33 25 41.67 325 116.66 491.67 479.16 370.83 800-62.5 175-200 308.33-370.83 370.83-16.67 8.33-25 20.83-25 41.67V1700c0 16.67 8.33 29.17 25 33.33 4.17 0 12.5 0 16.67-4.16 395.83-125 612.5-545.84 487.5-941.67-75-237.5-258.34-416.67-487.5-491.67z"
          fill="#fff"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden viewBox="0 0 256 256" className={`size-7 shrink-0 rounded-full ${ring}`}>
      <circle cx="128" cy="128" r="128" fill="#000" />

      {/* The published shuttle, scaled into the disc rather than redrawn. Its
          own artboard is 236.36 by 200, so it is placed by transform and left
          otherwise untouched. */}
      <g fill="#fff" transform="translate(43.5 56.6) scale(0.7141)">
        <path d="M203,26.16l-28.46,14.5-137.43,70a82.49,82.49,0,0,1-.7-10.69A81.87,81.87,0,0,1,158.2,28.6l16.29-8.3,2.43-1.24A100,100,0,0,0,18.18,100q0,3.82.29,7.61a18.19,18.19,0,0,1-9.88,17.58L0,129.57V150l25.29-12.89,0,0,8.19-4.18,8.07-4.11v0L186.43,55l16.28-8.29,33.65-17.15V9.14Z" />
        <path d="M236.36,50,49.78,145,33.5,153.31,0,170.38v20.41l33.27-16.95,28.46-14.5L199.3,89.24A83.45,83.45,0,0,1,200,100,81.87,81.87,0,0,1,78.09,171.36l-1,.53-17.66,9A100,100,0,0,0,218.18,100c0-2.57-.1-5.14-.29-7.68a18.2,18.2,0,0,1,9.87-17.58l8.6-4.38Z" />
      </g>
    </svg>
  );
}

function Remove({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className="grid size-10 shrink-0 place-items-center text-ink-faint transition-colors duration-150 ease-settle hover:text-broken"
    >
      <span aria-hidden className="text-[1.125rem] leading-none">×</span>
    </button>
  );
}

/**
 * Which signed in account this is, from the browser's own session.
 *
 * Read here rather than passed in, because the challenge has to name the
 * account the server will check it against and the server takes that from the
 * cookie rather than from anything the page sends.
 */
async function accountId(): Promise<string | null> {
  const { browserClient } = await import("../../lib/supabase/client");
  const db = browserClient();

  if (db === null) {
    return null;
  }

  const { data } = await db.auth.getUser();

  return data.user?.id ?? null;
}

/** The handler wants hex; a wallet returns base64. */

interface Dates {
  opens: string;
  registrationCloses: string;
  submissionCloses: string;
  screeningCloses: string;
  judgingCloses: string;
}

/**
 * A month long event starting next week, which is what most of them are.
 *
 * Opening in the morning and every deadline in the evening, because that is
 * when events actually run and a default of one minute to midnight is a time
 * nobody chose. Computed lazily rather than at module load, and safe from a
 * hydration mismatch because the form does not render until the wallet has been
 * checked on the client.
 */
/**
 * The waits an organizer may put between the ranking and the first payment.
 *
 * A short list rather than a free number of seconds. The choice is about how
 * much room somebody wants to catch a mistake, which is answered in hours and
 * days; a text field would invite a figure typed in the wrong unit and freeze it
 * into rules nobody can amend.
 *
 * None is offered because a test event wants it and because an organizer paying
 * out on stage does too. It is not the default, since an event that has just
 * ranked is the worst moment to discover the ranking was wrong.
 */
const SETTLEMENT_DELAYS = [
  { seconds: 0, label: "Straight away" },
  { seconds: 3_600, label: "An hour after the ranking" },
  { seconds: 86_400, label: "A day after the ranking" },
  { seconds: 3 * 86_400, label: "Three days after the ranking" },
] as const;

function defaultDates(): Dates {
  const day = 86_400_000;
  const from = Date.now();

  return {
    opens: momentOf(from + 7 * day, 9, 0),
    registrationCloses: momentOf(from + 21 * day, 23, 59),
    submissionCloses: momentOf(from + 28 * day, 18, 0),
    screeningCloses: momentOf(from + 31 * day, 18, 0),
    judgingCloses: momentOf(from + 38 * day, 18, 0),
  };
}

/** An instant from the contract, as the local wall clock a date input shows. */
function momentAt(seconds: number): string {
  const at = new Date(seconds * 1000);

  return momentOf(at.getTime(), at.getHours(), at.getMinutes());
}

/** What a datetime input wants: local wall clock, no zone and no seconds. */
function momentOf(ms: number, hour: number, minute: number): string {
  const at = new Date(ms);
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const date = String(at.getDate()).padStart(2, "0");
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  return `${at.getFullYear()}-${month}-${date}T${time}`;
}

/* No trailing Z, so the browser reads it in the organizer's own timezone. A
   deadline belongs to whoever set it, and one silently taken as UTC would close
   three hours early for half of Europe. */
function secondsAt(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

/**
 * The first thing wrong with the order, or nothing.
 *
 * The contract refuses a schedule that runs backwards and says only
 * `ScheduleInvalid`, which arrives after a deployment and a signature. These
 * are the same comparisons made before either.
 *
 * Compared as strings, which is sound because every one of them is the same
 * fixed width local format and sorts the way the instants do.
 *
 * Registration may close at the same moment submissions do, which is an event
 * with no separate sign up window and a normal shape. Screening and judging
 * each need their own, because the contract compares those strictly.
 */
function disordered(dates: Dates): string | null {
  if (Object.values(dates).some((moment) => moment.length === 0)) {
    return "Every one of these needs a date and a time.";
  }

  if (dates.registrationCloses <= dates.opens) {
    return "Registration has to close after the event opens.";
  }

  if (dates.submissionCloses < dates.registrationCloses) {
    return "Submissions cannot close before registration does.";
  }

  if (dates.submissionCloses <= dates.opens) {
    return "Submissions have to close after the event opens.";
  }

  if (dates.screeningCloses <= dates.submissionCloses) {
    return "The entry check has to end after submissions close.";
  }

  if (dates.judgingCloses <= dates.screeningCloses) {
    return "Judging has to end after screening does.";
  }

  return null;
}

/**
 * A prize written in dollars, as an amount of the token it will be paid in.
 *
 * Both sides are held at seven decimal places and the arithmetic is done in
 * integers, so the string this returns fed back through `toSmallestUnit` gives
 * exactly the number of stroops counted here. A float divide would agree to
 * about fifteen digits and disagree on the last one, which is the difference
 * between a vault that is funded and a vault that is one stroop short of the
 * amount the contract insists on.
 *
 * Empty when there is no rate, rather than zero. Zero is a prize somebody
 * deliberately set to nothing; a missing rate is a figure that is not known
 * yet, and the two must not render the same.
 */
function inAsset(dollars: string, price: number | null): string {
  if (price === null || price <= 0) {
    return "";
  }

  const scale = BigInt(10_000_000);
  const perToken = BigInt(Math.round(price * 10_000_000));

  if (perToken === BigInt(0)) {
    return "";
  }

  return unitsToString((toSmallestUnit(dollars) * scale) / perToken);
}

/** Stroops back to the decimal string the rest of this file passes around. */
function unitsToString(units: bigint): string {
  const scale = BigInt(10_000_000);

  return `${units / scale}.${(units % scale).toString().padStart(7, "0")}`;
}

/**
 * A token amount as dollars, for the line under the figure that decides things.
 *
 * A float is right here and wrong two functions up. Nothing is encoded from
 * this: it is a number somebody reads to know roughly what they are committing,
 * and it is rounded to cents on the way out anyway.
 */
function dollarsOf(units: bigint, price: number): string {
  return ((Number(units) / 10_000_000) * price).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function blankTrack(): Track {
  return {
    id: "",
    criteria: [{ id: "", weightBps: 0 }],
    prizes: [{ rank: 1, amount: "" }],
    noAwardAllowed: false,
  };
}

function complete(track: Track): boolean {
  return (
    track.id.length > 0 &&
    track.prizes.every((prize) => toSmallestUnit(prize.amount) > BigInt(0)) &&
    track.criteria.every((criterion) => criterion.id.length > 0) &&
    track.criteria.reduce((sum, c) => sum + c.weightBps, 0) === WEIGHT_TOTAL_BPS
  );
}

function ordinal(rank: number): string {
  return ["1st", "2nd", "3rd"][rank - 1] ?? `${rank}th`;
}

/**
 * The prize table as a person reads it, not as the ledger stores it.
 *
 * The fraction is kept when there is one, so a small amount never reads as
 * zero. This is the figure somebody is committing money against.
 */
function format(amount: bigint): string {
  const scale = BigInt(10_000_000);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(7, "0").replace(/0+$/, "");

  return fraction.length === 0
    ? whole.toLocaleString("en-US")
    : `${whole.toLocaleString("en-US")}.${fraction}`;
}

/**
 * One thing a submission may be required to carry.
 *
 * A checkbox rather than a switch. Three of these sit in a list and the
 * question is the same for each, which is what a checkbox is for; a row of
 * switches reads as three separate settings that happen to be adjacent.
 */
function Requirement({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-[0.9375rem] text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-ink"
      />

      <span>{label}</span>

      {!checked && <span className="text-[0.8125rem] text-ink-faint">optional</span>}
    </label>
  );
}
