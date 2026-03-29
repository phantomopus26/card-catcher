import React, { useState, useEffect, useCallback } from 'react';
import type { HandRecord } from '../../shared/types';
import { calculateEquity, parseCards, type EquityResult } from '../utils/poker-eval';
import { HandCard } from '../components/HandCard';

// ============================================================
//  Coach Page — Equity Calculator, Pinned Hands, GTO Coach
// ============================================================

export function Coach() {
  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
    }}>
      <EquityCalculator />
      <PinnedHandsArchive />
      <GTOCoachBot />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
//  1. Equity Calculator
// ──────────────────────────────────────────────────────────────

function EquityCalculator() {
  const [range1, setRange1] = useState('');
  const [range2, setRange2] = useState('');
  const [boardStr, setBoardStr] = useState('');
  const [result, setResult] = useState<EquityResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');

  const runCalc = useCallback(() => {
    setError('');
    setCalculating(true);
    // Run in a setTimeout so the UI can update with "Calculating..."
    setTimeout(() => {
      try {
        const board = parseCards(boardStr);
        if (board.length > 5) {
          setError('Board cannot have more than 5 cards');
          setCalculating(false);
          return;
        }
        const res = calculateEquity(range1, range2, board, 10000);
        setResult(res);
      } catch (e: any) {
        setError(e.message || 'Calculation error');
      }
      setCalculating(false);
    }, 10);
  }, [range1, range2, boardStr]);

  const inputStyle: React.CSSProperties = {
    background: '#12122a',
    border: '1px solid #2a2a45',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#e0e0e0',
    fontFamily: 'Consolas, Monaco, monospace',
    outline: 'none',
    flex: 1,
    minWidth: 0,
    transition: 'border-color 0.15s ease',
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0d0d18 0%, #12122a 100%)',
      border: '1px solid #1e1e35',
      borderRadius: '10px',
      padding: '18px 20px',
    }}>
      <SectionTitle>Equity Calculator</SectionTitle>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Player inputs */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: '#888', width: '60px', flexShrink: 0 }}>Player 1</label>
          <input
            style={inputStyle}
            value={range1}
            onChange={e => setRange1(e.target.value)}
            placeholder='e.g. AKs, QQ+, 22-55'
            onFocus={e => e.currentTarget.style.borderColor = '#8b5cf6'}
            onBlur={e => e.currentTarget.style.borderColor = '#2a2a45'}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: '#888', width: '60px', flexShrink: 0 }}>Player 2</label>
          <input
            style={inputStyle}
            value={range2}
            onChange={e => setRange2(e.target.value)}
            placeholder='e.g. JJ, AQo+'
            onFocus={e => e.currentTarget.style.borderColor = '#8b5cf6'}
            onBlur={e => e.currentTarget.style.borderColor = '#2a2a45'}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ fontSize: '12px', color: '#888', width: '60px', flexShrink: 0 }}>Board</label>
          <input
            style={inputStyle}
            value={boardStr}
            onChange={e => setBoardStr(e.target.value)}
            placeholder='e.g. Ah Kd 7c  (leave empty for preflop)'
            onFocus={e => e.currentTarget.style.borderColor = '#8b5cf6'}
            onBlur={e => e.currentTarget.style.borderColor = '#2a2a45'}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
          <button
            onClick={runCalc}
            disabled={calculating}
            style={{
              background: calculating ? '#4c1d95' : '#8b5cf6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: calculating ? 'wait' : 'pointer',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={e => { if (!calculating) e.currentTarget.style.background = '#7c3aed'; }}
            onMouseLeave={e => { if (!calculating) e.currentTarget.style.background = '#8b5cf6'; }}
          >
            {calculating ? 'Calculating...' : 'Calculate'}
          </button>

          {error && <span style={{ fontSize: '12px', color: '#ef4444' }}>{error}</span>}
        </div>

        {/* Results */}
        {result && !error && (
          <div style={{
            display: 'flex',
            gap: '12px',
            marginTop: '8px',
            alignItems: 'stretch',
          }}>
            <EquityBar label="Player 1" equity={result.equity1} color="#8b5cf6" />
            <EquityBar label="Tie" equity={result.ties} color="#555" />
            <EquityBar label="Player 2" equity={result.equity2} color="#3b82f6" />
          </div>
        )}
      </div>
    </div>
  );
}

