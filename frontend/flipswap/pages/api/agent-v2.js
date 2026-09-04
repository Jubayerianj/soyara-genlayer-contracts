// pages/api/agent-v2.js
import { formatUnits, parseUnits } from 'viem';
import { quoteBestRoute } from '../../lib/dexQuote.js';
import { TOKEN_LIST, GEN_NATIVE_TOKEN } from '../../constants/tokens.js';
import { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS } from '../../constants/addresses.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Rough reference prices — ONLY used as a last-resort fallback when no live V2/V3
// pool exists for a pair yet (calculateQuote() below always tries real on-chain
// pool reserves/price first). Do not treat these as accurate market prices.
const TOKEN_PRICES_USD = {
  GEN: 0.50,
  WGEN: 0.50,
  USDC: 1.00,
  USDT: 1.00,
  ETH: 2650.00,
  WBTC: 68500.00,
  FSWP: 0.15,
};

// ── Live on-chain quoting ───────────────────────────────────────────────────
// Uses the shared, execution-accurate quoter (lib/dexQuote.js): V3 only via the
// real Quoter, V2 via exact constant-product math, both net of the entrypoint
// fee. Quotes feed minAmountOut, so they must be a lower bound on real output —
// an optimistic quote makes settlement revert with
// AGGFlowEntrypoint_InsufficientAmountAfterFees().

async function getOnChainQuote(tokenInObj, tokenOutObj, amountInNum, dexPref = 'best') {
  const wgenAddress = CONTRACT_ADDRESSES[4221].wgen;
  const tokenInAddr = tokenInObj.isNative ? wgenAddress : tokenInObj.address;
  const tokenOutAddr = tokenOutObj.isNative ? wgenAddress : tokenOutObj.address;
  const decimalsIn = tokenInObj.decimals || 18;
  const amountInWei = parseUnits(String(amountInNum), decimalsIn);
  return quoteBestRoute(tokenInAddr, tokenOutAddr, amountInWei, dexPref);
}

const GENLAYER_KNOWLEDGE = {
  network: 'GenLayer Bradbury Testnet (Chain ID: 4221)',
  rpc: 'https://rpc-bradbury.genlayer.com',
  explorer: 'https://explorer-bradbury.genlayer.com',
  contracts: {
    agentValidator: INTELLIGENT_CONTRACTS.agentValidator,
    liquidityValidator: INTELLIGENT_CONTRACTS.liquidityValidator,
    aggFlowEntrypoint: CONTRACT_ADDRESSES[4221].aggregatorEntrypoint,
    v2Router: CONTRACT_ADDRESSES[4221].router,
    v3Router: CONTRACT_ADDRESSES[4221].v3Router,
    v3PositionManager: CONTRACT_ADDRESSES[4221].v3PositionManager,
  },
  tokens: [
    { symbol: 'GEN', name: 'GenLayer Native Token', price: '$0.50', address: 'Native (0x0)' },
    { symbol: 'WGEN', name: 'Wrapped GEN', price: '$0.50', address: '0x315374AA9b5536037Cc1Efeea2439CCC0913A77e' },
    { symbol: 'USDC', name: 'USD Coin', price: '$1.00', address: '0x58B6CD7891cd0A682226E25607b958a6479195A6' },
    { symbol: 'USDT', name: 'Tether USD', price: '$1.00', address: '0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc' },
    { symbol: 'WBTC', name: 'Wrapped Bitcoin', price: '$68,500.00', address: '0x723534bc6C2B536fF5D0455111513A9431c44e25' },
    { symbol: 'ETH', name: 'Ethereum', price: '$2,650.00', address: '0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C' },
    { symbol: 'FSWP', name: 'Soyara Protocol Token', price: '$0.15', address: '0xA2eC9aAf2235C66491767e69eBBD885469697B3E' },
  ],
};

function normalizeToken(symbolOrAddress) {
  if (!symbolOrAddress) return null;
  const s = String(symbolOrAddress).toUpperCase().trim();
  if (s === 'ETH' || s === 'LETH' || s === 'ETHEREUM') return 'ETH';
  if (s === 'BTC' || s === 'WBTC' || s === 'ZKBTC' || s === 'BITCOIN') return 'WBTC';
  if (s === 'USDC' || s === 'ZKUSDC') return 'USDC';
  if (s === 'USDT' || s === 'ZKUSDT' || s === 'TETHER') return 'USDT';
  if (s === 'GEN' || s === 'WSOMI' || s === 'SOMI' || s === 'GENLAYER') return 'GEN';
  if (s === 'WGEN' || s === 'WRAPPED GEN') return 'WGEN';
  if (s === 'FSWP' || s === 'SOYARA' || s === 'SOY' || s === 'FLIPSWAP') return 'FSWP';
  return s;
}

function getTokenObject(symbol) {
  const norm = normalizeToken(symbol);
  const list = TOKEN_LIST[4221] || [];
  return list.find(t => t.symbol.toUpperCase() === norm) || (norm === 'GEN' ? GEN_NATIVE_TOKEN : null);
}

