# FlowFuelRefuelVault

This is a small, non-upgradeable contract for the FlowFuel autonomous
refueling proof. It holds only USDG deposits made by clients and can call only
the configured Orbio Exchange from its `refuel` path.

The contract is unaudited. Do not deposit funds you cannot afford to lose.
There is no administrator, upgrade path, emergency sweep, or keeper withdrawal
function. The keeper can call `refuel(client)` only when that client's policy
authorizes it. The contract derives the Orbio beneficiary from `client` and
never accepts a beneficiary argument from the keeper.

Financial rules enforced by the contract:

- each client has a separate USDG reserve;
- the client can withdraw its own unused reserve;
- the client chooses the executor, refill amount, weekly cap, and max slippage;
- weekly usage uses `block.timestamp / 1 weeks` UTC buckets;
- the maximum configured refill must fit inside the current weekly cap;
- `MAX_FILLS` is read from the live Exchange contract;
- the exchange allowance is exact for one call and cleared afterward;
- reserve and weekly usage are deducted by the actual USDG balance delta. The
  live Exchange can pull the full `usdgIn` input while its returned
  `usdgSpent` field reports only the matched order amount, so the vault does
  not trust that field for client accounting.

The Orbio inference-balance threshold is evaluated offchain from the live
gateway. The vault has no oracle and does not claim to enforce that threshold.
