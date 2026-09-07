export type OrderType = 'LIMIT_BUY' | 'LIMIT_SELL' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'PRICE_TRIGGER';

export type OrderStatus = 'PENDING' | 'EVALUATING' | 'TRIGGERED' | 'VALIDATING' | 'EXECUTED' | 'FAILED' | 'CANCELLED';

export interface ConditionConfig {
  operator: 'GTE' | 'LTE' | 'EQ'; // GTE: >=, LTE: <=
  targetRate: number; // e.g. 2000 (USDT per WBTC)
  conditionDescription: string;
}

export interface IntentOrder {
  id: string;
  createdAt: number;
  userPrompt: string;
  type: OrderType;
  tokenIn: string; // symbol, e.g. 'USDT'
  tokenOut: string; // symbol, e.g. 'WBTC'
  amountIn: number;
  expectedMinOut?: number;
  condition: ConditionConfig;
  slippageBps: number;
  status: OrderStatus;
  currentRate?: number;
  bestRoute?: {
    dex: string;
    isMultiHop: boolean;
    hopsSummary: string;
    amountOutFormatted: string;
    priceImpactPct: number;
  };
  validationStatus?: {
    phase: string;
    approved: boolean;
    proposalId?: string;
    txHash?: string;
  };
  executionReceipt?: {
    txHash: string;
    timestamp: number;
    amountOut: string;
  };
  error?: string;
  expiresAt?: number;
}

export interface KeeperLog {
  id: string;
  timestamp: number;
  level: 'info' | 'success' | 'warn' | 'error' | 'pulse';
  orderId?: string;
  message: string;
  details?: Record<string, any>;
}