// Display formatter for quote amounts. Two properties matter:
//  1. adaptive precision — a flat 4 decimals erases a 0.005697 output entirely;
//  2. it TRUNCATES rather than rounds, so the number shown to the user can never
//     be larger than what the pool actually delivers.
// Default slippage tolerance, in basis points.
//
// 0.3% was unusable in practice: enforced per-trade GenLayer consensus puts
// ~50s between the quote and settlement, and these pools are small enough
// (~10k units a side) that an ordinary trade moves the price several percent in
// that window. The validated minAmountOut was then unreachable and settlement
// refused. 1% survives normal drift and is still far inside the AgentValidator
// IC's 300 bps cap. Raise it here if the pools get deeper.
export const DEFAULT_SLIPPAGE_BPS = 100;

function formatAmountDisplay(raw, decimals) {
  const full = formatUnits(raw, decimals);
  const n = parseFloat(full);
  if (!Number.isFinite(n) || n === 0) return '0';
  const magnitude = Math.floor(Math.log10(Math.abs(n)));
  const places = Math.min(8, Math.max(2, 5 - magnitude));
  const [int, frac = ''] = full.split('.');
  return `${int}.${frac.padEnd(places, '0').slice(0, places)}`;
}

async function calculateQuote(tokenInSym, tokenOutSym, amountInNum, dex = 'best') {
  const normIn = normalizeToken(tokenInSym) || 'USDC';
  const normOut = normalizeToken(tokenOutSym) || 'GEN';
  const amtIn = Math.max(0.000001, parseFloat(amountInNum) || 1);

  // Wrap / Unwrap direct 1:1 conversion
  const isWrap = (normIn === 'GEN' && normOut === 'WGEN');
  const isUnwrap = (normIn === 'WGEN' && normOut === 'GEN');

  if (isWrap || isUnwrap) {
    return {
      tokenIn: normIn,
      tokenOut: normOut,
      amountIn: amtIn,
      amountOut: amtIn.toString(),
      minAmountOut: amtIn.toString(),
      fee: '0.00%',
      priceImpact: '0.00%',
      route: isWrap ? 'Wrap (GEN -> WGEN direct 1:1)' : 'Unwrap (WGEN -> GEN direct 1:1)',
      dex: isWrap ? 'wrap' : 'unwrap',
      isWrap,
      isUnwrap,
    };
  }

  const decimalsFor = (sym) => (sym === 'WBTC' ? 6 : sym === 'ETH' ? 5 : 4);
  const tokenInObj = getTokenObject(normIn);
  const tokenOutObj = getTokenObject(normOut);

  if (tokenInObj && tokenOutObj) {
    try {
      // If a specific venue was requested but cannot actually fill this size,
      // retry across all venues. Falling back to the reference price instead
      // would fabricate a quote (and an unachievable minAmountOut) while a real
      // routable pool existed.
      let onChain = await getOnChainQuote(tokenInObj, tokenOutObj, amtIn, dex);
      if (!onChain && dex !== 'best') {
        onChain = await getOnChainQuote(tokenInObj, tokenOutObj, amtIn, 'best');
      }
      if (onChain) {
        const decimalsOut = tokenOutObj.decimals || 18;
        const minOutRaw = (onChain.amountOutRaw * BigInt(10000 - DEFAULT_SLIPPAGE_BPS)) / 10000n;
        const amountOut = formatAmountDisplay(onChain.amountOutRaw, decimalsOut);
        const minAmountOut = formatAmountDisplay(minOutRaw, decimalsOut);
        const isV3 = onChain.dex === 'v3';
        // Carry RAW integer amounts alongside the display strings. minAmountOut
        // is enforced on-chain, so it must come from integer math — deriving it
        // from a display value rounded with toFixed() can round UP past the real
        // output and make settlement revert with
        // AGGFlowEntrypoint_InsufficientAmountAfterFees().
        const amountOutRawStr = onChain.amountOutRaw.toString();
        const minAmountOutRawStr = minOutRaw.toString();
        return {
          tokenIn: normIn,
          tokenOut: normOut,
          amountIn: amtIn,
          amountOut,
          minAmountOut,
          amountOutRaw: amountOutRawStr,
          minAmountOutRaw: minAmountOutRawStr,
          fee: isV3 ? `${(onChain.feeTier / 10000).toFixed(2)}%` : '0.30%',
          priceImpact: `${Math.min(99.99, onChain.priceImpactPct).toFixed(2)}%`,
          // Numeric impact so the UI can warn rather than just display a string.
          // These pools are small (~10k units a side); a few thousand units is a
          // double-digit-percent trade whose quote goes stale almost immediately,
          // which surfaced to users only as a confusing "price moved" refusal at
          // settlement.
          priceImpactPct: Number(onChain.priceImpactPct.toFixed(2)),
          highImpact: onChain.priceImpactPct >= 5,
          route: isV3 ? `V3 Concentrated (${(onChain.feeTier / 10000).toFixed(2)}% fee tier)` : 'V2 Classic AMM (0.30% fee)',
          dex: onChain.dex,
          poolAddress: onChain.pool,
          isLiveQuote: true,
        };
      }
    } catch (err) {
      console.error('[agent-v2] on-chain quote failed, falling back to reference price:', err.message);
    }
  }

  // ── Fallback: no routable pool for this pair — rough reference price only ──
  const priceIn = TOKEN_PRICES_USD[normIn] || 1.0;
  const priceOut = TOKEN_PRICES_USD[normOut] || 1.0;

  const rawOut = (amtIn * priceIn) / priceOut;
  const isV3 = dex === 'v3';
  const feeRate = isV3 ? 0.0005 : 0.003;
  const feePct = isV3 ? '0.05%' : '0.30%';

  const amountOut = (rawOut * (1 - feeRate)).toFixed(decimalsFor(normOut));
  const minAmountOut = (parseFloat(amountOut) * 0.997).toFixed(decimalsFor(normOut));

  return {
    tokenIn: normIn,
    tokenOut: normOut,
    amountIn: amtIn,
    amountOut,
    minAmountOut,
    fee: feePct,
    priceImpact: 'N/A (no routable pool)',
    route: 'Estimated — no routable pool found',
    dex: isV3 ? 'v3' : 'v2',
    isLiveQuote: false,
  };
}

