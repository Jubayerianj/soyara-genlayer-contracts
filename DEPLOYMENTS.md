# 🌐 Soyara / FlipSwap DEX — Deployment Registry

This document lists all active smart contracts, Intelligent Contracts, and infrastructure endpoints deployed across supported networks.

---

## 1. GenLayer Bradbury Testnet (AI Consensus Layer)

| Parameter | Value |
|---|---|
| **Network Name** | GenLayer Bradbury Testnet |
| **Chain ID** | `4221` |
| **RPC Endpoint** | `https://rpc-bradbury.genlayer.com` |
| **Block Explorer** | `https://explorer-bradbury.genlayer.com` |
| **Deployer / Owner** | `0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2` |

### Intelligent Contracts (ICs)

| Contract | Address | Transaction Hash |
|---|---|---|
| **AgentValidator** | `0xFc77C6A20B1102979f5887A5efe9611a2Ef6Afd5` | `0x80788d9ee015f11468f4e372ead51f0dd522fb70e62343e241bd23c7b3384dbf` |
| **LiquidityValidator** | `0xEFb9473B5269A79d72Df4b6E73E310791a185eeC` | `0x6029755fe523a1fcb2c87f20a3c9cc3fcc12f04f57b6db203a40b8c718fcdf23` |

---

## 2. LitVM / Somnia EVM Execution Layer

| Parameter | Value |
|---|---|
| **Network Name** | LitVM / Somnia Forge |
| **Chain ID** | `4441` |
| **HTTP RPC** | `https://liteforge.rpc.caldera.xyz/infra-partner-http` |
| **WebSocket RPC** | `wss://liteforge.rpc.caldera.xyz/infra-partner-ws` |
| **Protocol Multisig / FeeTo** | `0x48234eD645676b794a4CbC7483513e58cB04e22E` |

### Core & Periphery Contracts

| Component | Contract | Address |
|---|---|---|
| **DEX V2 Factory** | `SwappingDexV2Factory` | `0x4680BCe1632824d30D2F53656dD610736c3e312e` |
| **DEX V2 Router** | `UniswapV2Router02` | `0x130c961dcf9d89258119f8bB7344635616946BFF` |
| **Wrapped Native** | `WETH / WSOMI` | `0x315374AA9b5536037Cc1Efeea2439CCC0913A77e` |
| **Aggregator Entrypoint** | `AGGFlowEntrypoint` | `0xF69E64804000d28aA695eB5c594B996100fb3B49` |
| **Aggregator Router** | `AGGFlowRouter` | `0x0624E93350bFfc5B3570589FCae68e2CaBe6c620` |
| **Rewards & NFTs** | `SuperContributorNFT` | `0xA2eC9aAf2235C66491767e69eBBD885469697B3E` |

### V2 Pair Init Code Hash
```
0x01888feb01db41d97ad6fb1883d7e286650d46c410b82338aeb4a37554c28bcd
```

---

## 3. Approved Whitelist Tokens

| Symbol | Name | Address | Decimals |
|---|---|---|---|
| `GEN` | Native GenLayer / Somnia | `0x0000000000000000000000000000000000000000` | 18 |
| `WGEN` / `WSOMI` | Wrapped Native | `0x315374AA9b5536037Cc1Efeea2439CCC0913A77e` | 18 |
| `USDC` / `ZKUSDC` | USD Coin | `0x58B6CD7891cd0A682226E25607b958a6479195A6` | 6 |
| `USDT` / `ZKUSDT` | Tether USD | `0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc` | 6 |
| `WBTC` / `ZKBTC` | Wrapped Bitcoin | `0x723534bc6C2B536fF5D0455111513A9431c44e25` | 8 |
| `ETH` / `LETH` | Wrapped Ethereum | `0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C` | 18 |
| `FSWP` | FlipSwap Token / NFT | `0xA2eC9aAf2235C66491767e69eBBD885469697B3E` | 18 |
