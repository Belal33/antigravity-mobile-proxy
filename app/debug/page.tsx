'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface WindowInfo {
  index: number;
  title: string;
  url: string;
  active: boolean;
}

interface ScrapeResult {
  raw: string;
  parsed: {
    isRunning: boolean;
    turnCount: number;
    stepGroupCount: number;
    thinking: { time: string }[];
    toolCalls: any[];
    responses: string[];
    notifications: string[];
    error: string | null;
    fileChanges: { fileName: string; type: string }[];
    lastTurnResponseHTML: string;
  };
  meta: {
    timestamp: string;
    activeWindowIdx: number;
    turnCount: number;
    toolCallCount: number;
    responseCount: number;
  };
}

export default function DebugPage() {
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'raw' | 'parsed' | 'response'>('parsed');

  const loadWindows = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/windows');
      const data = await res.json();
      setWindows(data.windows || []);
      const active = data.windows?.find((w: WindowInfo) => w.active);
      if (active) setSelectedIdx(active.index);
    } catch (e: any) {
      setError('Failed to load windows: ' + e.message);
    }
  }, []);

  useEffect(() => { loadWindows(); }, [loadWindows]);

  const selectWindow = async (idx: number) => {
    setSelectedIdx(idx);
    setError('');
    try {
      await fetch('/api/v1/windows/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx }),
      });
      await loadWindows();
    } catch (e: any) {
      setError('Failed to select window: ' + e.message);
    }
  };

  const scrape = async () => {
    setLoading(true);
    setError('');
    setScrapeResult(null);
    try {
      const res = await fetch('/api/v1/debug/scrape');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setScrapeResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <Link href="/" style={styles.backLink}>← Chat</Link>
          <h1 style={styles.title}>🔬 Scraper Debug</h1>
        </div>
        <span style={styles.badge}>Debug Tool</span>
      </header>

      {/* Window Selector */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>1. Select Window</h2>
        <div style={styles.windowGrid}>
          {windows.map((w) => (
            <button
              key={w.index}
              style={{
                ...styles.windowCard,
                ...(selectedIdx === w.index ? styles.windowCardActive : {}),
              }}
              onClick={() => selectWindow(w.index)}
            >
              <div style={windowDotStyle(selectedIdx === w.index)} />
              <div style={styles.windowInfo}>
                <span style={styles.windowTitle}>{w.title || `Window ${w.index}`}</span>
                <span style={styles.windowUrl}>{w.url?.substring(0, 60)}</span>
              </div>
              {selectedIdx === w.index && <span style={styles.activeBadge}>Active</span>}
            </button>
          ))}
          {windows.length === 0 && (
            <div style={styles.emptyState}>No Antigravity windows found. Is the IDE running?</div>
          )}
        </div>
      </section>

      {/* Scrape Button */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>2. Scrape Last Agent Response</h2>
        <button style={styles.scrapeBtn} onClick={scrape} disabled={loading || selectedIdx === null}>
          {loading ? '⏳ Scraping...' : '🔍 Scrape Now'}
        </button>
        {error && <div style={styles.errorBox}>⚠️ {error}</div>}
      </section>

      {/* Results */}
      {scrapeResult && (
        <section style={{ ...styles.section, flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' }}>
          {/* Meta Stats */}
          <div style={styles.metaBar}>
            <span>⏱ {scrapeResult.meta.timestamp}</span>
            <span>🔄 Turns: {scrapeResult.meta.turnCount}</span>
            <span>🔧 Tools: {scrapeResult.meta.toolCallCount}</span>
            <span>💬 Responses: {scrapeResult.meta.responseCount}</span>
            <span>{scrapeResult.parsed.isRunning ? '🟢 Running' : '⚪ Idle'}</span>
          </div>

          {/* Tabs */}
          <div style={styles.tabs}>
            <button style={{ ...styles.tab, ...(activeTab === 'parsed' ? styles.tabActive : {}) }} onClick={() => setActiveTab('parsed')}>
              Parsed State
            </button>
            <button style={{ ...styles.tab, ...(activeTab === 'response' ? styles.tabActive : {}) }} onClick={() => setActiveTab('response')}>
              Rendered Response
            </button>
            <button style={{ ...styles.tab, ...(activeTab === 'raw' ? styles.tabActive : {}) }} onClick={() => setActiveTab('raw')}>
              Raw HTML
            </button>
          </div>

          {/* Tab Content */}
          <div style={styles.tabContent}>
            {activeTab === 'parsed' && (
              <div style={styles.jsonView}>
                <pre style={styles.pre}>{JSON.stringify(scrapeResult.parsed, null, 2)}</pre>
              </div>
            )}
            {activeTab === 'response' && (
              <div style={styles.renderedView}>
                {scrapeResult.parsed.responses.length > 0 ? (
                  scrapeResult.parsed.responses.map((html, i) => (
                    <div key={i} style={styles.responseBlock}>
                      <div style={styles.responseLabel}>Response #{i}</div>
                      <div className="agent-response" dangerouslySetInnerHTML={{ __html: html }} />
                    </div>
                  ))
                ) : (
                  <div style={styles.emptyState}>No responses scraped from the agent panel.</div>
                )}
              </div>
            )}
            {activeTab === 'raw' && (
              <div style={styles.rawView}>
                <pre style={styles.pre}>{scrapeResult.raw}</pre>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/* ── Inline Styles ── */
const windowDotStyle = (active: boolean): React.CSSProperties => ({ width: '8px', height: '8px', borderRadius: '50%', background: active ? '#34d399' : '#686888', boxShadow: active ? '0 0 8px rgba(52, 211, 153, 0.4)' : 'none', flexShrink: 0 });

const styles: Record<string, React.CSSProperties> = {
  page: { display: 'flex', flexDirection: 'column', height: '100vh', maxWidth: '1100px', margin: '0 auto', padding: '0 16px', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  backLink: { color: '#6366f1', textDecoration: 'none', fontSize: '13px', fontWeight: 500 },
  title: { fontSize: '20px', fontWeight: 700 },
  badge: { fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: '#686888', border: '1px solid rgba(255,255,255,0.06)', padding: '4px 10px', borderRadius: '12px' },
  section: { padding: '16px 0' },
  sectionTitle: { fontSize: '14px', fontWeight: 600, color: '#9898b0', marginBottom: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  windowGrid: { display: 'flex', flexDirection: 'column' as const, gap: '8px' },
  windowCard: { display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '12px 16px', background: '#12121a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s ease', textAlign: 'left' as const, color: '#9898b0', fontFamily: 'inherit', fontSize: '13px' },
  windowCardActive: { borderColor: 'rgba(99, 102, 241, 0.4)', background: 'rgba(99, 102, 241, 0.06)', color: '#e8e8f0' },
  windowInfo: { flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '2px', overflow: 'hidden' },
  windowTitle: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  windowUrl: { fontSize: '10px', color: '#686888', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  activeBadge: { fontSize: '10px', color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '2px 8px', borderRadius: '8px', fontWeight: 600, flexShrink: 0 },
  scrapeBtn: { padding: '10px 24px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease', fontFamily: 'inherit' },
  errorBox: { marginTop: '12px', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', color: '#ef4444', fontSize: '13px' },
  metaBar: { display: 'flex', gap: '16px', flexWrap: 'wrap' as const, padding: '10px 14px', background: '#12121a', borderRadius: '8px', fontSize: '11px', color: '#9898b0', fontFamily: "'JetBrains Mono', monospace", marginBottom: '12px' },
  tabs: { display: 'flex', gap: '4px', marginBottom: '12px' },
  tab: { padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', background: 'transparent', color: '#9898b0', fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease' },
  tabActive: { background: 'rgba(99, 102, 241, 0.1)', borderColor: 'rgba(99, 102, 241, 0.4)', color: '#e8e8f0' },
  tabContent: { flex: 1, overflow: 'auto', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', background: '#0d0d14' },
  jsonView: { padding: '16px' },
  rawView: { padding: '16px' },
  renderedView: { padding: '16px' },
  pre: { margin: 0, fontSize: '12px', lineHeight: 1.6, color: '#9898b0', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const },
  responseBlock: { padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.04)' },
  responseLabel: { fontSize: '10px', color: '#686888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '8px', fontWeight: 600 },
  emptyState: { textAlign: 'center' as const, padding: '32px', color: '#686888', fontSize: '13px' },
};