const tools = [
  {
    functionDeclarations: [
      {
        name: 'get_quote',
        description: 'Get real-time swap quote, estimated output, price impact, and fee on Soyara DEX.',
        parameters: {
          type: 'OBJECT',
          properties: {
            tokenIn: { type: 'STRING', description: 'Token symbol to sell (e.g. USDC, GEN, ETH, WBTC, USDT)' },
            tokenOut: { type: 'STRING', description: 'Token symbol to buy (e.g. GEN, USDC, WGEN, FSWP)' },
            amountIn: { type: 'NUMBER', description: 'Amount of tokenIn' },
            dex: { type: 'STRING', description: 'DEX routing: best, v3, or v2', enum: ['best', 'v3', 'v2'] }
          },
          required: ['tokenIn', 'tokenOut', 'amountIn']
        }
      },
      {
        name: 'compare_routes',
        description: 'Compare V2 Classic vs V3 Concentrated liquidity routes for maximum capital efficiency and lowest fee.',
        parameters: {
          type: 'OBJECT',
          properties: {
            tokenIn: { type: 'STRING', description: 'Token to sell' },
            tokenOut: { type: 'STRING', description: 'Token to buy' },
            amountIn: { type: 'NUMBER', description: 'Amount to sell' }
          },
          required: ['tokenIn', 'tokenOut', 'amountIn']
        }
      },
      {
        name: 'get_pool_info',
        description: 'Fetch pool details including TVL, volume, fee tiers, and depth on Soyara DEX.',
        parameters: {
          type: 'OBJECT',
          properties: {
            tokenA: { type: 'STRING', description: 'First token symbol' },
            tokenB: { type: 'STRING', description: 'Second token symbol' },
            dex: { type: 'STRING', description: 'DEX type: v2 or v3', enum: ['v2', 'v3'] }
          },
          required: ['tokenA', 'tokenB']
        }
      },
      {
        name: 'get_contract_info',
        description: 'Fetch deployed GenLayer Intelligent Contract addresses and security parameters (AgentValidator, LiquidityValidator).',
        parameters: {
          type: 'OBJECT',
          properties: {
            contractType: { type: 'STRING', description: 'Contract name or type', enum: ['all', 'agentValidator', 'liquidityValidator', 'routers'] }
          },
          required: ['contractType']
        }
      }
    ]
  }
];

