# ⚡ Soyara / FlipSwap DEX — GenLayer Intelligent DeFi Monorepo

<div align="center">

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636.svg)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg)
![GenLayer](https://img.shields.io/badge/GenLayer-Bradbury%20Testnet-00F0FF.svg)
![Next.js](https://img.shields.io/badge/Next.js-14%2B-black.svg)

**Next-generation decentralized exchange and routing aggregator powered by GenLayer Intelligent Contracts and EVM liquidity protocols.**

[Architecture](#-architecture) • [Packages](#-monorepo-structure) • [Intelligent Contracts](#-genlayer-intelligent-contracts) • [Deployments](#-deployments) • [Getting Started](#-getting-started) • [Contributing](#-contributing)

</div>

---

## 📖 Overview

**Soyara DEX** (FlipSwap) combines automated market maker (AMM) liquidity models with **GenLayer Intelligent Contracts (ICs)**. By introducing AI validator consensus into the execution pipeline, the protocol ensures that execution proposals undergo deterministic and AI-powered safety verification before settlement on-chain.

### Key Highlights
- **GenLayer AI Consensus**: Python-based Intelligent Contracts running on GenVM evaluate execution intents using Optimistic Democracy consensus.
- **Hybrid Security Pipeline**: Two-stage validation combining deterministic constraints (slippage caps, whitelist controls, zero-calldata guarantees) with consensus-backed logic verification.
- **Multi-AMM Aggregator**: Built-in AGGFlow router providing optimized trade routes across SoyaraDex V2 and V3 liquidity pools.
- **Modern Full-Stack Experience**: High-performance Next.js application with Wagmi, Viem, RainbowKit, live indexing, and real-time swap analytics.

---

## 📐 Architecture

```
                               ┌───────────────────────────┐
                               │     User / Web3 Client    │
                               └─────────────┬─────────────┘
                                             │
                                             ▼
                               ┌───────────────────────────┐
                               │      Next.js DEX App      │
                               └─────────────┬─────────────┘
                                             │
                         ┌───────────────────┴───────────────────┐
                         │                                       │
                         ▼                                       ▼
        ┌─────────────────────────────────┐   ┌─────────────────────────────────┐
        │       GenLayer Testnet          │   │        EVM Execution Layer      │
        │                                 │   │                                 │
        │   ┌─────────────────────────┐   │   │   ┌─────────────────────────┐   │
        │   │     AgentValidator      │   │   │   │    AgentExecutor.sol    │   │
        │   │ (Deterministic + AI-IC) │   │   │   │   (On-Chain Enforcer)   │   │
        │   └────────────┬────────────┘   │   │   └────────────┬────────────┘   │
        │                │                │   │                │                │
        │   ┌────────────▼────────────┐   │   │   ┌────────────▼────────────┐   │
        │   │   LiquidityValidator    │   │   │   │    AGGFlowEntrypoint    │   │
        │   │   (V2 & V3 Operations)  │   │   │   │    (Aggregator Engine)  │   │
        │   └─────────────────────────┘   │   │   └────────────┬────────────┘   │
        └─────────────────────────────────┘   └────────────────┼────────────────┘
                                                               │
                                           ┌───────────────────┴───────────────────┐
                                           │                                       │
                                           ▼                                       ▼
                               ┌───────────────────────┐               ┌───────────────────────┐
                               │   SoyaraDex V2 Pools    │               │   SoyaraDex V3 Pools    │
                               └───────────────────────┘               └───────────────────────┘
```

---

## 📁 Monorepo Structure

```
.
├── Dex Solidity contracts/
│   ├── aggregator/                     # Foundry project for AGGFlow router & entrypoint
│   ├── v2 dex contracts/
│   │   ├── v2-core-master/             # SoyaraDex V2 Factory & ERC20 Pair contracts
│   │   └── v2-periphery-master/        # SoyaraDex V2 Router & Library contracts
│   └── v3 dex contracts/
│       ├── v3-core-main/               # SoyaraDex V3 Factory & Pool contracts
│       └── v3-periphery-main/          # SoyaraDex V3 Position Manager & SwapRouter
│
├── genlayer-inteligent-contracts/
│   ├── AgentValidator.py               # GenLayer Intelligent Contract for swap proposals
│   ├── LiquidityValidator.py           # GenLayer Intelligent Contract for LP operations
│   ├── AgentExecutor.sol               # On-chain Solidity bridge & execution guard
│   └── execution-rules.json            # Whitelists, slippage thresholds & parameter specs
│
├── frontend/
│   └── flipswap/                       # Main DEX trading frontend (Next.js + Wagmi + Tailwind)
│       ├── components/                 # UI components and swap widgets
│       ├── server-indexer/             # Standalone event indexing service
│       └── points-deployment/          # Contributor rewards & NFT points contracts
│
├── soyara website/                     # Official Soyara ecosystem landing page (Next.js)
│
├── DEPLOYMENTS.md                      # Network contract addresses & registry
├── CONTRIBUTING.md                     # Open-source contribution guidelines
└── LICENSE                             # MIT License
```

---

## 🧠 GenLayer Intelligent Contracts

GenLayer Intelligent Contracts execute in a Python runtime on the **GenVM**. Multiple validator nodes independently execute contract methods and reach consensus via **Optimistic Democracy**.

### 1. `AgentValidator.py`
Validates proposal metadata before executing trades:
- **Whitelisted Assets**: Validates `tokenIn` and `tokenOut` against approved token contracts.
- **Approved Routers**: Restricts execution destinations to registered aggregator and router addresses.
- **Slippage Bounds**: Enforces maximum basis point thresholds (`MAX_SLIPPAGE_BPS = 300` / 3%).
- **Equivalence Principle Consensus**: Uses `gl.eq_principle.strict_eq` to guarantee validator agreement on numeric coherence.

### 2. `LiquidityValidator.py`
Validates automated liquidity management:
- **SoyaraDex V2**: Verifies ratio bounds and non-zero liquidity amounts.
- **SoyaraDex V3**: Validates fee tiers (`500`, `3000`, `10000`), price tick constraints (`tickLower < tickUpper`), and range boundaries (`[-887272, 887272]`).

### 3. `AgentExecutor.sol`
The EVM gatekeeper that accepts validated intents and calls liquidity routers:
- Checks authorization modifiers and reentrancy protections.
- Pulls user-approved tokens and forwards them directly to the settlement router.
- Directs output tokens directly to the user's wallet address.

---

## 🚀 Deployed Addresses

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
*For complete deployment details and token whitelists, refer to [DEPLOYMENTS.md](./DEPLOYMENTS.md).*

---

## 🛠 Getting Started

### Prerequisites
- Node.js `>= 18.0.0`
- Foundry (`forge`, `cast`)
- Python `>= 3.11`
- GenLayer CLI (`pip install genlayer` or official installer)

### 1. Setting Up the Frontend
```bash
cd frontend/flipswap
cp .env.example .env.local
npm install
npm run dev
```

### 2. Building EVM Contracts (Foundry / Hardhat)
```bash
# Aggregator Contracts
cd "Dex Solidity contracts/aggregator"
forge build

# SoyaraDex V2 Core
cd "../v2 dex contracts/v2-core-master"
npm install
npx hardhat compile
```

### 3. Interacting with GenLayer Intelligent Contracts
```bash
# Inspect contract stats on Bradbury testnet
genlayer call 0x2CA6e67846a9B30E1E175Ee4D1bd8b90f4c12C6e get_stats --rpc https://rpc-bradbury.genlayer.com
```

---

## 🔒 Security & Verification

- **Prompt Injection Defense**: Intelligent Contract prompts operate strictly on typed numeric fields and enumerated parameters. Arbitrary user free-text is never passed to validator prompts.
- **Emergency Circuit Breaker**: Contracts implement owner-level emergency pauses (`setPaused(true)`).
- **Non-Custodial Flow**: Funds are routed directly between the user and verified liquidity pool contracts.

---

## 🤝 Contributing

Contributions from the community are welcome! Please review [CONTRIBUTING.md](./CONTRIBUTING.md) for pull request conventions and code formatting guidelines.

---

## 📄 License

This repository is licensed under the [MIT License](./LICENSE).
# soyaraongenlayer
