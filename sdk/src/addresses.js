// src/addresses.js
//
// Deployed Soyara contracts on GenLayer Bradbury (chain 4221).
// Kept in the SDK so the package has no dependency on the app.

export const CHAIN_ID = 4221;
export const RPC_URL = 'https://rpc-bradbury.genlayer.com';
export const EXPLORER_URL = 'https://explorer-bradbury.genlayer.com';

export const CONTRACT_ADDRESSES = {
  4221: {
    // Aggregation
    aggregatorEntrypoint: '0x95feE6Cb918Ed9C621E36082EE8D998873031EaA',
    aggregatorRouter:     '0xafCAD2bf0E85e30a2b54ac6491dC81987cE7767C',
    // Settlement gate. The executor itself authenticates the GenLayer verdict:
    // `recordVerdict` is callable only by the AgentValidator IC over its ghost
    // contract, and the commitment it authorises is re-derived by the contract
    // from the whole order, so route, fee, fee collector, recipient, quote,
    // deadline and nonce are all inside it.
    //
    // The address here was `0xa835c0a8...` until 2026-09-07, which is the
    // PRE-ENFORCEMENT executor: it has no `genLayerValidator` and no
    // `attestorThreshold` at all. Anything built against it settles on the old
    // architecture where a privileged agent key, not the contract, enforced the
    // verdict. test/addresses.mjs now checks this against the live chain.
    agentExecutor:        '0x0F1E98571BADd0fF59a34140Fe1e820DaDF907E1',
    // V2
    factory:              '0x4680BCe1632824d30D2F53656dD610736c3e312e',
    router:               '0xF456737D17C2Bbb348fd4F7D1b000D62A46FB3b5',
    // V3
    v3Factory:            '0xBd959038300aF0C8dd1873E497d6D0a565b4E246',
    v3Router:             '0xdf69970B2fE416339187aA41D39882e864984CE9',
    v3Quoter:             '0xca4914407868bc37ccbE324cA149DD475d39A2Bf',
    v3PositionManager:    '0x779380011B5F2aB40985D810B5c7641539beD870',
    // Tokens
    wgen:                 '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e',
    usdc:                 '0x58B6CD7891cd0A682226E25607b958a6479195A6',
    usdt:                 '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc',
    wbtc:                 '0x723534bc6C2B536fF5D0455111513A9431c44e25',
    eth:                  '0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C',
    fswp:                 '0xA2eC9aAf2235C66491767e69eBBD885469697B3E',
  },
};

/** GenLayer Intelligent Contracts. */
// The AgentValidator and the AgentExecutor are a matched pair and must be
// updated together: the IC holds the executor's address, and the executor
// accepts `recordVerdict` only from this IC. The LiquidityValidator authorises
// nothing on the swap path.
export const INTELLIGENT_CONTRACTS = {
  agentValidator:     '0xf47492A969b2bC8f99B62Bdf8958541F2234C42b',
  liquidityValidator: '0xEFb9473B5269A79d72Df4b6E73E310791a185eeC',
};

/** Every token symbol the parser and router understand. */
export const TOKENS = {
  GEN:  { symbol: 'GEN',  address: '0x0000000000000000000000000000000000000000', decimals: 18, isNative: true },
  WGEN: { symbol: 'WGEN', address: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e', decimals: 18 },
  USDC: { symbol: 'USDC', address: '0x58B6CD7891cd0A682226E25607b958a6479195A6', decimals: 18 },
  USDT: { symbol: 'USDT', address: '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc', decimals: 18 },
  WBTC: { symbol: 'WBTC', address: '0x723534bc6C2B536fF5D0455111513A9431c44e25', decimals: 18 },
  ETH:  { symbol: 'ETH',  address: '0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C', decimals: 18 },
  FSWP: { symbol: 'FSWP', address: '0xA2eC9aAf2235C66491767e69eBBD885469697B3E', decimals: 18 },
};

export function tokenBySymbol(symbol) {
  return TOKENS[String(symbol || '').toUpperCase()] || null;
}
