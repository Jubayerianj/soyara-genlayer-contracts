import { buildMultiHopProgram } from './utils/programBuilder.js';
import { quoteBestRouteMultiHop } from './lib/dexQuote.js';
const B='http://localhost:3000', USER='0x23D542DCEFb00b1f4268E67a0EC1EF4de0A58fe2';
const USDC='0x58B6CD7891cd0A682226E25607b958a6479195A6', USDT='0x4B54235778c26Ee8ac27744A53d4c5BC4c9D46fc';
const WGEN='0x315374AA9b5536037Cc1Efeea2439CCC0913A77e';
const t0=Date.now(), el=()=>((Date.now()-t0)/1000).toFixed(0)+'s';
const p=(await (await fetch(B+'/api/agent-v2',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({message:'Swap 2 USDC to USDT',history:[]})})).json()).proposal;
const q=await quoteBestRouteMultiHop(USDC,USDT,BigInt(p.amountInRaw),'best');
const prog=buildMultiHopProgram({address:USDC,isNative:false},{address:USDT,isNative:false},q.hops,WGEN);
const neg=await fetch(B+'/api/agent-execute',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({user:USER,tokenIn:USDC,tokenOut:USDT,amountIn:p.amountInRaw,minAmountOut:'1',
    slippageBps:100,deadline:p.deadline,aggProgram:prog,proposalId:'FABRICATED',validationApproved:true})});
const nj=await neg.json();
console.log(`[1] fabricated verdict -> HTTP ${neg.status} notValidated=${nj.notValidated||false}`);
let v=await (await fetch(B+'/api/genlayer-validate',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({...p,user:USER})})).json();
let pid=v.proposal_id,n=0;
while((v.pending||v.retryable)&&n<45){
  await new Promise(r=>setTimeout(r,n<6?2000:4000)); n++;
  v=await (await fetch(B+'/api/genlayer-validate',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({checkTxHash:v.tx_hash,proposalId:pid})})).json();
  pid=v.proposal_id||pid;
}
console.log(`[2] consensus write -> approved=${v.approved} (${el()})`);
if(!v.approved){console.log('    '+(v.reason||'').slice(0,130));process.exit(0);}
const r=await fetch(B+'/api/agent-execute',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({user:USER,tokenIn:USDC,tokenOut:USDT,amountIn:p.amountInRaw,minAmountOut:p.minAmountOutRaw,
    slippageBps:p.slippageBps,deadline:p.deadline,aggProgram:prog,proposalId:pid,validationApproved:true})});
const s=await r.json();
console.log(`[3] settled via AgentExecutor -> HTTP ${r.status} success=${s.success}`);
console.log(`    verifiedVia ${JSON.stringify(s.verifiedVia)}`);
console.log(`    ${s.success?'tx '+s.execTxHash:(s.error||'').slice(0,160)}`);
process.exit(0);