function EquityBar({ label, equity, color }: { label: string; equity: number; color: string }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>{label}</div>
      <div style={{
        background: '#0a0a1a',
        borderRadius: '6px',
        height: '32px',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid #1e1e35',
      }}>
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${equity}%`,
          background: color,
          opacity: 0.3,
          borderRadius: '5px',
          transition: 'width 0.3s ease',
        }} />
        <span style={{
          position: 'relative',
          lineHeight: '32px',
          fontSize: '14px',
          fontWeight: 700,
          color: '#e0e0e0',
          fontFamily: 'Consolas, Monaco, monospace',
        }}>
          {equity.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
//  2. Pinned Hands Archive + Recent Hands
// ──────────────────────────────────────────────────────────────

function PinnedHandsArchive() {
  const [pinnedHands, setPinnedHands] = useState<HandRecord[]>([]);
  const [recentHands, setRecentHands] = useState<HandRecord[]>([]);
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async () => {
    if (!window.cardCatcher) return;
    try {
      const pinned = await window.cardCatcher.getPinnedHands();
      setPinnedHands(pinned || []);
      setPinnedIds(new Set((pinned || []).map((h: HandRecord) => h.id!).filter(Boolean)));

      const recent = await window.cardCatcher.getHandHistory({ limit: 10 });
      setRecentHands(recent || []);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePin = useCallback(async (handId: number) => {
    if (!window.cardCatcher) return;
    await window.cardCatcher.pinHand(handId);
    fetchData();
  }, [fetchData]);

  const handleUnpin = useCallback(async (handId: number) => {
    if (!window.cardCatcher) return;
    await window.cardCatcher.unpinHand(handId);
    fetchData();
  }, [fetchData]);

  return (
    <>
      {/* Pinned Hands */}
      <div style={{
        background: '#0d0d18',
        border: '1px solid #1e1e35',
        borderRadius: '10px',
        padding: '18px 20px',
      }}>
        <SectionTitle>
          Pinned Hands
          <span style={{ fontSize: '11px', color: '#555', fontWeight: 400, marginLeft: '8px' }}>
            {pinnedHands.length} hand{pinnedHands.length !== 1 ? 's' : ''}
          </span>
        </SectionTitle>

        {pinnedHands.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#555', padding: '12px 0' }}>
            No pinned hands yet. Pin interesting hands from the recent history below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {pinnedHands.map(hand => (
              <HandCard
                key={hand.id}
                hand={hand}
                isPinned={true}
                onUnpin={handleUnpin}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Hands */}
      <div style={{
        background: '#0d0d18',
        border: '1px solid #1e1e35',
        borderRadius: '10px',
        padding: '18px 20px',
      }}>
        <SectionTitle>
          Recent Hands
          <span style={{ fontSize: '11px', color: '#555', fontWeight: 400, marginLeft: '8px' }}>
            Last 10
          </span>
        </SectionTitle>

        {recentHands.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#555', padding: '12px 0' }}>
            No hand history yet. Start tracking a table to record hands.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recentHands.map(hand => (
              <HandCard
                key={hand.id}
                hand={hand}
                isPinned={pinnedIds.has(hand.id!)}
                onPin={handlePin}
                onUnpin={handleUnpin}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
//  3. GTO Coach Bot
// ──────────────────────────────────────────────────────────────

interface CoachTip {
  icon: string;
  message: string;
  severity: 'good' | 'warning' | 'info';
}

function GTOCoachBot() {
  const [tips, setTips] = useState<CoachTip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyzePlay().then(setTips).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{
      background: '#0d0d18',
      border: '1px solid #1e1e35',
      borderRadius: '10px',
      padding: '18px 20px',
    }}>
      <SectionTitle>GTO Coach</SectionTitle>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0px',
      }}>
        {loading ? (
          <div style={{ fontSize: '12px', color: '#555', padding: '12px 0' }}>Analyzing your play...</div>
        ) : tips.length === 0 ? (
          <CoachMessage
            icon={'\uD83D\uDCA1'}
            message="Not enough data to analyze yet. Play some hands and come back!"
            severity="info"
          />
        ) : (
          tips.map((tip, i) => (
            <CoachMessage key={i} {...tip} isLast={i === tips.length - 1} />
          ))
        )}
      </div>
    </div>
  );
}

function CoachMessage({ icon, message, severity, isLast }: CoachTip & { isLast?: boolean }) {
  const borderColor = severity === 'good' ? '#22c55e30' : severity === 'warning' ? '#f59e0b30' : '#8b5cf620';
  const accentColor = severity === 'good' ? '#22c55e' : severity === 'warning' ? '#f59e0b' : '#8b5cf6';

  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      padding: '12px 0',
      borderBottom: isLast ? 'none' : '1px solid #1a1a30',
      alignItems: 'flex-start',
    }}>
      {/* Avatar */}
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: `${accentColor}15`,
        border: `1px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        flexShrink: 0,
      }}>
        {icon}
      </div>
      {/* Message */}
      <div style={{
        fontSize: '12px',
        color: '#ccc',
        lineHeight: '1.5',
        paddingTop: '6px',
      }}>
        {message}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
