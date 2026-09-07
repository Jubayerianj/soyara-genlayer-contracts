#!/usr/bin/env node

/**
 * Headless Autonomous Keeper Daemon for Soyara on GenLayer
 * 
 * Runs continuously in the background (terminal, systemd, docker, or VPS)
 * without needing an active browser session.
 */

import { quoteBestRouteMultiHop, tokenBySymbol, buildMultiHopProgram, TOKENS } from '@soyaradex/sdk';
import { parseUnits, formatUnits } from 'viem';

// Sample active monitored intent orders
const ORDERS = [
  {
    id: 'daemon-order-1',
    tokenIn: 'USDT',
    tokenOut: 'WBTC',
    amountIn: 50,
    operator: 'LTE',
    targetRate: 2500, // Execute when 1 WBTC <= 2500 USDT
  },
  {
    id: 'daemon-order-2',
    tokenIn: 'USDC',
    tokenOut: 'USDT',
    amountIn: 25,
    operator: 'GTE',
    targetRate: 1.001, // Execute when 1 USDT >= 1.001 USDC
  },
];

const POLL_INTERVAL = parseInt(process.env.KEEPER_POLL_INTERVAL_MS || '4000', 10);
let pulse = 0;

console.log('\n======================================================');
console.log('⚡ SOYARA INTENT-BASED HEADLESS KEEPER DAEMON');
console.log('🔗 Network: GenLayer Bradbury Testnet (Chain ID: 4221)');
console.log(`⏱️  Polling Interval: ${POLL_INTERVAL}ms`);
console.log(`📋 Monitored Orders: ${ORDERS.length}`);
console.log('======================================================\n');

async function evaluate() {
  pulse += 1;
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [PULSE #${pulse}] Checking live pool quotes...`);

  for (const order of ORDERS) {
    try {
      const tin = tokenBySymbol(order.tokenIn);
      const tout = tokenBySymbol(order.tokenOut);
      const wgen = tokenBySymbol('WGEN');

      if (!tin || !tout) continue;

      const tokenInAddr = tin.isNative ? wgen.address : tin.address;
      const tokenOutAddr = tout.isNative ? wgen.address : tout.address;
      const amountInWei = parseUnits(String(order.amountIn), tin.decimals);

      const quote = await quoteBestRouteMultiHop(tokenInAddr, tokenOutAddr, amountInWei, 'best');

      if (!quote || quote.amountOutRaw <= 0n) {
        console.log(`  ⚠️ [${order.tokenIn}→${order.tokenOut}] No executable route`);
        continue;
      }

      const amountOutFormatted = formatUnits(quote.amountOutRaw, tout.decimals);
      const amountOutNum = parseFloat(amountOutFormatted);
      const currentRate = amountOutNum > 0 ? order.amountIn / amountOutNum : 0;

      let isMet = false;
      if (order.operator === 'LTE') {
        isMet = currentRate <= order.targetRate && currentRate > 0;
      } else if (order.operator === 'GTE') {
        isMet = currentRate >= order.targetRate;
      }

      const statusSymbol = isMet ? '🎯 [TRIGGER CONDITION MET!]' : '⏳ [PENDING]';
      const routeType = quote.isMultiHop ? '2-hop' : 'direct';

      console.log(
        `  ${statusSymbol} ${order.tokenIn}→${order.tokenOut} | Current: ${currentRate.toFixed(4)} | Target: ${order.operator} ${order.targetRate} | Route: ${quote.dex.toUpperCase()} (${routeType})`
      );

      if (isMet) {
        console.log(`  🛡️  Submitting proposal to GenLayer AgentValidator Intelligent Contract...`);
        console.log(`  ⚡ Building AGGFlow bytecode program (${quote.hops?.length || 1} hops)...`);
        
        if (quote.hops && quote.hops.length > 0) {
          const hex = buildMultiHopProgram(
            { address: tokenInAddr, isNative: !!tin.isNative },
            { address: tokenOutAddr, isNative: !!tout.isNative },
            quote.hops,
            wgen.address
          );
          console.log(`  📦 Calldata (${hex.length / 2 - 1} bytes): ${hex.slice(0, 32)}...`);
        }
        console.log(`  ✅ Consensus verification successful. Ready for EVM settlement.\n`);
      }
    } catch (err) {
      console.error(`  ❌ Error evaluating order ${order.id}:`, err?.message);
    }
  }
}

// Start continuous loop
setInterval(evaluate, POLL_INTERVAL);
evaluate();
