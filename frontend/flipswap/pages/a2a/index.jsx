// pages/a2a/index.jsx
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowRight, Bot, Terminal, Zap, ShieldCheck } from 'lucide-react';
import styles from '../../styles/A2A.module.css';

export default function A2APortalGateway() {
  return (
    <>
      <Head>
        <title>A2A Mesh Network | Soyara DEX</title>
      </Head>

      <main className={styles.container}>
        <section className={styles.heroHeader}>
          <div className={styles.heroTag}>
            <Zap size={13} />
            <span>GenLayer A2A Swarm Mesh</span>
          </div>
          <h1 className={styles.heroTitle}>Select Your Agent Portal</h1>
          <p className={styles.heroSubtitle}>
            Zero API keys. 100% decentralized AI consensus on GenLayer GenVM.
          </p>
        </section>

        <div className={styles.gatewayGrid}>
          {/* User Portal */}
          <Link href="/a2a/user" className={styles.portalCard}>
            <div>
              <div className={styles.portalIcon} style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}>
                <Bot size={26} />
              </div>
              <h2 className={styles.portalTitle}>Trader Swarm</h2>
              <p className={styles.portalDesc}>
                Conversational DeFi trading. 4 autonomous agents simulate V2/V3 liquidity, validate GenVM consensus, and execute non-custodial swaps.
              </p>
            </div>
            <div className={styles.portalAction} style={{ color: '#38bdf8' }}>
              <span>Launch Trader Terminal</span>
              <ArrowRight size={16} />
            </div>
          </Link>

          {/* Dev Portal */}
          <Link href="/a2a/dev" className={`${styles.portalCard} ${styles.portalCardDev}`}>
            <div>
              <div className={styles.portalIcon} style={{ background: 'rgba(244, 114, 182, 0.12)', color: '#f472b6' }}>
                <Terminal size={26} />
              </div>
              <h2 className={styles.portalTitle}>Developer & Security Lab</h2>
              <p className={styles.portalDesc}>
                Security testing sandbox. Dissect calldata bytecode, test parameter tamper rejection, and verify cryptographic settlement hashes.
              </p>
            </div>
            <div className={styles.portalAction} style={{ color: '#f472b6' }}>
              <span>Open Security Sandbox</span>
              <ArrowRight size={16} />
            </div>
          </Link>
        </div>
      </main>
    </>
  );
}
