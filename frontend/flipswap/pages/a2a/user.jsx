// pages/a2a/user.jsx
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, Bot, Zap } from 'lucide-react';
import AgentStatusPills from '../../components/A2A/AgentStatusPills';
import SwarmWarRoom from '../../components/A2A/SwarmWarRoom';
import styles from '../../styles/A2A.module.css';

export default function A2AUserPage() {
  return (
    <>
      <Head>
        <title>A2A Trader Swarm | Soyara DEX</title>
      </Head>

      <main className={styles.container}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Link href="/a2a" className={styles.chip} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={13} /> Portal
            </Link>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: 'var(--text-main, #ffffff)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bot size={20} color="var(--blue-primary, #0284c7)" /> Trader Swarm Hub
            </h1>
          </div>

          <Link href="/a2a/dev" className={styles.chip}>
            Switch to Dev Lab ➔
          </Link>
        </div>

        {/* Live Agent Heartbeat */}
        <AgentStatusPills />

        {/* Swarm War-Room */}
        <SwarmWarRoom mode="user" />
      </main>
    </>
  );
}
