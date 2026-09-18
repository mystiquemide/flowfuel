import { describe, expect, it } from "vitest";
import {
  CREDIT_CONTRACT_ADDRESS,
  ORBIO_GATEWAY_BASE_URL,
  ROBINHOOD_CHAIN_ID,
  orbioKeyMessage,
} from "../src/index";

describe("core constants", () => {
  it("pins the Robinhood chain id", () => {
    expect(ROBINHOOD_CHAIN_ID).toBe(4663);
  });

  it("pins the CREDIT contract address", () => {
    expect(CREDIT_CONTRACT_ADDRESS).toBe(
      "0xe33322da1380e61e5ae5dfb21e7f62924c73004c",
    );
  });

  it("pins the Orbio gateway base url", () => {
    expect(ORBIO_GATEWAY_BASE_URL).toBe("https://www.orbio.so/api/v1");
  });
});

describe("orbioKeyMessage", () => {
  it("builds the wallet-signed authentication message", () => {
    expect(orbioKeyMessage(4663, 0)).toBe(
      "Orbio API key · chain 4663 · epoch 0",
    );
    expect(orbioKeyMessage(4663, 2)).toBe(
      "Orbio API key · chain 4663 · epoch 2",
    );
  });
});
