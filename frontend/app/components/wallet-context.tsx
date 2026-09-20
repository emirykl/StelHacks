"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  connect as openPicker,
  disconnect as forget,
  ours,
  restore,
  walletNetwork,
  watch,
  type Connection,
} from "../../lib/wallet";

/**
 * One answer to "which wallet is connected", for the whole site.
 *
 * The header and the account page both need it, and they are on opposite sides
 * of the layout, so it cannot live inside either. Keeping two copies would let
 * them disagree, and the one thing a header showing an address must never do is
 * name a different key from the one that is about to sign.
 *
 * It also survives navigation. The kit stores the last address, so this reads
 * it back on load rather than making somebody reconnect on every page.
 */

interface Held {
  wallet: Connection | null;
  /** Before the first read finishes, we do not know. Not the same as "none". */
  known: boolean;
  /**
   * The network the wallet is pointed at, when it is not the one we are on.
   *
   * Null covers three cases that all mean "carry on": no wallet, the same
   * network, and a wallet that declined to say. Only a stated disagreement
   * lands here, because that is the only one worth stopping somebody over.
   */
  wrongNetwork: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const Context = createContext<Held | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Connection | null>(null);
  const [known, setKnown] = useState(false);

  useEffect(() => {
    let alive = true;
    let stop: (() => void) | undefined;

    /*
      The kit is the largest thing this site can ship, and most visits never
      touch a wallet. So the cheap question is asked first, straight off local
      storage: has this browser ever connected one? If not, there is nothing to
      restore and nothing to watch, and the import never happens.

      The key belongs to the kit. Reading it here couples us to a detail of
      theirs, and the alternative is importing the whole library to ask.
    */
    if (window.localStorage.getItem("@StellarWalletsKit/selectedModuleId") === null) {
      setKnown(true);
      return;
    }

    void (async () => {
      const found = await restore();

      if (!alive) {
        return;
      }

      setWallet(found);
      setKnown(true);

      /*
        Somebody can switch accounts inside the extension without touching this
        page. Re-reading through `restore` rather than trusting the address in
        the event keeps the wallet's name and the address coming from the same
        place.
      */
      stop = await watch((address) => {
        if (!alive) {
          return;
        }

        if (address === undefined) {
          setWallet(null);
          return;
        }

        void restore().then((current) => {
          if (alive) {
            setWallet(current);
          }
        });
      });
    })();

    return () => {
      alive = false;
      stop?.();
    };
  }, []);

  const connect = useCallback(async () => {
    /* Null means the picker was closed. Whatever was connected stays. */
    const chosen = await openPicker();

    if (chosen !== null) {
      setWallet(chosen);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await forget();
    setWallet(null);
  }, []);

  /*
    Which network the extension is on, asked whenever the wallet changes.

    A wallet extension keeps its own network setting and nothing keeps it in
    step with this deployment's. Signing across that gap does not fail politely:
    the extension opens, refuses, and says the transaction "is not possible at
    the moment", which reads as our bug at the last step of a long form. Asked
    here, once, so every surface that signs can say so before the prompt.
  */
  const [wrongNetwork, setWrongNetwork] = useState<string | null>(null);

  useEffect(() => {
    if (wallet === null) {
      setWrongNetwork(null);
      return;
    }

    let alive = true;

    const ask = () => {
      void walletNetwork().then((theirs) => {
        if (alive) {
          setWrongNetwork(theirs === null || theirs === ours ? null : theirs);
        }
      });
    };

    ask();

    /*
      Asked again whenever this tab comes back.

      Switching networks happens inside the extension and tells us nothing: the
      address does not change, so nothing here re-runs. Asked once, the notice
      would keep insisting on a setting the person has already gone and fixed,
      which is worse than not having noticed in the first place. Coming back to
      the tab is exactly the moment they have finished changing it.
    */
    const again = () => {
      if (document.visibilityState === "visible") {
        ask();
      }
    };

    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);

    /* And a slow poll, but only while we are the ones complaining. Some wallets
       are switched without this tab ever losing focus, and a notice that clears
       itself in a few seconds is the difference between a setting and a wall. */
    const polling =
      wrongNetwork === null ? undefined : window.setInterval(ask, 4_000);

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);

      if (polling !== undefined) {
        window.clearInterval(polling);
      }
    };
  }, [wallet, wrongNetwork]);

  const held = useMemo(
    () => ({ wallet, known, wrongNetwork, connect, disconnect }),
    [wallet, known, wrongNetwork, connect, disconnect],
  );

  return <Context.Provider value={held}>{children}</Context.Provider>;
}

export function useWallet(): Held {
  const held = useContext(Context);

  if (held === null) {
    throw new Error("useWallet was called outside the provider");
  }

  return held;
}

/** Enough of an address to recognise, with the middle left out. */
export function shorten(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
