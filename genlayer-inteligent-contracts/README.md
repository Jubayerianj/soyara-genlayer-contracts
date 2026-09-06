# FlipSwap DEX — GenLayer Intelligent Contracts

AI-validated execution layer for the FlipSwap DEX aggregator, deployed on the **GenLayer Bradbury Testnet**.

---

## 🚀 Deployed Contracts (Bradbury Testnet)

export const CONTRACT_ADDRESSES = {
  4221: {
    factory: "0x4680BCe1632824d30D2F53656dD610736c3e312e",
    router: "0xF456737D17C2Bbb348fd4F7D1b000D62A46FB3b5",
    weth: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    wgen: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    WGEN: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    wrappedNative: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    WETH: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    aggregatorRouter: '0xafCAD2bf0E85e30a2b54ac6491dC81987cE7767C',
    aggregatorEntrypoint: '0x95feE6Cb918Ed9C621E36082EE8D998873031EaA',
    dexFeeVault: '0x48234eD645676b794a4CbC7483513e58cB04e22E',
    // SoyaraDex V3
    v3Factory: "0xBd959038300aF0C8dd1873E497d6D0a565b4E246",
    v3Router: "0xdf69970B2fE416339187aA41D39882e864984CE9",
    v3NftDescriptor: "0xef334fcAA42A17CF8f76627408Ee0cE91eBaE6E4",
    v3NftPositionDescriptor: "0xbC5a5E695a70208Bd18B742C6731C749F1748795",
    v3PositionManager: "0x779380011B5F2aB40985D810B5c7641539beD870",
    v3Migrator: "0xa338b743Ec494ebB8345f4B6F27ffC902b7EF5Aa",
    v3Quoter: "0xca4914407868bc37ccbE324cA149DD475d39A2Bf",
    v3TickLens: "0xCa4c7EdB398684cB4C5B3fD0cc6ced30b5a5f4d3",
    multicall: "0x6d1503E294b122Eb6B37ECe9c74d24D83f8B478b",
    // GenLayer Intelligent Contracts
    // AgentValidator redeployed 2026-09-04: fixed stale router whitelist (was blocking
    // every real proposal after AGGFlowEntrypoint/AGGFlowRouter were redeployed) and
    // removed non-deterministic time.time() usage. See DEPLOYMENTS.md.
    agentValidator: "0x7ABa94668afC24463Be323f9bB65BD4b4F480d89",
    liquidityValidator: "0xEFb9473B5269A79d72Df4b6E73E310791a185eeC",
    // AgentExecutor - deployed 2026-09-04 on GenLayer Bradbury Testnet (chain 4221)
    // Tx: broadcast/deployGenlayer.sol/4221/run-latest.json
    // Deployer/Agent: 0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2
    agentExecutor: "0xa835c0a86dD64726eF23D83a8ca7D60b542EE2e4",
  }
};

export const INTELLIGENT_CONTRACTS = {
  agentValidator: "0x7ABa94668afC24463Be323f9bB65BD4b4F480d89",
  liquidityValidator: "0xEFb9473B5269A79d72Df4b6E73E310791a185eeC"
};

- **Network:** GenLayer Bradbury Testnet (chainId: `4221`)
- **RPC:** `https://rpc-bradbury.genlayer.com`
- **Explorer:** `https://explorer-bradbury.genlayer.com`
- **Deployer / Owner:** `0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2`
- **Updated & Active:** 2026-09-04

> **2026-09-04 redeploy:** the previous AgentValidator (`0xFc77C6A2...`) had a stale
> `APPROVED_ROUTERS` whitelist left over from before `AGGFlowEntrypoint`/`AGGFlowRouter`
> were redeployed, so every real proposal submitted by the frontend (which always sends
> the current `aggregatorEntrypoint` address) was rejected at the deterministic
> router-whitelist check before it ever reached execution. It also read `time.time()`
> to check deadline expiry, which is non-deterministic across GenVM validator nodes.
> Both are fixed in this version; deadline expiry is now enforced only on-chain by
> `AgentExecutor`'s `validDeadline` modifier.

---

## 📐 Architecture

```
User → Gemini AI Agent
            ↓
     AgentValidator (GenLayer IC)          ← validates SWAP proposals
     LiquidityValidator (GenLayer IC)      ← validates ADD/REMOVE liquidity
            ↓ approved
     AgentExecutor.sol (EVM)
            ↓
     AGGFlowEntrypoint → V2/V3 Pools
```

### How It Works

GenLayer Intelligent Contracts (ICs) run on the **GenVM** — a sandboxed Python runtime with access to LLMs. They use **Optimistic Democracy** consensus: multiple validator nodes execute the contract independently and reach agreement on the result.

For this DEX:
1. **Phase 1 — Deterministic rules** (token whitelist, router whitelist, slippage cap, amount sanity) run identically on every node.
2. **Phase 2 — LLM coherence check** (`gl.exec_prompt`) asks the LLM to verify numeric coherence. Wrapped in `gl.eq_principle_strict_eq` so nodes must agree on the parsed boolean result.

---

## 📄 Contracts

### `AgentValidator.py`
Validates AI-generated swap/liquidity execution proposals.

**Key method:**
```python
validate_proposal(
    action,         # "SWAP" | "ADD_LIQUIDITY" | "REMOVE_LIQUIDITY"
    token_in,       # ERC-20 address or 0x000...0 for native
    token_out,      # ERC-20 address
    amount_in,      # raw units as string
    min_amount_out, # raw units as string
    slippage_bps,   # e.g. 30 = 0.30%
    router,         # approved router address
    deadline,       # unix timestamp
    extra_data,     # compact JSON metadata
) -> {"approved": bool, "reason": str, "proposal_id": str}
```

**Security model:**
- Only approved tokens (whitelist) are accepted
- Only approved routers (AGGFlowEntrypoint, V2/V3 routers) are accepted
- Hard slippage cap: **3% (300 bps)** — adjustable by owner
- LLM prompt contains **zero user free-text** — only structured numeric fields
- Emergency pause by owner

### `LiquidityValidator.py`
Specialized validator for V2 and V3 liquidity operations.

**Methods:**
- `validate_add_liquidity_v2(...)` — V2 add liquidity
- `validate_remove_liquidity_v2(...)` — V2 remove liquidity
- `validate_add_liquidity_v3(...)` — V3 mint position (checks fee tier + tick range)
- `validate_remove_liquidity_v3(...)` — V3 decrease liquidity

---

## 🛠 CLI Usage

### Read contract state
```bash
genlayer call 0x2CA6e67846a9B30E1E175Ee4D1bd8b90f4c12C6e get_stats
genlayer call 0x2CA6e67846a9B30E1E175Ee4D1bd8b90f4c12C6e get_config
genlayer call 0xEFb9473B5269A79d72Df4b6E73E310791a185eeC get_stats
```

### Update max slippage
```bash
genlayer write 0x2CA6e67846a9B30E1E175Ee4D1bd8b90f4c12C6e set_max_slippage \
  --args 200
```

### Emergency pause
```bash
genlayer write 0x2CA6e67846a9B30E1E175Ee4D1bd8b90f4c12C6e set_paused \
  --args true
```

---

## ⏭ Next Steps

1. **Integrate** `validate_proposal` calls into the Gemini agent tool pipeline
2. **Update token addresses** — fill in real addresses for ZKUSDC, ZKUSDT, LETH, ZKBTC, etc. in both contracts
3. **Test** a live `validate_proposal` call end-to-end
