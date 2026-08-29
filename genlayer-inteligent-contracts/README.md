# FlipSwap DEX — GenLayer Intelligent Contracts

AI-validated execution layer for the FlipSwap DEX aggregator, deployed on the **GenLayer Bradbury Testnet**.

---

## 🚀 Deployed Contracts (Bradbury Testnet)

| Contract | Address | Tx Hash |
|---|---|---|
| **AgentValidator** | `0xFc77C6A20B1102979f5887A5efe9611a2Ef6Afd5` | `0x80788d9ee015f11468f4e372ead51f0dd522fb70e62343e241bd23c7b3384dbf` |
| **LiquidityValidator** | `0xEFb9473B5269A79d72Df4b6E73E310791a185eeC` | `0x6029755fe523a1fcb2c87f20a3c9cc3fcc12f04f57b6db203a40b8c718fcdf23` |

- **Network:** GenLayer Bradbury Testnet (chainId: `4221`)
- **RPC:** `https://rpc-bradbury.genlayer.com`
- **Explorer:** `https://explorer-bradbury.genlayer.com`
- **Deployer / Owner:** `0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2`
- **Updated & Active:** 2026-08-25

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
genlayer call 0x5671E23b1f5b4f9e51Fc2F817066A202Ed86F200 get_stats
genlayer call 0x5671E23b1f5b4f9e51Fc2F817066A202Ed86F200 get_config
genlayer call 0x03a98b83f4C1Ef615614b178284368Ee2cA5A5a9 get_stats
```

### Update max slippage
```bash
genlayer write 0x5671E23b1f5b4f9e51Fc2F817066A202Ed86F200 set_max_slippage \
  --args 200
```

### Emergency pause
```bash
genlayer write 0x5671E23b1f5b4f9e51Fc2F817066A202Ed86F200 set_paused \
  --args true
```

---

## ⏭ Next Steps

1. **Integrate** `validate_proposal` calls into the Gemini agent tool pipeline
2. **Update token addresses** — fill in real addresses for ZKUSDC, ZKUSDT, LETH, ZKBTC, etc. in both contracts
3. **Test** a live `validate_proposal` call end-to-end
