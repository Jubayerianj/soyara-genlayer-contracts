import { NextResponse } from 'next/server';
import { quoteBestRouteMultiHop, tokenBySymbol, buildMultiHopProgram, CONTRACT_ADDRESSES } from '@soyaradex/sdk';
import { parseUnits, formatUnits } from 'viem';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tokenIn, tokenOut, amountIn, condition, slippageBps = 100 } = body;

    if (!tokenIn || !tokenOut || !amountIn || !condition) {
      return NextResponse.json(
        { error: 'Missing required parameters: tokenIn, tokenOut, amountIn, condition' },
        { status: 400 }
      );
    }

    const tin = tokenBySymbol(tokenIn);
    const tout = tokenBySymbol(tokenOut);
    if (!tin || !tout) {
      return NextResponse.json(
        { error: `Unknown tokens: ${tokenIn} / ${tokenOut}` },
        { status: 400 }
      );
    }

    const wgen = tokenBySymbol('WGEN')!;
    const tokenInAddr = tin.isNative ? wgen.address : tin.address;
    const tokenOutAddr = tout.isNative ? wgen.address : tout.address;
    const amountInWei = parseUnits(String(amountIn), tin.decimals);

    // Multi-hop quote on Bradbury testnet
    const quote = await quoteBestRouteMultiHop(tokenInAddr, tokenOutAddr, amountInWei, 'best');

    if (!quote || quote.amountOutRaw <= 0n) {
      return NextResponse.json({
        triggered: false,
        error: 'No executable route found',
      });
    }

    const amountOutFormatted = formatUnits(quote.amountOutRaw, tout.decimals);
    const amountOutNum = parseFloat(amountOutFormatted);
    const currentRate = amountOutNum > 0 ? Number(amountIn) / amountOutNum : 0;

    let triggered = false;
    if (condition.operator === 'LTE') {
      triggered = currentRate <= condition.targetRate && currentRate > 0;
    } else if (condition.operator === 'GTE') {
      triggered = currentRate >= condition.targetRate;
    }

    let calldata = '';
    if (quote.hops && quote.hops.length > 0) {
      try {
        calldata = buildMultiHopProgram(
          { address: tokenInAddr, isNative: !!tin.isNative },
          { address: tokenOutAddr, isNative: !!tout.isNative },
          quote.hops,
          wgen.address
        );
      } catch (err: any) {
        console.warn('Calldata generation warning:', err?.message);
      }
    }

    return NextResponse.json({
      success: true,
      triggered,
      currentRate,
      targetRate: condition.targetRate,
      operator: condition.operator,
      quote: {
        dex: quote.dex,
        isMultiHop: quote.isMultiHop,
        hops: quote.hops,
        amountOutFormatted,
        priceImpactPct: quote.priceImpactPct,
      },
      calldata,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Server-side keeper evaluation failed' },
      { status: 500 }
    );
  }
}