async function buildProposalObject(action, params) {
  const defaultRouter = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint || '0xfdf5cD6452EDC340e67cd16db6A9D74aaa4f81a3';
  // Quantise the deadline to a 10-minute boundary.
  //
  // deadline is one of the inputs to compute_proposal_id, so a per-second value
  // gave every quote a unique id and the on-chain verdict cache could never hit
  // — an identical repeat trade paid for a fresh ~50s consensus round every
  // time. Rounding UP to the next boundary keeps the deadline at least as far
  // out as before while letting identical trades in the same window reuse a
  // verdict that already exists.
  const DEADLINE_BUCKET = 600;
  const deadline = Math.ceil((Math.floor(Date.now() / 1000) + 1200) / DEADLINE_BUCKET) * DEADLINE_BUCKET;

  if (action === 'SWAP') {
    const tokenInSym = normalizeToken(params.tokenIn || params.fromToken) || 'USDC';
    const tokenOutSym = normalizeToken(params.tokenOut || params.toToken) || 'GEN';
    const amountIn = parseFloat(params.amountIn || params.fromAmount || 100);
    const quote = await calculateQuote(tokenInSym, tokenOutSym, amountIn, params.dex || params.model || 'best');

    const tokenInObj = getTokenObject(tokenInSym);
    const tokenOutObj = getTokenObject(tokenOutSym);

    const decimalsIn = tokenInObj?.decimals || 18;
    const decimalsOut = tokenOutObj?.decimals || 18;

    // parseUnits keeps full precision; the old 1e6 scaling truncated small amounts.
    const amountInRaw = parseUnits(String(amountIn), decimalsIn).toString();
    // Use the raw quote when available so minAmountOut is never rounded UP past
    // the achievable output.
    const minAmountOutRaw = quote.minAmountOutRaw
      ?? (parseUnits(String(quote.minAmountOut), decimalsOut)).toString();

    return {
      action: 'SWAP',
      tokenIn: tokenInSym,
      tokenOut: tokenOutSym,
      tokenInAddress: tokenInObj?.address || '0x0000000000000000000000000000000000000000',
      tokenOutAddress: tokenOutObj?.address || '0x0000000000000000000000000000000000000000',
      amountIn: amountIn,
      amountInRaw,
      expectedOutput: `${quote.amountOut} ${tokenOutSym}`,
      amountOutRaw: quote.amountOutRaw,
      minAmountOut: quote.minAmountOut,
      minAmountOutRaw,
      slippage: `${(DEFAULT_SLIPPAGE_BPS / 100).toFixed(2)}%`,
      slippageBps: DEFAULT_SLIPPAGE_BPS,
      priceImpact: quote.priceImpact,
      priceImpactPct: quote.priceImpactPct ?? null,
      highImpact: Boolean(quote.highImpact),
      route: quote.route,
      // Carry the routed venue so settlement builds a program for the SAME pool
      // the quote came from. Without this, execution falls back to 'best' and can
      // pick a V3 pool that cannot actually fill, reverting with
      // AGGFlowEntrypoint_InsufficientAmountAfterFees().
      dex: quote.dex,
      router: defaultRouter,
      deadline,
      // A quote from the reference-price fallback is a display estimate with no
      // pool behind it — settling one can only revert. Mark it so the UI can
      // refuse execution up front instead of failing at settlement.
      isLiveQuote: quote.isLiveQuote === true,
      executable: quote.isLiveQuote === true,
      notExecutableReason: quote.isLiveQuote === true
        ? null
        : `No liquidity pool exists for ${tokenInSym}/${tokenOutSym} on Soyara DEX. The rate shown is a reference estimate only and cannot be executed.`,
      genlayerContract: INTELLIGENT_CONTRACTS.agentValidator,
    };
  } else if (action === 'ADD_LIQUIDITY') {
    const tokenA = normalizeToken(params.tokenA) || 'GEN';
    const tokenB = normalizeToken(params.tokenB) || 'USDC';
    const amountA = parseFloat(params.amountA || 10);
    const amountB = parseFloat(params.amountB || 20);
    const model = params.model === 'v3' ? 'V3 Concentrated (0.05%)' : 'V2 Classic AMM';

    const tokenAObj = getTokenObject(tokenA);
    const tokenBObj = getTokenObject(tokenB);

    const decimalsA = tokenAObj?.decimals || 18;
    const decimalsB = tokenBObj?.decimals || 18;

    const slippageFactor = 0.995; // 0.50% slippage (50 bps, strictly within GenLayer 300 bps cap)
    const amountARaw = (BigInt(Math.floor(amountA * 1e6)) * BigInt(10 ** (decimalsA - 6))).toString();
    const amountBRaw = (BigInt(Math.floor(amountB * 1e6)) * BigInt(10 ** (decimalsB - 6))).toString();
    const minAmountARaw = (BigInt(Math.floor(amountA * slippageFactor * 1e6)) * BigInt(10 ** (decimalsA - 6))).toString();
    const minAmountBRaw = (BigInt(Math.floor(amountB * slippageFactor * 1e6)) * BigInt(10 ** (decimalsB - 6))).toString();

    return {
      action: 'ADD_LIQUIDITY',
      tokenA,
      tokenB,
      tokenIn: tokenA,
      tokenOut: tokenB,
      tokenAAddress: tokenAObj?.address || '0x0000000000000000000000000000000000000000',
      tokenBAddress: tokenBObj?.address || '0x0000000000000000000000000000000000000000',
      amountA,
      amountB,
      amountARaw,
      amountBRaw,
      minAmountA: (amountA * slippageFactor).toFixed(4),
      minAmountB: (amountB * slippageFactor).toFixed(4),
      minAmountARaw,
      minAmountBRaw,
      amount0Desired: amountARaw,
      amount1Desired: amountBRaw,
      amount0Min: minAmountARaw,
      amount1Min: minAmountBRaw,
      amountIn: amountA,
      minAmountOut: amountB,
      expectedOutput: `LP Position (${tokenA}-${tokenB})`,
      slippage: '0.50%',
      slippageBps: 50,
      priceImpact: '<0.01%',
      route: model,
      model: params.model || 'v2',
      router: params.model === 'v3' ? CONTRACT_ADDRESSES[4221].v3PositionManager : CONTRACT_ADDRESSES[4221].router,
      deadline,
      genlayerContract: INTELLIGENT_CONTRACTS.liquidityValidator,
    };
  }

  return null;
}

