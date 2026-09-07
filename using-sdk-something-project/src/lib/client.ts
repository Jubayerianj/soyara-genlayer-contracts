import { createPublicClient, http, formatUnits, parseUnits } from 'viem';
import { TOKENS, CONTRACT_ADDRESSES, CHAIN_ID, RPC_URL, EXPLORER_URL, INTELLIGENT_CONTRACTS } from '@soyaradex/sdk';

export { TOKENS, CONTRACT_ADDRESSES, CHAIN_ID, RPC_URL, EXPLORER_URL, INTELLIGENT_CONTRACTS };

export const genLayerBradbury = {
  id: CHAIN_ID,
  name: 'GenLayer Bradbury Testnet',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'GenLayer Explorer', url: EXPLORER_URL },
  },
};

let publicClientInstance: ReturnType<typeof createPublicClient> | null = null;

export function getPublicClient() {
  if (!publicClientInstance) {
    publicClientInstance = createPublicClient({
      chain: genLayerBradbury,
      transport: http(RPC_URL),
    });
  }
  return publicClientInstance;
}

export function formatTokenAmount(amount: bigint | string | number, decimals: number = 18, maxDecimals: number = 4): string {
  try {
    const str = typeof amount === 'bigint' ? formatUnits(amount, decimals) : String(amount);
    const num = parseFloat(str);
    if (isNaN(num)) return '0';
    if (num === 0) return '0';
    if (num < 0.0001) return '<0.0001';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    });
  } catch {
    return '0';
  }
}

export function formatPriceRate(rate: number): string {
  if (rate >= 1000) {
    return rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } else if (rate >= 1) {
    return rate.toFixed(4);
  } else {
    return rate.toFixed(6);
  }
}
