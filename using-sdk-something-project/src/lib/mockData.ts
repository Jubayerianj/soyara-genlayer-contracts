import { IntentOrder } from '@/types/order';

export const INITIAL_ORDERS: IntentOrder[] = [
  {
    id: 'order-sample-1',
    createdAt: Date.now() - 1000 * 60 * 15,
    userPrompt: 'Buy 50 USDT of WBTC when 1 WBTC drops below 2500 USDT',
    type: 'LIMIT_BUY',
    tokenIn: 'USDT',
    tokenOut: 'WBTC',
    amountIn: 50,
    condition: {
      operator: 'LTE',
      targetRate: 2500,
      conditionDescription: 'Execute when 1 WBTC ≤ 2,500.00 USDT',
    },
    slippageBps: 100,
    status: 'PENDING',
  },
  {
    id: 'order-sample-2',
    createdAt: Date.now() - 1000 * 60 * 45,
    userPrompt: 'Swap 25 USDC to USDT when 1 USDC >= 1.001 USDT',
    type: 'LIMIT_SELL',
    tokenIn: 'USDC',
    tokenOut: 'USDT',
    amountIn: 25,
    condition: {
      operator: 'GTE',
      targetRate: 1.001,
      conditionDescription: 'Execute when 1 USDT ≥ 1.0010 USDC',
    },
    slippageBps: 50,
    status: 'PENDING',
  },
  {
    id: 'order-sample-3',
    createdAt: Date.now() - 1000 * 60 * 90,
    userPrompt: 'Take profit: swap 10 FSWP to USDC when 1 FSWP reaches 15.0 USDC',
    type: 'TAKE_PROFIT',
    tokenIn: 'FSWP',
    tokenOut: 'USDC',
    amountIn: 10,
    condition: {
      operator: 'GTE',
      targetRate: 15.0,
      conditionDescription: 'Execute when 1 USDC ≥ 15.0000 FSWP',
    },
    slippageBps: 150,
    status: 'PENDING',
  },
];
