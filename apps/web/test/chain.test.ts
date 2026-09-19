import { describe, expect, it } from "vitest";
import {
  ACTIVATION_EVENT_SIGNATURE,
  CREDIT_CONTRACT_ADDRESS,
  EXCHANGE_CONTRACT_ADDRESS,
  USDG_CONTRACT_ADDRESS,
  beneficiaryBytes32,
} from "@flowfuel/core";
import { verifyActivationReceipt } from "../src/lib/chain";

const WALLET = "0x9f758be3ae3D985713964339E2f0bD783fC6015c";
const OTHER = "0x78A4e72C413B1A91A25D253988BB61258d9C8c2F";
const TX = `0x${"ab".repeat(32)}`;

function pad32(value: bigint | number): string {
  return value.toString(16).padStart(64, "0");
}

function topicAddress(address: string): string {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

function activationLog(from: string, beneficiary: string, activationId = 7, amount = 950000n) {
  return {
    address: CREDIT_CONTRACT_ADDRESS,
    topics: [
      ACTIVATION_EVENT_SIGNATURE,
      `0x${pad32(activationId)}`,
      topicAddress(from),
      `0x${"0".repeat(24)}${beneficiary.slice(2).toLowerCase()}`,
    ],
    data: `0x${pad32(amount)}`,
  };
}

function receipt(overrides: Partial<Parameters<typeof verifyActivationReceipt>[0]> = {}) {
  return {
    status: "success",
    to: CREDIT_CONTRACT_ADDRESS,
    from: WALLET,
    logs: [activationLog(WALLET, WALLET)],
    blockNumber: 123n,
    ...overrides,
  };
}

describe("beneficiaryBytes32", () => {
  it("left-pads the address into a bytes32", () => {
    expect(beneficiaryBytes32(WALLET)).toBe(
      `0x${"0".repeat(24)}${WALLET.slice(2).toLowerCase()}`,
    );
  });
});

describe("verifyActivationReceipt", () => {
  it("accepts a direct activate() call to the CREDIT contract", () => {
    const verified = verifyActivationReceipt(receipt(), WALLET, TX);
    expect(verified.activationId).toBe(7);
    expect(verified.amountUnits).toBe(950000n);
    expect(verified.blockNumber).toBe(123);
  });

  it("accepts an Exchange-targeted buyAndActivate carrying the CREDIT Activated event", () => {
    // On chain, buyAndActivate emits from=exchange and beneficiary=wallet.
    const verified = verifyActivationReceipt(
      receipt({
        to: EXCHANGE_CONTRACT_ADDRESS,
        logs: [activationLog(EXCHANGE_CONTRACT_ADDRESS, WALLET)],
      }),
      WALLET,
      TX,
    );
    expect(verified.activationId).toBe(7);
  });

  it("rejects an Exchange-targeted activation crediting a different beneficiary", () => {
    expect(() =>
      verifyActivationReceipt(
        receipt({
          to: EXCHANGE_CONTRACT_ADDRESS,
          logs: [activationLog(EXCHANGE_CONTRACT_ADDRESS, OTHER)],
        }),
        WALLET,
        TX,
      ),
    ).toThrowError(/No Activation event/);
  });

  it("rejects a transaction to an unrelated contract", () => {
    expect(() =>
      verifyActivationReceipt(receipt({ to: USDG_CONTRACT_ADDRESS }), WALLET, TX),
    ).toThrowError(/CREDIT or Exchange/);
  });

  it("rejects a missing target", () => {
    expect(() =>
      verifyActivationReceipt(receipt({ to: null }), WALLET, TX),
    ).toThrowError(/CREDIT or Exchange/);
  });

  it("rejects a reverted transaction", () => {
    expect(() =>
      verifyActivationReceipt(receipt({ status: "reverted" }), WALLET, TX),
    ).toThrowError(/reverted/);
  });

  it("rejects when the sender is not the client's wallet", () => {
    expect(() =>
      verifyActivationReceipt(receipt({ from: OTHER }), WALLET, TX),
    ).toThrowError(/not sent by this client's wallet/);
  });

  it("rejects when the Activated event credits a different beneficiary", () => {
    expect(() =>
      verifyActivationReceipt(
        receipt({ logs: [activationLog(WALLET, OTHER)] }),
        WALLET,
        TX,
      ),
    ).toThrowError(/No Activation event/);
  });

  it("rejects an Exchange transaction with no Activation event", () => {
    expect(() =>
      verifyActivationReceipt(
        receipt({ to: EXCHANGE_CONTRACT_ADDRESS, logs: [] }),
        WALLET,
        TX,
      ),
    ).toThrowError(/No Activation event/);
  });

  it("ignores Activation-shaped logs emitted by other contracts", () => {
    const foreign = { ...activationLog(WALLET, WALLET), address: USDG_CONTRACT_ADDRESS };
    expect(() =>
      verifyActivationReceipt(receipt({ logs: [foreign] }), WALLET, TX),
    ).toThrowError(/No Activation event/);
  });
});
