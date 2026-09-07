'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navbar } from '@/components/Navbar';
import { StatsOverview } from '@/components/StatsOverview';
import { IntentInput } from '@/components/IntentInput';
import { ActiveOrders } from '@/components/ActiveOrders';
import { KeeperConsole } from '@/components/KeeperConsole';
import { RouteSimulator } from '@/components/RouteSimulator';
import { DocsModal } from '@/components/DocsModal';
import { INITIAL_ORDERS } from '@/lib/mockData';
import { IntentOrder, KeeperLog } from '@/types/order';
import { evaluateOrder, simulateConsensusValidation } from '@/lib/keeper';

export default function Home() {
  const [orders, setOrders] = useState<IntentOrder[]>(INITIAL_ORDERS);
  const [logs, setLogs] = useState<KeeperLog[]>([]);
  const [isKeeperRunning, setIsKeeperRunning] = useState(true);
  const [pulseCount, setPulseCount] = useState(0);
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  // Helper to append a log entry
  const addLog = useCallback((message: string, level: KeeperLog['level'] = 'info', orderId?: string) => {
    const newLog: KeeperLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      level,
      orderId,
      message,
    };
    setLogs((prev) => [...prev.slice(-100), newLog]);
  }, []);

  // Initial welcome logs
  useEffect(() => {
    addLog('⚡ Soyara Intent-Based Keeper Daemon initialized.', 'success');
    addLog('🔗 Connected to GenLayer Bradbury Testnet (Chain ID: 4221).', 'info');
    addLog('🛡️  AgentValidator Intelligent Contract: 0x7ABa94668afC24463Be323f9bB65BD4b4F480d89', 'info');
  }, [addLog]);

  // Keep a ref to orders so the interval has access to the latest state without tearing down the timer
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const handlePulse = useCallback(async () => {
    if (!isKeeperRunning) return;

    setPulseCount((c) => c + 1);
    const activeList = ordersRef.current.filter((o) => o.status === 'PENDING' || o.status === 'EVALUATING');

    if (activeList.length === 0) {
      addLog(`Pulse #${pulseCount + 1}: Keeper idle — 0 pending orders.`, 'pulse');
      return;
    }

    addLog(`Pulse #${pulseCount + 1}: Evaluating ${activeList.length} intent order(s)...`, 'pulse');

    for (const order of activeList) {
      try {
        const evalRes = await evaluateOrder(order);

        if (evalRes.error) {
          addLog(`[${order.tokenIn}→${order.tokenOut}] ${evalRes.error}`, 'warn', order.id);
          continue;
        }

        // Update live route and rate info
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  currentRate: evalRes.currentRate,
                  bestRoute: evalRes.routeInfo
                    ? {
                        dex: evalRes.routeInfo.dex,
                        isMultiHop: evalRes.routeInfo.isMultiHop,
                        hopsSummary: evalRes.routeInfo.hopsSummary,
                        amountOutFormatted: evalRes.routeInfo.amountOutFormatted,
                        priceImpactPct: evalRes.routeInfo.priceImpactPct,
                      }
                    : o.bestRoute,
                }
              : o
          )
        );

        addLog(
          `[${order.tokenIn}→${order.tokenOut}] Rate: ${evalRes.currentRate.toFixed(4)} | Target: ${order.condition.targetRate} | Route: ${evalRes.routeInfo?.dex.toUpperCase()} (${evalRes.routeInfo?.isMultiHop ? '2-hop' : 'direct'})`,
          'info',
          order.id
        );

        // Check if condition triggered
        if (evalRes.triggered && order.status === 'PENDING') {
          addLog(`🎯 TRIGGER HIT for order [${order.tokenIn}→${order.tokenOut}]! Condition met.`, 'success', order.id);

          // Transition to TRIGGERED & VALIDATING
          setOrders((prev) =>
            prev.map((o) => (o.id === order.id ? { ...o, status: 'VALIDATING' } : o))
          );

          addLog(`🛡️ Submitting proposal to GenLayer AgentValidator Intelligent Contract...`, 'info', order.id);

          // Run consensus round
          const consensusRes = await simulateConsensusValidation(order, evalRes.routeInfo);

          if (consensusRes.approved) {
            addLog(
              `✅ GenVM AI Consensus APPROVED (VRF round ${consensusRes.proposalId.slice(0, 10)}...).`,
              'success',
              order.id
            );

            // Execute settlement
            addLog(`⚡ Executing AGGFlow settlement on EVM AgentExecutor...`, 'info', order.id);
            await new Promise((r) => setTimeout(r, 1000));

            const txHash = `0x${Array.from({ length: 64 }, () =>
              Math.floor(Math.random() * 16).toString(16)
            ).join('')}`;

            setOrders((prev) =>
              prev.map((o) =>
                o.id === order.id
                  ? {
                      ...o,
                      status: 'EXECUTED',
                      validationStatus: {
                        approved: true,
                        phase: consensusRes.phase,
                        proposalId: consensusRes.proposalId,
                        txHash: consensusRes.txHash,
                      },
                      executionReceipt: {
                        txHash,
                        timestamp: Date.now(),
                        amountOut: evalRes.routeInfo?.amountOutFormatted || String(order.amountIn),
                      },
                    }
                  : o
              )
            );

            addLog(`🎉 Trade settled on-chain! Output: +${evalRes.routeInfo?.amountOutFormatted} ${order.tokenOut} (Tx: ${txHash.slice(0, 12)}...)`, 'success', order.id);
          } else {
            addLog(`❌ Consensus rejected: ${consensusRes.reason}`, 'error', order.id);
            setOrders((prev) =>
              prev.map((o) =>
                o.id === order.id
                  ? {
                      ...o,
                      status: 'FAILED',
                      error: consensusRes.reason,
                    }
                  : o
              )
            );
          }
        }
      } catch (err: any) {
        addLog(`Error evaluating order ${order.id}: ${err?.message}`, 'error', order.id);
      }
    }
  }, [isKeeperRunning, pulseCount, addLog]);

  // Keeper heartbeat interval (every 4 seconds)
  useEffect(() => {
    if (!isKeeperRunning) return;
    const interval = setInterval(handlePulse, 4000);
    return () => clearInterval(interval);
  }, [isKeeperRunning, handlePulse]);

  // Order management handlers
  const handleAddOrder = (newOrder: IntentOrder) => {
    setOrders((prev) => [newOrder, ...prev]);
    addLog(
      `➕ Registered new intent order [${newOrder.tokenIn}→${newOrder.tokenOut}] (${newOrder.type}): ${newOrder.condition.conditionDescription}`,
      'success',
      newOrder.id
    );
  };

  const handleCancelOrder = (id: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
    addLog(`🗑️ Cancelled order ${id}`, 'warn', id);
  };

  const handleManualTrigger = async (id: string) => {
    const targetOrder = orders.find((o) => o.id === id);
    if (!targetOrder) return;

    addLog(`⚡ Force-triggering order ${id}...`, 'info', id);
    const evalRes = await evaluateOrder(targetOrder);

    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: 'VALIDATING' } : o))
    );

    const consensusRes = await simulateConsensusValidation(targetOrder, evalRes.routeInfo);

    if (consensusRes.approved) {
      addLog(`✅ Consensus Approved for force-triggered order ${id}`, 'success', id);
      const txHash = `0x${Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}`;

      setOrders((prev) =>
        prev.map((o) =>
          o.id === id
            ? {
                ...o,
                status: 'EXECUTED',
                validationStatus: {
                  approved: true,
                  phase: consensusRes.phase,
                  proposalId: consensusRes.proposalId,
                },
                executionReceipt: {
                  txHash,
                  timestamp: Date.now(),
                  amountOut: evalRes.routeInfo?.amountOutFormatted || String(targetOrder.amountIn),
                },
              }
            : o
        )
      );
      addLog(`🎉 Force-trigger settled! Tx: ${txHash.slice(0, 14)}...`, 'success', id);
    }
  };

  const handleRefreshOrder = async (id: string) => {
    const targetOrder = orders.find((o) => o.id === id);
    if (!targetOrder) return;
    const evalRes = await evaluateOrder(targetOrder);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              currentRate: evalRes.currentRate,
              bestRoute: evalRes.routeInfo
                ? {
                    dex: evalRes.routeInfo.dex,
                    isMultiHop: evalRes.routeInfo.isMultiHop,
                    hopsSummary: evalRes.routeInfo.hopsSummary,
                    amountOutFormatted: evalRes.routeInfo.amountOutFormatted,
                    priceImpactPct: evalRes.routeInfo.priceImpactPct,
                  }
                : o.bestRoute,
            }
          : o
      )
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navbar */}
      <Navbar
        onOpenDocs={() => setIsDocsOpen(true)}
        isKeeperRunning={isKeeperRunning}
        onToggleKeeper={() => setIsKeeperRunning((p) => !p)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-6 space-y-6">
        {/* Metric Stats Header */}
        <StatsOverview
          orders={orders}
          isKeeperRunning={isKeeperRunning}
          pulseCount={pulseCount}
        />

        {/* Natural Language Intent & Condition Input */}
        <IntentInput onAddOrder={handleAddOrder} />

        {/* Two-Column Grid: Active Orders & Live Keeper Console */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <ActiveOrders
              orders={orders}
              onCancelOrder={handleCancelOrder}
              onManualTrigger={handleManualTrigger}
              onRefreshOrder={handleRefreshOrder}
            />
          </div>

          <div className="lg:col-span-5 space-y-6">
            <KeeperConsole
              logs={logs}
              onClearLogs={() => setLogs([])}
              isKeeperRunning={isKeeperRunning}
              onToggleKeeper={() => setIsKeeperRunning((p) => !p)}
            />

            <RouteSimulator />
          </div>
        </div>
      </main>

      {/* Comprehensive Docs Modal */}
      <DocsModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />

      {/* Footer */}
      <footer className="border-t border-white/5 py-4 px-6 text-center text-xs text-slate-500 font-mono">
        Soyara DEX SDK • GenLayer Bradbury Testnet (4221) • Viem Aggregator
      </footer>
    </div>
  );
}
