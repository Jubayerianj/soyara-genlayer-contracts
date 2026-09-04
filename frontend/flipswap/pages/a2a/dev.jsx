// pages/a2a/dev.jsx
import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, Terminal, ShieldAlert, Zap, Boxes } from 'lucide-react';
import AgentStatusPills from '../../components/A2A/AgentStatusPills';
import SwarmWarRoom from '../../components/A2A/SwarmWarRoom';
import DevSecuritySandbox from '../../components/A2A/DevSecuritySandbox';
import AgentPlayground from '../../components/A2A/AgentPlayground';
import styles from '../../styles/A2A.module.css';

export default function A2ADevPage() {
  const [tab, setTab] = useState('studio'); // 'studio' | 'sandbox' | 'swarm'

  return (
    <>
      <Head>
        <title>A2A Agent Studio | Soyara DEX</title>
      </Head>

      <main className={styles.container}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Link href="/a2a" className={styles.chip} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={13} /> Portal
            </Link>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: 'var(--text-main, #ffffff)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Terminal size={20} color="var(--blue-primary, #0284c7)" /> A2A Agent Studio
            </h1>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setTab('studio')}
              className={styles.chip}
              style={{
                borderColor: tab === 'studio' ? 'var(--blue-primary, #0284c7)' : undefined,
                color: tab === 'studio' ? 'var(--blue-primary, #0284c7)' : undefined,
                fontWeight: 600
              }}
            >
              <Boxes size={13} style={{ verticalAlign: '-2px', marginRight: 3 }} /> Agent Studio
            </button>
            <button
              type="button"
              onClick={() => setTab('sandbox')}
              className={styles.chip}
              style={{
                borderColor: tab === 'sandbox' ? 'var(--blue-primary, #0284c7)' : undefined,
                color: tab === 'sandbox' ? 'var(--blue-primary, #0284c7)' : undefined,
                fontWeight: 600
              }}
            >
              🔒 Tamper Sandbox
            </button>
            <button
              type="button"
              onClick={() => setTab('swarm')}
              className={styles.chip}
              style={{
                borderColor: tab === 'swarm' ? 'var(--blue-primary, #0284c7)' : undefined,
                color: tab === 'swarm' ? 'var(--blue-primary, #0284c7)' : undefined,
                fontWeight: 600
              }}
            >
              ⚡ Swarm Inspector
            </button>
            <Link href="/a2a/user" className={styles.chip}>
              Trader Mode ➔
            </Link>
          </div>
        </div>

        {/* Live Heartbeat */}
        <AgentStatusPills />

        {/* Tab Content */}
        {tab === 'studio' && <AgentPlayground />}
        {tab === 'sandbox' && <DevSecuritySandbox />}
        {tab === 'swarm' && <SwarmWarRoom mode="dev" />}
      </main>
    </>
  );
}
