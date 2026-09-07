import { parseIntent as sdkParseIntent, tokenBySymbol, TOKENS } from '@soyaradex/sdk';
import { IntentOrder, OrderType, ConditionConfig } from '@/types/order';

export interface ParsedConditionalIntent {
  intent: ReturnType<typeof sdkParseIntent>;
  orderType: OrderType;
  condition: ConditionConfig | null;
  needs: string[];
  isReady: boolean;
  summary: string;
}

/**
 * Parses natural language input with conditional triggers, limit prices,
 * stop-loss, and take-profit intent expressions.
 */
export function parseConditionalIntent(rawText: string): ParsedConditionalIntent {
  const text = rawText.toLowerCase().trim();
  const sdkIntent = sdkParseIntent(rawText);
  const needs = [...sdkIntent.needs];

  let orderType: OrderType = 'LIMIT_BUY';
  let operator: 'GTE' | 'LTE' | 'EQ' = 'LTE';
  let targetRate: number | null = null;
  let conditionDescription = '';

  // 1. Detect order type patterns
  const isStopLoss = /\b(?:stop loss|stop-loss|stoploss|below|drops below|falls below|lower than|<|<=)\b/i.test(text);
  const isTakeProfit = /\b(?:take profit|take-profit|takeprofit|profit at|rises above|exceeds|reaches|higher than|>|>=)\b/i.test(text);
  const isLimitSell = /\b(?:limit sell|sell limit|sell when|sell if)\b/i.test(text);
  const isLimitBuy = /\b(?:limit buy|buy limit|buy when|buy if)\b/i.test(text);

  if (isStopLoss) {
    orderType = 'STOP_LOSS';
    operator = 'LTE';
  } else if (isTakeProfit) {
    orderType = 'TAKE_PROFIT';
    operator = 'GTE';
  } else if (isLimitSell) {
    orderType = 'LIMIT_SELL';
    operator = 'GTE';
  } else if (isLimitBuy) {
    orderType = 'LIMIT_BUY';
    operator = 'LTE';
  } else {
    orderType = 'PRICE_TRIGGER';
    operator = 'LTE';
  }

  // 2. Detect conditional operator & target price
  // Matches expressions like:
  // "when price <= 2000"
  // "at 2000 usdt"
  // "below 1.05"
  // "rate >= 0.98"
  // "when 1 wbtc <= 2100 usdt"
  // "if 1 usdc >= 1.002 usdt"
  const conditionMatch = 
    text.match(/(?:when|if|at|price|rate|drops below|falls below|rises above|reaches|target)\s*(?:1\s*[a-z]+\s*)?(?:is\s*)?(<=|>=|<|>|=|==|below|above|at)?\s*(\$?\d+(?:\.\d+)?)/i);

  if (conditionMatch) {
    const rawOp = conditionMatch[1]?.toLowerCase() || '';
    const rawVal = conditionMatch[2]?.replace('$', '');
    if (rawVal) {
      targetRate = parseFloat(rawVal);
      if (rawOp.includes('>') || rawOp.includes('above') || rawOp.includes('rises') || rawOp.includes('reaches')) {
        operator = 'GTE';
      } else if (rawOp.includes('<') || rawOp.includes('below') || rawOp.includes('drops') || rawOp.includes('falls')) {
        operator = 'LTE';
      }
    }
  }

  // If target rate not extracted from specific regex, look at secondary number
  if (targetRate === null && sdkIntent.amountOut) {
    targetRate = sdkIntent.amountOut;
  }

  if (targetRate === null) {
    needs.push('target trigger price/rate (e.g. "when price <= 2000 USDT")');
  }

  if (targetRate !== null) {
    const opSymbol = operator === 'GTE' ? '≥' : operator === 'LTE' ? '≤' : '=';
    conditionDescription = `Execute when 1 ${sdkIntent.tokenOut || 'TOKEN'} ${opSymbol} ${targetRate} ${sdkIntent.tokenIn || 'PAY_TOKEN'}`;
  }

  const isReady = sdkIntent.confident && targetRate !== null && !isNaN(targetRate) && targetRate > 0;

  const summary = isReady
    ? `${orderType}: Swap ${sdkIntent.amountIn} ${sdkIntent.tokenIn} for ${sdkIntent.tokenOut} when rate ${operator === 'GTE' ? '≥' : '≤'} ${targetRate}`
    : 'Incomplete Intent: ' + needs.join(', ');

  return {
    intent: sdkIntent,
    orderType,
    condition: targetRate ? { operator, targetRate, conditionDescription } : null,
    needs,
    isReady,
    summary,
  };
}

/**
 * Creates a fully-structured IntentOrder from parsed parameters.
 */
export function createOrderFromIntent(
  parsed: ParsedConditionalIntent,
  userPrompt: string
): IntentOrder | null {
  if (!parsed.isReady || !parsed.condition || !parsed.intent.tokenIn || !parsed.intent.tokenOut || !parsed.intent.amountIn) {
    return null;
  }

  return {
    id: `order-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: Date.now(),
    userPrompt,
    type: parsed.orderType,
    tokenIn: parsed.intent.tokenIn,
    tokenOut: parsed.intent.tokenOut,
    amountIn: parsed.intent.amountIn,
    condition: parsed.condition,
    slippageBps: parsed.intent.slippageBps || 100,
    status: 'PENDING',
  };
}
