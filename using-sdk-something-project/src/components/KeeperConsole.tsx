import React, { useRef, useEffect } from 'react';
import { Terminal, Trash2, Pause, Play, Shield, ArrowUpRight } from 'lucide-react';
import { KeeperLog } from '@/types/order';

interface KeeperConsoleProps {
  logs: KeeperLog[];
  onClearLogs: () => void;
  isKeeperRunning: boolean;
  onToggleKeeper: () => void;
}

export const KeeperConsole: React.FC<KeeperConsoleProps> = ({
  logs,
  onClearLogs,
  isKeeperRunning,
  onToggleKeeper,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogBadge = (level: KeeperLog['level']) => {
    switch (level) {
      case 'success':
        return <span className="text-emerald-400 font-semibold">[SUCCESS]</span>;
      case 'warn':
        return <span className="text-amber-400 font-semibold">[WARN]</span>;
      case 'error':
        return <span className="text-rose-400 font-semibold">[ERROR]</span>;
      case 'pulse':
        return <span className="text-cyan-400 font-semibold">[PULSE]</span>;
      default:
        return <span className="text-blue-400 font-semibold">[INFO]</span>;
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-5 border border-white/5 flex flex-col h-[400px]">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs">
            <Terminal className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-base font-semibold text-white">Keeper Engine Live Stream</h2>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleKeeper}
            className="p-1.5 rounded-lg bg-surface-100 hover:bg-surface-50 text-slate-300 hover:text-white border border-white/5 text-xs flex items-center gap-1 transition-colors"
          >
            {isKeeperRunning ? (
              <>
                <Pause className="w-3 h-3 text-amber-400" />
                <span className="text-[11px]">Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 text-emerald-400" />
                <span className="text-[11px]">Resume</span>
              </>
            )}
          </button>

          <button
            onClick={onClearLogs}
            className="p-1.5 rounded-lg bg-surface-100 hover:bg-surface-50 text-slate-400 hover:text-rose-300 border border-white/5 text-xs transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal window */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-y-auto bg-surface-300/90 rounded-xl p-3.5 font-mono text-[11px] leading-relaxed border border-white/5 terminal-glow space-y-1.5 select-text"
      >
        {logs.length === 0 ? (
          <div className="text-slate-500 py-6 text-center">
            Keeper engine initialized. Waiting for heartbeat tick...
          </div>
        ) : (
          logs.map((log) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString();
            return (
              <div key={log.id} className="flex items-start gap-2 text-slate-300 hover:bg-white/[0.02] p-0.5 rounded">
                <span className="text-slate-600 shrink-0 select-none">[{timeStr}]</span>
                <span className="shrink-0">{getLogBadge(log.level)}</span>
                <span className="break-all text-slate-200">{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
