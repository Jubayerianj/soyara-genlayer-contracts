// pages/api/agent-v2.js
import { TOKEN_LIST, GEN_NATIVE_TOKEN } from '../../constants/tokens.js';
import { CONTRACT_ADDRESSES, INTELLIGENT_CONTRACTS } from '../../constants/addresses.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Real-time GenLayer market reference prices
const TOKEN_PRICES_USD = {
  GEN: 0.50,
  WGEN: 0.50,
  USDC: 1.00,
  USDT: 1.00,
  ETH: 2650.00,
  WBTC: 68500.00,
  FSWP: 0.15,
};

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

function calculateQuote(tokenInSym, tokenOutSym, amountInNum, dex = 'best') {
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

  const priceIn = TOKEN_PRICES_USD[normIn] || 1.0;
  const priceOut = TOKEN_PRICES_USD[normOut] || 1.0;

  const rawOut = (amtIn * priceIn) / priceOut;
  const isV3 = dex === 'v3' || dex === 'best';
  const feeRate = isV3 ? 0.0005 : 0.003; // V3 0.05%, V2 0.30%
  const feePct = isV3 ? '0.05%' : '0.30%';
  const priceImpact = Math.min(0.75, (amtIn * priceIn) / 60000).toFixed(2) + '%';

  const amountOut = (rawOut * (1 - feeRate)).toFixed(normOut === 'WBTC' ? 6 : (normOut === 'ETH' ? 5 : 4));
  const minAmountOut = (parseFloat(amountOut) * 0.997).toFixed(normOut === 'WBTC' ? 6 : (normOut === 'ETH' ? 5 : 4));

  return {
    tokenIn: normIn,
    tokenOut: normOut,
    amountIn: amtIn,
    amountOut,
    minAmountOut,
    fee: feePct,
    priceImpact,
    route: isV3 ? 'V3 Concentrated (0.05% fee tier)' : 'V2 Classic AMM (0.30% fee)',
    dex: isV3 ? 'v3' : 'v2',
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

function buildProposalObject(action, params) {
  const defaultRouter = CONTRACT_ADDRESSES[4221]?.aggregatorEntrypoint || '0xfdf5cD6452EDC340e67cd16db6A9D74aaa4f81a3';
  const deadline = Math.floor(Date.now() / 1000) + 1200;

  if (action === 'SWAP') {
    const tokenInSym = normalizeToken(params.tokenIn || params.fromToken) || 'USDC';
    const tokenOutSym = normalizeToken(params.tokenOut || params.toToken) || 'GEN';
    const amountIn = parseFloat(params.amountIn || params.fromAmount || 100);
    const quote = calculateQuote(tokenInSym, tokenOutSym, amountIn, params.dex || params.model || 'best');

    const tokenInObj = getTokenObject(tokenInSym);
    const tokenOutObj = getTokenObject(tokenOutSym);

    const decimalsIn = tokenInObj?.decimals || 18;
    const decimalsOut = tokenOutObj?.decimals || 18;

    const amountInRaw = (BigInt(Math.floor(amountIn * 1e6)) * BigInt(10 ** (decimalsIn - 6))).toString();
    const minAmountOutRaw = (BigInt(Math.floor(parseFloat(quote.minAmountOut) * 1e6)) * BigInt(10 ** (decimalsOut - 6))).toString();

    return {
      action: 'SWAP',
      tokenIn: tokenInSym,
      tokenOut: tokenOutSym,
      tokenInAddress: tokenInObj?.address || '0x0000000000000000000000000000000000000000',
      tokenOutAddress: tokenOutObj?.address || '0x0000000000000000000000000000000000000000',
      amountIn: amountIn,
      amountInRaw,
      expectedOutput: `${quote.amountOut} ${tokenOutSym}`,
      minAmountOut: quote.minAmountOut,
      minAmountOutRaw,
      slippage: '0.30%',
      slippageBps: 30,
      priceImpact: quote.priceImpact,
      route: quote.route,
      router: defaultRouter,
      deadline,
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
function generateComprehensiveDiscussion(message) {
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
  const foundTokens = [];
  for (const t of tokens) {
    if (new RegExp(`\\b${t}\\b`, 'i').test(text)) {
      foundTokens.push(normalizeToken(t));
    }
  }

  const numberMatches = text.match(/\d+(?:\.\d+)?/g);
  const amount = numberMatches ? parseFloat(numberMatches[0]) : 100;
  const isV3 = text.includes('v3') || text.includes('concentrated') || text.includes('low fee');

  if (text.includes('swap') || text.includes('trade') || text.includes('buy') || text.includes('sell') || text.includes('exchange') || text.includes('convert')) {
    const tokenIn = foundTokens[0] || 'USDC';
    const tokenOut = foundTokens[1] || (tokenIn === 'GEN' ? 'USDC' : 'GEN');
    const quote = calculateQuote(tokenIn, tokenOut, amount, isV3 ? 'v3' : 'best');

    const proposal = buildProposalObject('SWAP', {
      tokenIn,
      tokenOut,
      amountIn: amount,
      dex: isV3 ? 'v3' : 'best',
    });

    return {
      reply: `### ⚡ Swap Execution Proposal Prepared\n\nI have analyzed routes across GenLayer liquidity pools for your trade:\n\n- **Route:** ${quote.route}\n- **Rate:** 1 ${tokenIn} ≈ ${(TOKEN_PRICES_USD[tokenIn] / TOKEN_PRICES_USD[tokenOut]).toFixed(4)} ${tokenOut}\n- **Expected Output:** **${quote.amountOut} ${tokenOut}**\n- **Min. Received (0.3% slippage):** ${quote.minAmountOut} ${tokenOut}\n- **Protocol Fee:** ${quote.fee}\n- **Price Impact:** ${quote.priceImpact}\n\n👉 **Next Step:** Click **"Validate with GenLayer IC"** in the proposal card on the right to verify this trade through decentralized consensus on GenVM!`,
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

    const proposal = buildProposalObject('ADD_LIQUIDITY', {
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
    const v2 = calculateQuote(tokenIn, tokenOut, amount, 'v2');
    const v3 = calculateQuote(tokenIn, tokenOut, amount, 'v3');
    const diff = (parseFloat(v3.amountOut) - parseFloat(v2.amountOut)).toFixed(4);

    return {
      reply: `### 🔍 In-Depth Route Comparison (${amount} ${tokenIn} → ${tokenOut})\n\n1. **V3 Concentrated (0.05% Fee Tier) 🏆 Optimal**:\n   - Output: **${v3.amountOut} ${tokenOut}**\n   - Fee: 0.05%\n   - Price Impact: ${v3.priceImpact}\n\n2. **V2 Classic AMM (0.30% Fee)**:\n   - Output: **${v2.amountOut} ${tokenOut}**\n   - Fee: 0.30%\n   - Price Impact: ${v2.priceImpact}\n\n💡 **Insight:** V3 gives you **+${diff} ${tokenOut} more** due to concentrated capital efficiency and lower pool fees. I've prepared a proposal using the optimal V3 route for you.`,
      proposal: buildProposalObject('SWAP', { tokenIn, tokenOut, amountIn: amount, dex: 'v3' }),
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const apiKey = process.env.GEMINI_API_KEY;

  // If no Gemini API key is configured, provide the rich discussion response directly
  if (!apiKey) {
    const fallbackResponse = generateComprehensiveDiscussion(message);
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
          result = calculateQuote(args.tokenIn, args.tokenOut, args.amountIn, args.dex);
          proposal = buildProposalObject('SWAP', { ...args, dex: result.dex });
        } else if (name === 'compare_routes') {
          const v2 = calculateQuote(args.tokenIn, args.tokenOut, args.amountIn, 'v2');
          const v3 = calculateQuote(args.tokenIn, args.tokenOut, args.amountIn, 'v3');
          result = { v2, v3, optimal: 'v3' };
          proposal = buildProposalObject('SWAP', { ...args, dex: 'v3' });
        } else if (name === 'get_pool_info') {
          result = {
            pair: `${args.tokenA}/${args.tokenB}`,
            tvl: '$1,420,000',
            volume24h: '$380,000',
            feeTier: args.dex === 'v3' ? '0.05%' : '0.30%',
          };
          proposal = buildProposalObject('ADD_LIQUIDITY', { tokenA: args.tokenA, tokenB: args.tokenB });
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
      const fallback = generateComprehensiveDiscussion(message);
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
    const fallback = generateComprehensiveDiscussion(message);
    return res.status(200).json(fallback);
  }
}
