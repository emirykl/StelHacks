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
  restore,
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

  const held = useMemo(
    () => ({ wallet, known, connect, disconnect }),
    [wallet, known, connect, disconnect],
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