// Deep, contextual rule-based conversation engine (fallback & direct response handler)
async function generateComprehensiveDiscussion(message) {
  const text = message.toLowerCase().trim();

  // 1. GENLAYER & INTELLIGENT CONTRACTS EXPLANATION
  if (text.includes('how') && (text.includes('intelligent contract') || text.includes('genlayer') || text.includes('genvm') || text.includes('consensus') || text.includes('work') || text.includes('validate'))) {
    return {
      reply: `### 🛡️ How GenLayer Intelligent Contracts Work on Soyara DEX\n\nUnlike traditional EVM smart contracts that are strictly deterministic and blind to off-chain data, **GenLayer Intelligent Contracts (ICs)** run on the **GenVM** sandbox in Python with native LLM & nondeterministic execution capabilities:\n\n1. **Optimistic Democracy Consensus:** Multiple validator nodes independently simulate the proposed trade. They run deterministic checks (token whitelist, router whitelist, 3% slippage cap) and LLM coherence evaluation.\n2. **AI-Validated Execution:** The leader generates a validation result (` + '`validate_proposal`' + `), and validators vote via the Equivalence Principle (` + '`gl.eq_principle.strict_eq`' + `).\n3. **DeFi Protection:** Your transaction cannot be front-run with abnormal slippage or malicious calldata because the **AgentValidator** IC (` + '`' + INTELLIGENT_CONTRACTS.agentValidator.slice(0, 10) + '...`' + `) verifies every parameter before on-chain execution.\n\nWould you like me to prepare a sample trade proposal to test the consensus validation?`,
      proposal: null,
      toolsUsed: ['GenVM Architecture', 'AgentValidator IC'],
    };
  }

  // 2. TOKEN ASSETS & PRICES
  if (text.includes('token') || text.includes('list') || text.includes('what can i trade') || text.includes('supported') || text.includes('price')) {
    const tokenSummary = GENLAYER_KNOWLEDGE.tokens.map(t => `- **${t.symbol}** (${t.name}): ${t.price} · \`${t.address.slice(0, 10)}...\``).join('\n');
    return {
      reply: `### 🪙 Supported Tokens on GenLayer Bradbury Testnet:\n\n${tokenSummary}\n\nAll of these tokens are whitelisted in **AgentValidator** and **LiquidityValidator** contracts.\n\n*Try saying: "Swap 100 USDC to GEN" or "Compare V2 vs V3 for 50 WGEN to USDT".*`,
      proposal: null,
      toolsUsed: ['Token Registry'],
    };
  }

  // 3. SLIPPAGE & SAFETY QUESTIONS
  if (text.includes('slippage') || text.includes('safety') || text.includes('security') || text.includes('mev') || text.includes('protect')) {
    return {
      reply: `### 🔒 Slippage Protection & Execution Security\n\nSoyara DEX enforces multi-tiered security on GenLayer:\n\n- **Hard Slippage Cap:** Hard-capped at **3.00% (300 bps)** in the on-chain Intelligent Contract. Any proposal exceeding 3% is automatically rejected by validator consensus.\n- **Slippage Warning:** Slippage between **1.00% - 3.00%** triggers a warning in the validation response.\n- **Router Whitelist:** Swaps only route through verified contracts (**AGGFlowEntrypoint**, **V2 Router**, **V3 Router**).\n- **User Custody:** Output tokens are sent directly to your connected wallet recipient address.\n\nWould you like to check current routes with a safe 0.30% slippage?`,
      proposal: null,
      toolsUsed: ['Security Validator'],
    };
  }

  // 4. FEES & V2 VS V3 COMPARISONS
  if (text.includes('fee') || text.includes('difference between v2 and v3') || text.includes('why v3') || text.includes('tier')) {
    return {
      reply: `### 📊 Fee Structure: V2 Classic vs V3 Concentrated\n\n- **V3 Concentrated Liquidity:**\n  - **0.05% fee tier:** Best for stable or high-volume correlated pairs (e.g. USDC/USDT, GEN/WGEN).\n  - **0.30% fee tier:** Standard for major pairs (e.g. GEN/USDC, ETH/USDC).\n  - **1.00% fee tier:** For exotic or volatile assets.\n  - Higher capital efficiency with tight tick ranges.\n\n- **V2 Classic AMM:**\n  - Flat **0.30% fee** across the entire curve ` + '`x * y = k`' + `.\n  - Simpler, full-range liquidity provision.\n\nOur **AGGFlow aggregator** automatically checks both to find the route that maximizes your output!`,
      proposal: null,
      toolsUsed: ['Route Comparator'],
    };
  }

  // 5. TRADING / SWAP INTENTS
  const tokens = ['usdc', 'usdt', 'gen', 'wgen', 'eth', 'wbtc', 'fswp'];
  // Order the matches by WHERE THEY APPEAR IN THE SENTENCE, not by their order
  // in the list above. Scanning the list in a fixed order made
  // "Swap 0.01 GEN to USDC" resolve to tokenIn=USDC / tokenOut=GEN — the exact
  // reverse of the request, so the user would have been shown a proposal to buy
  // the token they asked to sell.
  const foundTokens = tokens
    .map((t) => {
      const m = new RegExp(`\\b${t}\\b`, 'i').exec(text);
      return m ? { sym: normalizeToken(t), at: m.index } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at)
    .map((f) => f.sym);

  // Strip venue markers ("v2"/"v3") before reading the trade size — otherwise
  // "swap usdc to gen on v3" reads an amount of 3.
  const numberMatches = text.replace(/\bv[23]\b/gi, '').match(/\d+(?:\.\d+)?/g);
  const amount = numberMatches ? parseFloat(numberMatches[0]) : 100;
  const isV3 = text.includes('v3') || text.includes('concentrated') || text.includes('low fee');

  if (text.includes('swap') || text.includes('trade') || text.includes('buy') || text.includes('sell') || text.includes('exchange') || text.includes('convert')) {
    // NEVER invent the other side of a trade.
    //
    // These defaults used to fire silently: a typo like "wap 34 udc to usdt"
    // matched only USDT, which then became the SOURCE (`foundTokens[0]`) while
    // GEN was fabricated as the destination — the opposite of what was asked,
    // for a token pair the user never named. Guessing is not acceptable when the
    // result is a real trade, so an under-specified request now asks instead.
    //
    // A token introduced by "to"/"for"/"into" is the DESTINATION, so if it is
    // the only one recognised then the source is what is missing.
    const destMatch = /\b(?:to|for|into)\s+([a-z]+)\b/i.exec(text);
    const namedDest = destMatch ? normalizeToken(destMatch[1]) : null;
    const KNOWN = new Set(['USDC', 'USDT', 'GEN', 'WGEN', 'WBTC', 'ETH', 'FSWP']);

    // A destination was named but is not a token we know — almost always a typo
    // ("...to udc"). Ask; do not quietly substitute a default, which is how
    // "swap 34 USDT to udc" became a USDT -> GEN proposal.
    if (namedDest && !KNOWN.has(namedDest)) {
      return {
        reply: `### ❓ I don't recognise **${destMatch[1].toUpperCase()}**\n\nThat looks like a typo for the token you want to receive.\n\nSupported: **USDC, USDT, GEN, WGEN, WBTC, ETH, FSWP**\n\nFor example: *"swap ${amount} ${foundTokens[0] || 'USDC'} to USDT"*.\n\nI have not prepared a proposal, because guessing the token would risk trading something you did not ask for.`,
        proposal: null,
        toolsUsed: [],
      };
    }

    let tokenIn;
    let tokenOut;

    if (foundTokens.length >= 2) {
      tokenIn = foundTokens[0];
      tokenOut = foundTokens[1];
    } else if (foundTokens.length === 1) {
      const only = foundTokens[0];
      if (namedDest && namedDest === only) {
        // The single recognised token is the destination — the source is unknown.
        return {
          reply: `### ❓ I need one more detail\n\nI understood you want to receive **${only}**, but I could not make out which token you want to swap **from** — please check the spelling.\n\nSupported: **USDC, USDT, GEN, WGEN, WBTC, ETH, FSWP**\n\nFor example: *"swap ${amount} USDC to ${only}"*.\n\nI have not prepared a proposal, because guessing the token would risk trading something you did not ask for.`,
          proposal: null,
          toolsUsed: [],
        };
      }
      tokenIn = only;
      tokenOut = only === 'GEN' ? 'USDC' : 'GEN';
    } else {
      return {
        reply: `### ❓ Which tokens do you want to swap?\n\nI could not recognise a token in that request — please check the spelling.\n\nSupported: **USDC, USDT, GEN, WGEN, WBTC, ETH, FSWP**\n\nFor example: *"swap ${amount} USDC to USDT"*.`,
        proposal: null,
        toolsUsed: [],
      };
    }

    if (tokenIn === tokenOut) {
      return {
        reply: `### ❓ Both sides of that trade are **${tokenIn}**\n\nTell me which token you want to receive — for example *"swap ${amount} ${tokenIn} to USDT"*.`,
        proposal: null,
        toolsUsed: [],
      };
    }

    // Swaps ALWAYS take the aggregator's best route — Soyara compares venues and
    // fills wherever the output is best, so pinning V2/V3 from the user's wording
    // can only match or worsen the fill (and forcing a venue that cannot fill the
    // size drops the quote into the reference-price fallback). The venue that won
    // is reported back in `route`/`dex` as an outcome.
    const quote = await calculateQuote(tokenIn, tokenOut, amount, 'best');

    const proposal = await buildProposalObject('SWAP', {
      tokenIn,
      tokenOut,
      amountIn: amount,
      dex: 'best',
    });

    const rate = (parseFloat(quote.amountOut) / amount).toFixed(6);
    return {
      reply: `### ⚡ Swap Execution Proposal Prepared\n\nI have analyzed routes across GenLayer liquidity pools for your trade:\n\n- **Route:** ${quote.route}\n- **Rate:** 1 ${tokenIn} ≈ ${rate} ${tokenOut}${quote.isLiveQuote ? ' (live pool price)' : ' (estimated — no live pool)'}\n- **Expected Output:** **${quote.amountOut} ${tokenOut}**\n- **Min. Received (${(DEFAULT_SLIPPAGE_BPS / 100).toFixed(2)}% slippage):** ${quote.minAmountOut} ${tokenOut}\n- **Protocol Fee:** ${quote.fee}\n- **Price Impact:** ${quote.priceImpact}\n\n👉 **Next Step:** Click **"Validate with GenLayer IC"** in the proposal card on the right to verify this trade through decentralized consensus on GenVM!`,
      proposal,
      toolsUsed: ['get_quote', 'compare_routes', 'AgentValidator IC'],
    };
  }

  // 6. LIQUIDITY INTENTS
  if (text.includes('liquidity') || text.includes('pool') || text.includes('deposit') || text.includes('provide')) {
    const tokenA = foundTokens[0] || 'GEN';
    const tokenB = foundTokens[1] || 'USDC';
    const amountA = amount;
    const amountB = numberMatches && numberMatches.length > 1 ? parseFloat(numberMatches[1]) : (amount * 2);

    const proposal = await buildProposalObject('ADD_LIQUIDITY', {
      tokenA,
      tokenB,
      amountA,
      amountB,
      model: isV3 ? 'v3' : 'v2',
    });

    return {
      reply: `### 💧 Liquidity Proposal Prepared: ${tokenA}/${tokenB}\n\n- **Pool Model:** ${isV3 ? 'V3 Concentrated Liquidity (0.05% Fee Tier)' : 'V2 Classic AMM (0.30% Fee)'}\n- **Deposit Amount A:** **${amountA} ${tokenA}** (~$${(amountA * (TOKEN_PRICES_USD[tokenA] || 1)).toFixed(2)})\n- **Deposit Amount B:** **${amountB} ${tokenB}** (~$${(amountB * (TOKEN_PRICES_USD[tokenB] || 1)).toFixed(2)})\n- **Estimated Pool Share:** ~0.24%\n\n👉 **Next Step:** Validate with **LiquidityValidator IC** on the right panel to ensure tick ranges and amounts pass on-chain safety verification.`,
      proposal,
      toolsUsed: ['get_pool_info', 'LiquidityValidator IC'],
    };
  }

  // 7. ROUTE COMPARISONS
  if (text.includes('compare') || text.includes('vs') || text.includes('better')) {
    const tokenIn = foundTokens[0] || 'WGEN';
    const tokenOut = foundTokens[1] || 'USDC';
    const v2 = await calculateQuote(tokenIn, tokenOut, amount, 'v2');
    const v3 = await calculateQuote(tokenIn, tokenOut, amount, 'v3');
    const diff = (parseFloat(v3.amountOut) - parseFloat(v2.amountOut)).toFixed(4);
    const optimalDex = parseFloat(v3.amountOut) >= parseFloat(v2.amountOut) ? 'v3' : 'v2';

    return {
      reply: `### 🔍 In-Depth Route Comparison (${amount} ${tokenIn} → ${tokenOut})\n\n1. **V3 Concentrated (${v3.fee} Fee Tier)**${optimalDex === 'v3' ? ' 🏆 Optimal' : ''}:\n   - Output: **${v3.amountOut} ${tokenOut}**\n   - Fee: ${v3.fee}\n   - Price Impact: ${v3.priceImpact}\n\n2. **V2 Classic AMM (0.30% Fee)**${optimalDex === 'v2' ? ' 🏆 Optimal' : ''}:\n   - Output: **${v2.amountOut} ${tokenOut}**\n   - Fee: 0.30%\n   - Price Impact: ${v2.priceImpact}\n\n💡 **Insight:** ${optimalDex === 'v3' ? `V3 gives you **+${diff} ${tokenOut} more**` : `V2 gives you **+${Math.abs(diff)} ${tokenOut} more**`} on current pool liquidity. I've prepared a proposal using the optimal route for you.`,
      proposal: await buildProposalObject('SWAP', { tokenIn, tokenOut, amountIn: amount, dex: optimalDex }),
      toolsUsed: ['compare_routes'],
    };
  }

  // 8. DEFAULT HELPFUL DEFI DISCUSSION
  return {
    reply: `👋 Hello! I'm your **Soyara AI Trading Assistant**, connected to **GenLayer Bradbury Testnet**.\n\nHere are some of the things we can discuss and execute:\n\n- ⚡ **Real-Time Swaps:** *"Swap 100 USDC to GEN"* or *"Buy 0.05 ETH with USDT"*\n- 📊 **Smart Route Analysis:** *"Compare V2 vs V3 for 200 WGEN"* or *"Find lowest slippage route for WBTC"*\n- 💧 **Liquidity Provisioning:** *"Add liquidity with 20 GEN and 40 USDC"*\n- 🛡️ **Intelligent Contracts:** *"How does AgentValidator protect trades?"* or *"Show deployed contract addresses"*\n\nWhat would you like to explore or execute today?`,
    proposal: null,
    toolsUsed: ['Soyara AI Assistant'],
  };
}

/**
 * True when the message is plainly a trade we can price locally: a trade verb,
 * an amount, and at least two recognised tokens (or one plus a "to X" target).
 * Deliberately conservative — anything it is unsure about goes to the model.
 */
function isDirectTradeIntent(message) {
  const text = String(message || '').toLowerCase();
  if (!/\b(swap|trade|buy|sell|exchange|convert)\b/.test(text)) return false;
  if (!/\d/.test(text)) return false;
  const known = ['usdc', 'usdt', 'gen', 'wgen', 'eth', 'wbtc', 'fswp'];
  const hits = known.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(text));
  return hits.length >= 2;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  // ── FAST PATH: an unambiguous trade needs no LLM round trip ──────────────
  // The local handler already builds the whole proposal from live pool
  // reserves; routing "swap 50 USDC to USDT" through Gemini first added ~8s to
  // the single most common action on the page for no added information.
  // Anything conversational, ambiguous, or typo'd still falls through to the
  // model below.
  if (isDirectTradeIntent(message)) {
    try {
      const fast = await generateComprehensiveDiscussion(message);
      if (fast?.proposal) {
        return res.status(200).json({ ...fast, fastPath: true });
      }
    } catch (err) {
      console.warn('[agent-v2] fast path failed, falling back to model:', err.message);
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // If no Gemini API key is configured, provide the rich discussion response directly
  if (!apiKey) {
    const fallbackResponse = await generateComprehensiveDiscussion(message);
    return res.status(200).json(fallbackResponse);
  }

  try {
    const systemPrompt = `You are the expert Soyara AI Trading Agent on GenLayer Bradbury Testnet (Chain ID: 4221).
You possess comprehensive knowledge of decentralized finance, AMMs, SoyaraDex V2/V3 math, AGGFlow routing, and GenLayer Intelligent Contracts running on GenVM.

Supported Tokens on GenLayer Bradbury:
- GEN: Native currency, $0.50
- WGEN: Wrapped GEN (0x315374AA9b5536037Cc1Efeea2439CCC0913A77e), $0.50
- USDC: USD Coin (0x58B6CD7891cd0A682226E25607b958a6479195A6), $1.00
- USDT: Tether USD (0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc), $1.00
- WBTC: Wrapped BTC (0x723534bc6C2B536fF5D0455111513A9431c44e25), $68,500.00
- ETH: Ethereum (0x0F56b4E7f4e2cf346a94aB9263Ed3F3644db7c0C), $2,650.00
- FSWP: Soyara Protocol Token (0xA2eC9aAf2235C66491767e69eBBD885469697B3E), $0.15

Key Deployed Contracts:
- AgentValidator (GenLayer IC): ${INTELLIGENT_CONTRACTS.agentValidator} (Validates swaps via Optimistic Democracy)
- LiquidityValidator (GenLayer IC): ${INTELLIGENT_CONTRACTS.liquidityValidator} (Validates V2/V3 liquidity)
- AGGFlow Entrypoint: ${CONTRACT_ADDRESSES[4221].aggregatorEntrypoint}

Behavior Guidelines:
1. When discussing trades, quotes, or routes, use the provided tools to obtain numeric data.
2. Provide rich, concise, and expert DeFi explanations.
3. If the user asks about GenLayer, Intelligent Contracts, consensus, fees, or slippage, give clear, accurate explanations.
4. When a trade or liquidity action is intended, calculate accurate quotes and prepare a structured proposal.
5. Format responses with clean markdown headings, bold accents, and bullet points.`;

    const contents = [];
    for (const msg of history.slice(-4)) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    let currentContents = [...contents];
    let toolsUsed = [];
    let finalReply = '';
    let proposal = null;

    // Use high-speed flash-lite for sub-2s latency
    const FAST_MODELS = ['models/gemini-3.5-flash-lite', 'models/gemini-3.5-flash'];
    const activeModel = FAST_MODELS[0];

    for (let i = 0; i < 2; i++) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${activeModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(4500),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: currentContents,
          tools: tools,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 600,
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 150)}`);
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      const functionCallPart = parts.find(p => p.functionCall);
      const textPart = parts.find(p => p.text);

      if (functionCallPart) {
        const call = functionCallPart.functionCall;
        const name = call.name;
        const args = call.args;
        toolsUsed.push(name);

        let result;
        if (name === 'get_quote') {
          // Best route only — see the note in the swap branch above.
          result = await calculateQuote(args.tokenIn, args.tokenOut, args.amountIn, 'best');
          proposal = await buildProposalObject('SWAP', { ...args, dex: result.dex });
        } else if (name === 'compare_routes') {
          const v2 = await calculateQuote(args.tokenIn, args.tokenOut, args.amountIn, 'v2');
          const v3 = await calculateQuote(args.tokenIn, args.tokenOut, args.amountIn, 'v3');
          const optimalDex = parseFloat(v3.amountOut) >= parseFloat(v2.amountOut) ? 'v3' : 'v2';
          result = { v2, v3, optimal: optimalDex };
          proposal = await buildProposalObject('SWAP', { ...args, dex: optimalDex });
        } else if (name === 'get_pool_info') {
          result = {
            pair: `${args.tokenA}/${args.tokenB}`,
            tvl: '$1,420,000',
            volume24h: '$380,000',
            feeTier: args.dex === 'v3' ? '0.05%' : '0.30%',
          };
          proposal = await buildProposalObject('ADD_LIQUIDITY', { tokenA: args.tokenA, tokenB: args.tokenB });
        } else if (name === 'get_contract_info') {
          result = GENLAYER_KNOWLEDGE;
        } else {
          result = { error: 'Unknown tool' };
        }

        currentContents.push(candidate.content);
        currentContents.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: name,
              response: { name, content: result }
            }
          }]
        });
      } else if (textPart) {
        finalReply = textPart.text;
        break;
      } else {
        break;
      }
    }

    if (!proposal) {
      const fallback = await generateComprehensiveDiscussion(message);
      if (fallback.proposal) proposal = fallback.proposal;
      if (!finalReply) finalReply = fallback.reply;
    }

    return res.status(200).json({
      reply: finalReply || "I have analyzed your request.",
      proposal,
      toolsUsed
    });
  } catch (error) {
    console.error('Agent API fast fallback:', error.message);
    const fallback = await generateComprehensiveDiscussion(message);
    return res.status(200).json(fallback);
  }
}
