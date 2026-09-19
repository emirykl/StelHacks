import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




/**
 * Every rejection the vault can produce.
 * 
 * The list is deliberately short. A vault that can fail in many ways is a
 * vault nobody can reason about, and this one only has to do three things:
 * take money from anyone, hold it where no key can reach it, and pay out when
 * the hackathon it is bound to says the result is final.
 */
export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  /**
   * The caller is not the hackathon this vault was bound to at creation.
   * Nothing else can move money out.
   */
  3: {message:"NotCore"},
  4: {message:"AmountNotPositive"},
  5: {message:"InsufficientBalance"}
}




/**
 * What the vault stores.
 * 
 * Both entries are written once at creation and never again. A vault whose
 * hackathon or asset could be changed later would be a vault whose deposits
 * mean nothing, since the money could be redirected after it arrived.
 */
export type DataKey = {tag: "Core", values: void} | {tag: "Asset", values: void};

export interface Client {
  /**
   * Construct and simulate a pay transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Sends part of the pool to a winner.
   * 
   * The single line that matters is the authorization check: only the
   * hackathon this vault was bound to can call this. That contract computes
   * the ranking itself and refuses to accept one from anywhere else, so the
   * path from a scorecard to a payment never leaves the chain.
   */
  pay: ({to, amount}: {to: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a core transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The hackathon this vault pays for.
   */
  core: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a asset transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The token the prize is denominated in.
   */
  asset: (options?: MethodOptions) => Promise<AssembledTransaction<Result<string>>>

  /**
   * Construct and simulate a create transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Binds a new vault to one hackathon and one asset.
   */
  create: ({core, asset}: {core: string, asset: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a balance transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * What the pool holds right now.
   * 
   * Read from the token rather than from a counter this contract keeps, so
   * the number can never drift from the truth. It also means a direct
   * transfer to this address, made without calling `deposit`, still counts
   * toward the prize.
   */
  balance: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Adds to the prize pool.
   * 
   * Open to anyone at any phase, and deliberately so. A sponsor arriving on
   * the last day, or a third party topping up a pool they liked the look of,
   * harms nobody: the prize only ever grows, and the page shows where the
   * growth came from.
   */
  deposit: ({from, amount}: {from: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAATtFdmVyeSByZWplY3Rpb24gdGhlIHZhdWx0IGNhbiBwcm9kdWNlLgoKVGhlIGxpc3QgaXMgZGVsaWJlcmF0ZWx5IHNob3J0LiBBIHZhdWx0IHRoYXQgY2FuIGZhaWwgaW4gbWFueSB3YXlzIGlzIGEKdmF1bHQgbm9ib2R5IGNhbiByZWFzb24gYWJvdXQsIGFuZCB0aGlzIG9uZSBvbmx5IGhhcyB0byBkbyB0aHJlZSB0aGluZ3M6CnRha2UgbW9uZXkgZnJvbSBhbnlvbmUsIGhvbGQgaXQgd2hlcmUgbm8ga2V5IGNhbiByZWFjaCBpdCwgYW5kIHBheSBvdXQgd2hlbgp0aGUgaGFja2F0aG9uIGl0IGlzIGJvdW5kIHRvIHNheXMgdGhlIHJlc3VsdCBpcyBmaW5hbC4AAAAAAAAAAAVFcnJvcgAAAAAAAAUAAAAAAAAAEkFscmVhZHlJbml0aWFsaXplZAAAAAAAAQAAAAAAAAAOTm90SW5pdGlhbGl6ZWQAAAAAAAIAAABlVGhlIGNhbGxlciBpcyBub3QgdGhlIGhhY2thdGhvbiB0aGlzIHZhdWx0IHdhcyBib3VuZCB0byBhdCBjcmVhdGlvbi4KTm90aGluZyBlbHNlIGNhbiBtb3ZlIG1vbmV5IG91dC4AAAAAAAAHTm90Q29yZQAAAAADAAAAAAAAABFBbW91bnROb3RQb3NpdGl2ZQAAAAAAAAQAAAAAAAAAE0luc3VmZmljaWVudEJhbGFuY2UAAAAABQ==",
        "AAAABQAAAEJNb25leSBsZWZ0LCB3aGljaCBjYW4gb25seSBldmVyIGhhcHBlbiBhZ2FpbnN0IGEgZmluYWxpemVkIHJlc3VsdC4AAAAAAAAAAAAEUGFpZAAAAAEAAAAEcGFpZAAAAAMAAAAAAAAAAnRvAAAAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAHYmFsYW5jZQAAAAALAAAAAAAAAAI=",
        "AAAABQAAAC9UaGUgdmF1bHQgZXhpc3RzIGFuZCBpcyBib3VuZCB0byBpdHMgaGFja2F0aG9uLgAAAAAAAAAAB0NyZWF0ZWQAAAAAAQAAAAdjcmVhdGVkAAAAAAIAAAAAAAAABGNvcmUAAAATAAAAAQAAAAAAAAAFYXNzZXQAAAAAAAATAAAAAAAAAAI=",
        "AAAABQAAAOBNb25leSBhcnJpdmVkLgoKVGhlIGRlcG9zaXRvciBpcyBhIHRvcGljIGJlY2F1c2UgYSBzcG9uc29yIHdhbnRzIHRvIHBvaW50IGF0IHRoZWlyIG93bgpjb250cmlidXRpb24sIGFuZCB0aGUgcnVubmluZyBiYWxhbmNlIHRyYXZlbHMgYWxvbmcgc28gYSByZWFkZXIgbmV2ZXIgaGFzIHRvCmFkZCB0aGUgZGVwb3NpdHMgdXAgdGhlbXNlbHZlcyB0byBrbm93IHdoZXJlIHRoZSBwb29sIHN0b29kLgAAAAAAAAAJRGVwb3NpdGVkAAAAAAAAAQAAAAlkZXBvc2l0ZWQAAAAAAAADAAAAAAAAAARmcm9tAAAAEwAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAAB2JhbGFuY2UAAAAACwAAAAAAAAAC",
        "AAAAAgAAAO5XaGF0IHRoZSB2YXVsdCBzdG9yZXMuCgpCb3RoIGVudHJpZXMgYXJlIHdyaXR0ZW4gb25jZSBhdCBjcmVhdGlvbiBhbmQgbmV2ZXIgYWdhaW4uIEEgdmF1bHQgd2hvc2UKaGFja2F0aG9uIG9yIGFzc2V0IGNvdWxkIGJlIGNoYW5nZWQgbGF0ZXIgd291bGQgYmUgYSB2YXVsdCB3aG9zZSBkZXBvc2l0cwptZWFuIG5vdGhpbmcsIHNpbmNlIHRoZSBtb25leSBjb3VsZCBiZSByZWRpcmVjdGVkIGFmdGVyIGl0IGFycml2ZWQuAAAAAAAAAAAAB0RhdGFLZXkAAAAAAgAAAAAAAABOVGhlIGhhY2thdGhvbiB0aGlzIHZhdWx0IHBheXMgZm9yLiBUaGUgb25seSBhZGRyZXNzIGFsbG93ZWQgdG8gbW92ZQptb25leSBvdXQuAAAAAAAEQ29yZQAAAAAAAAAvVGhlIHRva2VuIHRoZSBwcml6ZSBpcyBkZW5vbWluYXRlZCBhbmQgcGFpZCBpbi4AAAAABUFzc2V0AAAA",
        "AAAAAAAAATFTZW5kcyBwYXJ0IG9mIHRoZSBwb29sIHRvIGEgd2lubmVyLgoKVGhlIHNpbmdsZSBsaW5lIHRoYXQgbWF0dGVycyBpcyB0aGUgYXV0aG9yaXphdGlvbiBjaGVjazogb25seSB0aGUKaGFja2F0aG9uIHRoaXMgdmF1bHQgd2FzIGJvdW5kIHRvIGNhbiBjYWxsIHRoaXMuIFRoYXQgY29udHJhY3QgY29tcHV0ZXMKdGhlIHJhbmtpbmcgaXRzZWxmIGFuZCByZWZ1c2VzIHRvIGFjY2VwdCBvbmUgZnJvbSBhbnl3aGVyZSBlbHNlLCBzbyB0aGUKcGF0aCBmcm9tIGEgc2NvcmVjYXJkIHRvIGEgcGF5bWVudCBuZXZlciBsZWF2ZXMgdGhlIGNoYWluLgAAAAAAAANwYXkAAAAAAgAAAAAAAAACdG8AAAAAABMAAAAAAAAABmFtb3VudAAAAAAACwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAACJUaGUgaGFja2F0aG9uIHRoaXMgdmF1bHQgcGF5cyBmb3IuAAAAAAAEY29yZQAAAAAAAAABAAAD6QAAABMAAAAD",
        "AAAAAAAAACZUaGUgdG9rZW4gdGhlIHByaXplIGlzIGRlbm9taW5hdGVkIGluLgAAAAAABWFzc2V0AAAAAAAAAAAAAAEAAAPpAAAAEwAAAAM=",
        "AAAAAAAAADFCaW5kcyBhIG5ldyB2YXVsdCB0byBvbmUgaGFja2F0aG9uIGFuZCBvbmUgYXNzZXQuAAAAAAAABmNyZWF0ZQAAAAAAAgAAAAAAAAAEY29yZQAAABMAAAAAAAAABWFzc2V0AAAAAAAAEwAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAQFXaGF0IHRoZSBwb29sIGhvbGRzIHJpZ2h0IG5vdy4KClJlYWQgZnJvbSB0aGUgdG9rZW4gcmF0aGVyIHRoYW4gZnJvbSBhIGNvdW50ZXIgdGhpcyBjb250cmFjdCBrZWVwcywgc28KdGhlIG51bWJlciBjYW4gbmV2ZXIgZHJpZnQgZnJvbSB0aGUgdHJ1dGguIEl0IGFsc28gbWVhbnMgYSBkaXJlY3QKdHJhbnNmZXIgdG8gdGhpcyBhZGRyZXNzLCBtYWRlIHdpdGhvdXQgY2FsbGluZyBgZGVwb3NpdGAsIHN0aWxsIGNvdW50cwp0b3dhcmQgdGhlIHByaXplLgAAAAAAAAdiYWxhbmNlAAAAAAAAAAABAAAACw==",
        "AAAAAAAAAQFBZGRzIHRvIHRoZSBwcml6ZSBwb29sLgoKT3BlbiB0byBhbnlvbmUgYXQgYW55IHBoYXNlLCBhbmQgZGVsaWJlcmF0ZWx5IHNvLiBBIHNwb25zb3IgYXJyaXZpbmcgb24KdGhlIGxhc3QgZGF5LCBvciBhIHRoaXJkIHBhcnR5IHRvcHBpbmcgdXAgYSBwb29sIHRoZXkgbGlrZWQgdGhlIGxvb2sgb2YsCmhhcm1zIG5vYm9keTogdGhlIHByaXplIG9ubHkgZXZlciBncm93cywgYW5kIHRoZSBwYWdlIHNob3dzIHdoZXJlIHRoZQpncm93dGggY2FtZSBmcm9tLgAAAAAAAAdkZXBvc2l0AAAAAAIAAAAAAAAABGZyb20AAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD" ]),
      options
    )
  }
  public readonly fromJSON = {
    pay: this.txFromJSON<Result<void>>,
        core: this.txFromJSON<Result<string>>,
        asset: this.txFromJSON<Result<string>>,
        create: this.txFromJSON<Result<void>>,
        balance: this.txFromJSON<i128>,
        deposit: this.txFromJSON<Result<void>>
  }
}