//  Coach analysis logic
// ──────────────────────────────────────────────────────────────

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

async function analyzePlay(): Promise<CoachTip[]> {
  if (!window.cardCatcher) return [];

  const tips: CoachTip[] = [];

  try {
    // Fetch recent hands for per-hand analysis
    const hands: HandRecord[] = await window.cardCatcher.getHandHistory({ limit: 10 });
    if (!hands || hands.length === 0) return [];

    // Try to get hero stats from aggregated data
    // We'll compute from hand history as a fallback
    let vpip = 0;
    let pfr = 0;
    let foldTo3Bet = 0;
    let af = 0;
    let hasStats = false;

    // Attempt to derive stats from hands
    let vpipCount = 0;
    let pfrCount = 0;
    let totalHands = hands.length;
    let betsRaises = 0;
    let calls = 0;
    let foldTo3BetOpp = 0;
    let foldTo3BetCount = 0;

    for (const hand of hands) {
      const hero = hand.players.find(p => p.holeCards && p.holeCards.length > 0);
      if (!hero) continue;
      const heroSeat = hero.seatIndex;

      const preflopActions = (hand.actions || []).filter(a => a.street === 'preflop' && a.seatIndex === heroSeat);
      const postflopActions = (hand.actions || []).filter(a => a.street !== 'preflop' && a.seatIndex === heroSeat);

      const voluntaryPF = preflopActions.some(a => a.action === 'call' || a.action === 'raise' || a.action === 'bet' || a.action === 'all_in');
      const raisePF = preflopActions.some(a => a.action === 'raise' || a.action === 'bet' || a.action === 'all_in');

      if (voluntaryPF) vpipCount++;
      if (raisePF) pfrCount++;

      for (const a of postflopActions) {
        if (a.action === 'bet' || a.action === 'raise' || a.action === 'all_in') betsRaises++;
        if (a.action === 'call') calls++;
      }

      // Check fold to 3-bet: hero raised, someone re-raised, hero folded
      const allPreflopActions = (hand.actions || []).filter(a => a.street === 'preflop');
      let heroRaised = false;
      let facedReraise = false;
      for (const a of allPreflopActions) {
        if (a.seatIndex === heroSeat && (a.action === 'raise' || a.action === 'bet')) heroRaised = true;
        if (heroRaised && a.seatIndex !== heroSeat && (a.action === 'raise' || a.action === 'all_in')) facedReraise = true;
        if (facedReraise && a.seatIndex === heroSeat) {
          foldTo3BetOpp++;
          if (a.action === 'fold') foldTo3BetCount++;
          break;
        }
      }
    }

    if (totalHands > 0) {
      vpip = (vpipCount / totalHands) * 100;
      pfr = (pfrCount / totalHands) * 100;
      af = calls > 0 ? betsRaises / calls : betsRaises;
      foldTo3Bet = foldTo3BetOpp > 0 ? (foldTo3BetCount / foldTo3BetOpp) * 100 : 0;
      hasStats = true;
    }

    if (hasStats) {
      // VPIP analysis
      if (vpip > 30) {
        tips.push({
          icon: '\u26A0\uFE0F',
          message: `You're playing too many hands preflop (VPIP: ${vpip.toFixed(0)}%). A solid TAG style aims for 20-25%. Tighten your opening ranges, especially from early position.`,
          severity: 'warning',
        });
      } else if (vpip > 0) {
        tips.push({
          icon: '\u2705',
          message: `Your preflop hand selection looks reasonable (VPIP: ${vpip.toFixed(0)}%). Keep it up.`,
          severity: 'good',
        });
      }

      // PFR/VPIP ratio
      if (vpip > 0) {
        const ratio = pfr / vpip;
        if (ratio < 0.5) {
          tips.push({
            icon: '\u26A0\uFE0F',
            message: `You should raise more preflop — your PFR/VPIP ratio is low (${ratio.toFixed(2)}). You're limping or cold-calling too often. Raising gives you the initiative and can win pots uncontested.`,
            severity: 'warning',
          });
        } else {
          tips.push({
            icon: '\u2705',
            message: `Good PFR/VPIP ratio (${ratio.toFixed(2)}). You're entering pots aggressively.`,
            severity: 'good',
          });
        }
      }

      // Aggression factor
      if (af >= 2) {
        tips.push({
          icon: '\u2705',
          message: `Good aggression factor (AF: ${af.toFixed(1)}). You're applying postflop pressure.`,
          severity: 'good',
        });
      } else if (af < 2 && totalHands >= 3) {
        tips.push({
          icon: '\uD83D\uDCA1',
          message: `Consider being more aggressive postflop (AF: ${af.toFixed(1)}). Betting and raising more often puts opponents in tough spots and builds bigger pots when you have equity.`,
          severity: 'warning',
        });
      }

      // Fold to 3-bet
      if (foldTo3BetOpp >= 2 && foldTo3Bet > 70) {
        tips.push({
          icon: '\u26A0\uFE0F',
          message: `You're folding too much to 3-bets (${foldTo3Bet.toFixed(0)}%). Opponents will exploit this by 3-betting light. Consider defending more with suited connectors and broadways.`,
          severity: 'warning',
        });
      }
    }

    // Per-hand analysis: questionable preflop calls
    for (const hand of hands) {
      const hero = hand.players.find(p => p.holeCards && p.holeCards.length > 0);
      if (!hero || !hero.holeCards) continue;
      const heroSeat = hero.seatIndex;

      const preflopActions = (hand.actions || []).filter(a => a.street === 'preflop');

      // Check if someone raised before hero called
      let facedRaise = false;
      let heroCalled = false;
      for (const a of preflopActions) {
        if (a.seatIndex !== heroSeat && (a.action === 'raise' || a.action === 'all_in')) facedRaise = true;
        if (facedRaise && a.seatIndex === heroSeat && a.action === 'call') {
          heroCalled = true;
          break;
        }
      }

      if (heroCalled) {
        // Check if hand is weak (both cards below J)
        const rank1 = RANK_VALUES[hero.holeCards[0][0]] || 0;
        const rank2 = RANK_VALUES[hero.holeCards[1][0]] || 0;
        const highCard = Math.max(rank1, rank2);
        if (highCard < 11) { // below J
          const ts = new Date(hand.timestamp).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          });
          tips.push({
            icon: '\uD83D\uDCA1',
            message: `Questionable preflop call at ${ts}: you called a raise with ${hero.holeCards[0]} ${hero.holeCards[1]}. Low cards facing a raise are typically -EV unless you have strong implied odds.`,
            severity: 'info',
          });
        }
      }
    }

    if (tips.length === 0 && hasStats) {
      tips.push({
        icon: '\uD83D\uDCA1',
        message: 'Your play looks solid so far! Keep grinding and check back after more hands for deeper analysis.',
        severity: 'good',
      });
    }
  } catch {
    tips.push({
      icon: '\uD83D\uDCA1',
      message: 'Could not analyze hands. Play some hands and come back!',
      severity: 'info',
    });
  }

  return tips;
}

// ──────────────────────────────────────────────────────────────
//  Shared UI helpers
// ──────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '11px',
      color: '#666',
      textTransform: 'uppercase',
      letterSpacing: '1px',
      marginBottom: '14px',
      fontWeight: 600,
    }}>
      {children}
    </div>
  );
}
