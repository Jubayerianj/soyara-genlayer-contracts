# SoyaraAgentDex on GenLayer Studio Next

Soyara's agent trading, judged and settled by one Intelligent Contract on
**GenLayer Studio Next** (Consensus v0.6, chain `61997`).

| | |
|---|---|
| **Contract** | `0x3b6Cf2C48297afCf50Bc3e843a9F335B8407f8D6` ([explorer](https://explorer-studio-dev.genlayer.com/address/0x3b6Cf2C48297afCf50Bc3e843a9F335B8407f8D6)) |
| RPC | `https://studio-dev.genlayer.com/api` (`studio-next.genlayer.com` is a browser alias of the same deployment) |
| Runner | `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng` (SDK v0.3.0) |
| Deploy tx | `0x73cb1c77b90503bda92a9713642e18449e9a09056727d03a3ccb98a462295333` |
| Owner (can only pause) | `0xb453fAb699009A46D637F7DcC03D0A634c33B169` |
| **Demo video** | [a five minute walkthrough of every feature](https://x.com/SoyaraXyz/status/2099880248217370821) |
| App | [app.soyara.xyz/ai?net=studio-next](https://app.soyara.xyz/ai?net=studio-next) (chat desk), [app.soyara.xyz/a2a/user?net=studio-next](https://app.soyara.xyz/a2a/user?net=studio-next) (seven-agent swarm) |

`deployment.json` is the full record, including the four pool anchor
transactions.

## Why this is a separate contract

On Bradbury, Soyara is two halves. `AgentValidator` decides, and the Solidity
`AgentExecutor` settles through V2/V3 pools on GenLayer Chain, accepting only
verdicts the IC delivers as external messages. **Studio Next has no EVM layer**,
so that design cannot run there. Measured on 2026-09-15:

- a plain EVM contract deployment is refused with `UnsupportedEvmDeployment`
- `eth_getCode` returns `0x`, even for the consensus contract
- an Intelligent Contract that calls an EVM contract through
  `@gl.evm.contract_interface` never finishes its round (it stays in
  `PROPOSING`), which is what the Studio docs say: EVM calls are not implemented
- the Bradbury runner `AgentValidator.py` pins (`py-genlayer:1jb45…`) is
  refused with `invalid_contract runner malformed`

So on Studio Next the contract that judges a trade is also the contract that
settles it. It holds the balances, the pools and the mandates.

## What it does

Four test tokens (USDC, USDT, ETH, WGEN), and four constant-product pools with a
0.3% fee. Each pool is tied to the live **Bradbury V2 pair for the same tokens**,
which is the market validators check it against:

| Pool | Bradbury market |
|---|---|
| USDC/USDT | `0x3A15C2f3DA5513fD0F962f733E76421AC6699bE6` |
| ETH/USDC | `0x54F992714EBd865a5D46C2c264ca1b79B6FC6400` |
| ETH/USDT | `0x2949D600527e70DB00f758B540A8404FBe043Ec2` |
| WGEN/USDC | `0x55A5ff46cFb55DcF05D236A0Fdde5a0c866B64Be` |

The same two rails AgentExecutor enforces on Bradbury:

| Method | Signed by | What consensus decides |
|---|---|---|
| `swap` | the user | Every validator reads the Bradbury pair's `getReserves()` over JSON-RPC and agrees when its own read is within 0.5% of the leader's. The trade settles only if the fill is within the user's slippage of that live price and no larger than 10% of that market. A pool that has drifted more than 1.5% from the market is re-anchored before pricing. |
| `issue_mandate` | the user, once | The live market, the per-trade cap against its depth (10% of the reserve), and, when the user gave an instruction, each validator's LLM checks that the caps are no looser than the user's own words. Only a boolean crosses `strict_eq`. The price at issue is recorded. |
| `swap_under_mandate` | the mandate's agent | Deterministic: budget left, per-trade cap, expiry, revocation, and a fill inside the mandate's price band. No web read and no LLM, so it settles in seconds. |

Every request writes a verdict, approved or refused, with the reason and the
market price it was checked against (`get_verdict(request_id)`). Balances only
change on an approved trade.

`anchor_pool` seeds a pool at the live Bradbury price, or moves it back to it;
anyone may call it, because the price is whatever validators read. The faucet
(`claim_test_tokens`) gives any address test balances once an hour.

`get_desk(user, limit)` returns pools, balances, mandates and recent trades in
one read. Studio Next allows 30 contract reads a minute per client (the
`standard` rate-limit bucket, which `eth_call` fee quotes share), so the app
refreshes with this single call.

### Runner notes

- `gl.vm.get_timestamp()` fails on this runner (`SystemError: 2: inval`). The
  transaction time comes from `gl.message.raw["datetime"]`.
- Storage dataclass fields mutated through `self.pools[pair]` persist.
- `gl.nondet.web.post` returns a response with `.status`, not `.status_code`.

## Fees

Consensus v0.6 takes a refundable deposit on every write. `profile.mjs`
simulates each method against the deployed contract and writes
`fee-profile.json`, which the app passes to `@genlayer/transaction-kit` (it is
used only on chain 61997; prices and caps are always read live).

## Run it

```bash
npm install
npm test          # offline: the contract against a stubbed GenVM (57 checks)
npm run deploy    # deploy, anchor the four pools, write deployment.json
npm run e2e       # both rails on Studio Next, including the refusals
npm run profile   # measure fees, write fee-profile.json
npm run verify    # deployed code == SoyaraAgentDex.py, pools within 2% of Bradbury
```

Keys live in `studio-next/.env` (gitignored), created on first run. Studio's
faucet funds them.

## Verified on Studio Next (2026-09-15)

`npm run e2e` against `0x3b6Cf2C4…f8D6`:

| Round | Outcome | Seconds | Tx |
|---|---|---|---|
| faucet, relayed by the agent | test balances credited | 10.7 | [`0xd507e1d5…`](https://explorer-studio-dev.genlayer.com/tx/0xd507e1d5f8f4b5fa7580a54ede7819531563bf2cfc64f03a81155d299c045225) |
| consensus swap 25 USDC to USDT | settled, 0.30% under the live Bradbury price | 10.9 | [`0x865be738…`](https://explorer-studio-dev.genlayer.com/tx/0x865be7389f89c1164274f101a94640de4439d87bfcca60425cabe94374441a5c) |
| consensus swap over 10% of the ETH market | refused: too large for the live market | 14.0 | [`0x3601a94a…`](https://explorer-studio-dev.genlayer.com/tx/0x3601a94af3600de84d03d58ebb9f8d17f6f10269d1b3b99c79ce993f99c5465a) |
| issue mandate, with the user's words | approved by market read and LLM | 18.6 | [`0x302158f1…`](https://explorer-studio-dev.genlayer.com/tx/0x302158f1e40bd510ff7b990cbc4b928efd7cd84f9fa715331a572696ef8379cc) |
| agent swap 20 USDC under the mandate | settled | 7.6 | [`0xece61d4a…`](https://explorer-studio-dev.genlayer.com/tx/0xece61d4a9aa3d49ac2d1ad5f3f0dbc9339186b5815f2f3ab02529626caf17fda) |
| agent swap 21 USDC | refused: over the per-trade cap | 6.8 | [`0x1916fd2c…`](https://explorer-studio-dev.genlayer.com/tx/0x1916fd2ca4c8b870e11ce9869a81e1fea58b2978ebc14fc70a8176fd63941b0d) |
| user revokes, agent tries again | refused: revoked | 6.9 | [`0xca592a8a…`](https://explorer-studio-dev.genlayer.com/tx/0xca592a8aa3e8e863a94f847cabdccbd5f849d546497cca83ed74e8f3747881c8) |
| mandate whose cap is looser than the words | refused by the validators' LLMs | 17.3 | [`0x4cbf515f…`](https://explorer-studio-dev.genlayer.com/tx/0x4cbf515f655a9eb626e8480e7c3821797c9ad907a16bc1d33458c5f2a078e8d4) |

The app's own code path (`scripts/studio-next-e2e.mjs --live` in the product
repository) and a headless browser run of `/ai?net=studio-next` passed against
the same contract.

## Retired

| Address | Why |
|---|---|
| `0xf7DA1Bde8af830aDCfBecf922097Ee0F6b09b4E2` | no `get_desk`; the page's four reads per refresh ran into the rate limit |
| `0xEf3ED991197eFE7c7904A23D54f38Eb1105Db082` | used `gl.vm.get_timestamp()`, which fails on this runner; its pools never seeded |

Studio Next is a release-candidate environment and may be reset. If it is,
`npm run deploy` recreates the contract and its pools, and the app takes the new
address from `constants/studioNext.js` or `NEXT_PUBLIC_STUDIO_NEXT_DEX`.
