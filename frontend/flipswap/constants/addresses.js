// constants/addresses.js - GENLAYER ONLY

// Native token placeholder (for ETH/GEN)
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Contract addresses by chain ID (4221: GenLayer Testnet)
export const CONTRACT_ADDRESSES = {
  4221: {
    factory: "0x4680BCe1632824d30D2F53656dD610736c3e312e",
    router: "0xF456737D17C2Bbb348fd4F7D1b000D62A46FB3b5",
    weth: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    wgen: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    WGEN: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    wrappedNative: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    WETH: "0x315374AA9b5536037Cc1Efeea2439CCC0913A77e",
    aggregatorRouter: '0xDF474006aa807598B616500d146FfF661d644138',
    aggregatorEntrypoint: '0xfdf5cD6452EDC340e67cd16db6A9D74aaa4f81a3',
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
    agentValidator: "0xFc77C6A20B1102979f5887A5efe9611a2Ef6Afd5",
    liquidityValidator: "0xEFb9473B5269A79d72Df4b6E73E310791a185eeC"
  }
};

export const INTELLIGENT_CONTRACTS = {
  agentValidator: "0xFc77C6A20B1102979f5887A5efe9611a2Ef6Afd5",
  liquidityValidator: "0xEFb9473B5269A79d72Df4b6E73E310791a185eeC"
};

// Quick access to GenLayer addresses
export const GENLAYER_ADDRESSES = CONTRACT_ADDRESSES[4221];
export const GENLAYER_CONTRACTS = CONTRACT_ADDRESSES[4221];

// Backward-compatibility aliases
export const LitVM_ADDRESSES = CONTRACT_ADDRESSES[4221];
export const LitVM_CONTRACTS = CONTRACT_ADDRESSES[4221];

// Check if a chain is supported
export const isChainSupported = (chainId) => {
  if (!chainId) return true;
  return chainId.toString() === '4221';
};

// Helper function to get addresses for current chain (defaults to GenLayer 4221)
export const getContractAddresses = (chainId) => {
  return CONTRACT_ADDRESSES[4221];
};