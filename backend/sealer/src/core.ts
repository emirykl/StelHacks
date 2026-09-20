import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { HackathonCore } from "@stelhacks/sdk";

import { settings } from "./config.js";

/**
 * The service's own hand on the contract.
 *
 * One keypair for everything it does on chain: the constitution names this
 * address as the sealer, so a root published by it is published by exactly the
 * party the frozen rules already identified. The reveals that follow need no
 * signature at all — the Merkle proof is what authorizes those — but they go
 * out under the same key because it is the one this process has.
 */
export const sealer = Keypair.fromSecret(settings.sealerSecret);

export function core(contract: string): HackathonCore {
  return new HackathonCore({
    contractId: contract,
    networkPassphrase: settings.networkPassphrase,
    rpcUrl: settings.rpcUrl,
    publicKey: sealer.publicKey(),
    ...basicNodeSigner(sealer, settings.networkPassphrase),
  });
}
