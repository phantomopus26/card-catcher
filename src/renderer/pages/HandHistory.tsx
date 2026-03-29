import React, { useState, useEffect, useCallback } from 'react';

interface HandRow {
  id: number;
  table_id: string;
  site: string;
  timestamp: number;
  pot_total: number;
  community_cards: string;
  hero_cards: string;
  hero_seat_index: number;
  pinned: number;
  players?: any[];
  actions?: any[];
}

const SUITS: Record<string, { symbol: string; color: string }> = {
  h: { symbol: '♥', color: '#ef4444' },
  d: { symbol: '♦', color: '#3b82f6' },
  c: { symbol: '♣', color: '#22c55e' },
  s: { symbol: '♠', color: '#e0e0e0' },
};

function CardPill({ card }: { card: string }) {
  if (!card || card.length < 2) return null;
  const rank = card.slice(0, -1);
  const suit = card.slice(-1).toLowerCase();
  const s = SUITS[suit] || { symbol: suit, color: '#888' };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '1px',
      padding: '2px 5px',
      background: '#1a1a2e',
      border: '1px solid #2a2a45',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '700',
      fontFamily: 'Consolas, Monaco, monospace',
      color: s.color,
      marginRight: '3px',
    }}>
      {rank}{s.symbol}
    </span>
  );
}

function parseCards(str: string): string[] {
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  return str.split(/[\s,]+/).filter(Boolean);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function streetLabel(street: string): string {
  const labels: Record<string, string> = {
    preflop: 'Pre-flop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River',
  };
  return labels[street] || street;
}

function actionColor(action: string): string {
  switch (action) {
    case 'fold': return '#888';
    case 'check': return '#888';
    case 'call': return '#22c55e';
    case 'bet': return '#f59e0b';
    case 'raise': return '#ef4444';
    case 'all_in': return '#8b5cf6';
    default: return '#aaa';
  }
}

export function HandHistory() {
  const [hands, setHands] = useState<HandRow[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedHand, setExpandedHand] = useState<HandRow | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<'all' | 'pinned'>('all');
  const PAGE_SIZE = 25;

  const fetchHands = useCallback(async () => {
    if (!window.cardCatcher) return;
    if (filter === 'pinned') {
      const pinned = await window.cardCatcher.getPinnedHands();
      setHands(pinned);
      setTotal(pinned.length);
    } else {
      const result = await window.cardCatcher.getHandHistory({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setHands(result);
      const count = await window.cardCatcher.getHandCount();
      setTotal(count);
    }
  }, [page, filter]);

  useEffect(() => { fetchHands(); }, [fetchHands]);

  const toggleExpand = async (hand: HandRow) => {
    if (expandedId === hand.id) {
      setExpandedId(null);
      setExpandedHand(null);
      return;
    }
    setExpandedId(hand.id);
    try {
      const full = await window.cardCatcher.getHandById(hand.id);
      setExpandedHand(full);
    } catch {
      setExpandedHand(hand);
    }
  };

  const togglePin = async (handId: number, currentlyPinned: boolean) => {
    if (currentlyPinned) {
      await window.cardCatcher.unpinHand(handId);
    } else {
      await window.cardCatcher.pinHand(handId);
    }
    fetchHands();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: '#e0e0e0', fontSize: '18px', fontWeight: '600', margin: 0 }}>
          Hand History
        </h2>
        <div style={{ display: 'flex', gap: '4px' }}>
          <FilterButton label="All Hands" active={filter === 'all'} onClick={() => { setFilter('all'); setPage(0); }} />
          <FilterButton label="⭐ Pinned" active={filter === 'pinned'} onClick={() => { setFilter('pinned'); setPage(0); }} />
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex',
        gap: '20px',
        padding: '10px 16px',
        background: '#0d0d18',
        border: '1px solid #1e1e35',
        borderRadius: '8px',
        fontSize: '12px',
        color: '#888',
      }}>
        <span>Total Hands: <strong style={{ color: '#e0e0e0' }}>{total}</strong></span>
        {filter === 'all' && totalPages > 1 && (
          <span>Page <strong style={{ color: '#e0e0e0' }}>{page + 1}</strong> of {totalPages}</span>
        )}
      </div>

      {/* Hands list */}
      <div style={{
        background: '#0d0d18',
        border: '1px solid #1e1e35',
        borderRadius: '10px',
        overflow: 'hidden',
      }}>
        {hands.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#555', fontSize: '13px' }}>
            {filter === 'pinned' ? 'No pinned hands yet. Pin hands to save them for review.' : 'No hands recorded yet. Start tracking a table to build history.'}
          </div>
        ) : (
          hands.map((hand, i) => {
            const heroCards = parseCards(hand.hero_cards);
            const communityCards = parseCards(hand.community_cards);
            const isExpanded = expandedId === hand.id;
            const isPinned = !!hand.pinned;

            // Calculate hero PnL from expanded data
            let heroPnL: number | null = null;
            if (isExpanded && expandedHand?.players) {
              const hero = expandedHand.players.find((p: any) => p.seat_index === hand.hero_seat_index);
              if (hero) heroPnL = hero.final_stack - hero.starting_stack;
            }

            return (
              <div key={hand.id}>
                {/* Hand row */}
                <div
                  onClick={() => toggleExpand(hand)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 100px 1fr 100px 60px 40px',
                    gap: '8px',
                    alignItems: 'center',
                    padding: '10px 16px',
                    cursor: 'pointer',
                    background: isExpanded ? '#12122a' : i % 2 === 0 ? '#0d0d18' : '#0f0f1e',
                    borderBottom: '1px solid #1a1a2e',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = '#14142a'; }}
                  onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = i % 2 === 0 ? '#0d0d18' : '#0f0f1e'; }}
                >
                  <span style={{ fontSize: '11px', color: '#888', fontFamily: 'Consolas, monospace' }}>
                    {formatTime(hand.timestamp)}
                  </span>
                  <span style={{ fontSize: '12px', color: '#aaa' }}>
                    Pot: ${hand.pot_total?.toFixed(2) || '0.00'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#666' }}>Hero:</span>
                    {heroCards.length > 0 ? heroCards.map((c, j) => <CardPill key={j} card={c} />) : <span style={{ color: '#444', fontSize: '11px' }}>—</span>}
                    {communityCards.length > 0 && (
                      <>
                        <span style={{ color: '#333', margin: '0 4px' }}>|</span>
                        {communityCards.map((c, j) => <CardPill key={`b${j}`} card={c} />)}
                      </>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: '#666', textAlign: 'right' }}>
                    #{hand.id}
                  </span>
                  <span
                    onClick={(e) => { e.stopPropagation(); togglePin(hand.id, isPinned); }}
                    title={isPinned ? 'Unpin' : 'Pin for review'}
                    style={{ cursor: 'pointer', fontSize: '16px', textAlign: 'center' }}
                  >
                    {isPinned ? '⭐' : '☆'}
                  </span>
                  <span style={{ color: '#555', fontSize: '12px', textAlign: 'center' }}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>

                {/* Expanded detail */}
                {isExpanded && expandedHand && (
                  <div style={{
                    padding: '16px 24px',
                    background: '#0a0a16',
                    borderBottom: '2px solid #8b5cf6',
                  }}>
                    {/* Players */}
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
                        Players
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 90px 90px 80px', gap: '4px', fontSize: '12px' }}>
                        <span style={{ color: '#555', fontWeight: '600' }}>Seat</span>
                        <span style={{ color: '#555', fontWeight: '600' }}>Name</span>
                        <span style={{ color: '#555', fontWeight: '600', textAlign: 'right' }}>Start</span>
                        <span style={{ color: '#555', fontWeight: '600', textAlign: 'right' }}>End</span>
                        <span style={{ color: '#555', fontWeight: '600', textAlign: 'right' }}>P/L</span>
                        {(expandedHand.players || []).map((p: any) => {
                          const pl = p.final_stack - p.starting_stack;
                          const isHero = p.seat_index === hand.hero_seat_index;
                          return (
                            <React.Fragment key={p.seat_index}>
                              <span style={{ color: isHero ? '#8b5cf6' : '#aaa' }}>
                                {isHero ? '★ ' : ''}Seat {p.seat_index}
                              </span>
                              <span style={{ color: isHero ? '#c4b5fd' : '#888' }}>
                                {p.player_name || 'Player'}
                              </span>
                              <span style={{ color: '#888', textAlign: 'right', fontFamily: 'Consolas, monospace' }}>
                                ${p.starting_stack?.toFixed(2)}
                              </span>
                              <span style={{ color: '#888', textAlign: 'right', fontFamily: 'Consolas, monospace' }}>
                                ${p.final_stack?.toFixed(2)}
                              </span>
                              <span style={{
                                textAlign: 'right',
                                fontFamily: 'Consolas, monospace',
                                fontWeight: '600',
                                color: pl > 0 ? '#22c55e' : pl < 0 ? '#ef4444' : '#888',
                              }}>
                                {pl >= 0 ? '+' : ''}{pl.toFixed(2)}
                              </span>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>

                    {/* Actions */}
                    {(expandedHand.actions || []).length > 0 && (
                      <div>
                        <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
                          Action Sequence
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {(() => {
                            const actions = expandedHand.actions || [];
                            let currentStreet = '';
                            return actions.map((a: any, idx: number) => {
                              const showStreet = a.street !== currentStreet;
                              currentStreet = a.street;
                              return (
                                <React.Fragment key={idx}>
                                  {showStreet && (
                                    <div style={{
                                      fontSize: '10px',
                                      color: '#8b5cf6',
                                      textTransform: 'uppercase',
                                      letterSpacing: '1px',
                                      marginTop: idx > 0 ? '6px' : 0,
                                      marginBottom: '2px',
                                      fontWeight: '600',
                                    }}>
                                      — {streetLabel(a.street)} —
                                    </div>
                                  )}
                                  <div style={{ fontSize: '12px', color: '#aaa', paddingLeft: '12px' }}>
                                    <span style={{ color: '#888', width: '50px', display: 'inline-block' }}>
                                      Seat {a.seat_index}
                                    </span>
                                    <span style={{
                                      color: actionColor(a.action),
                                      fontWeight: '600',
                                      width: '60px',
                                      display: 'inline-block',
                                    }}>
                                      {a.action}
                                    </span>
                                    {a.amount > 0 && (
                                      <span style={{ color: '#e0e0e0', fontFamily: 'Consolas, monospace' }}>
                                        ${a.amount.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                </React.Fragment>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Hero PnL */}
                    {heroPnL !== null && (
                      <div style={{
                        marginTop: '12px',
                        padding: '8px 12px',
                        background: '#12122a',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <span style={{ fontSize: '12px', color: '#888' }}>Hero Result</span>
                        <span style={{
                          fontSize: '16px',
                          fontWeight: '700',
                          fontFamily: 'Consolas, monospace',
                          color: heroPnL > 0 ? '#22c55e' : heroPnL < 0 ? '#ef4444' : '#888',
                        }}>
                          {heroPnL >= 0 ? '+' : ''}${heroPnL.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {filter === 'all' && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
          <PageButton label="← Prev" disabled={page === 0} onClick={() => setPage(p => p - 1)} />
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum: number;
            if (totalPages <= 7) {
              pageNum = i;
            } else if (page < 3) {
              pageNum = i;
            } else if (page > totalPages - 4) {
              pageNum = totalPages - 7 + i;
            } else {
              pageNum = page - 3 + i;
            }
            return (
              <PageButton
                key={pageNum}
                label={`${pageNum + 1}`}
                active={pageNum === page}
                onClick={() => setPage(pageNum)}
              />
            );
          })}
          <PageButton label="Next →" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} />
        </div>
      )}
    </div>
  );
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: '6px',
        border: `1px solid ${active ? '#8b5cf6' : '#1e1e35'}`,
        fontSize: '12px',
        fontWeight: active ? '600' : '400',
        cursor: 'pointer',
        background: active ? 'rgba(139,92,246,0.15)' : '#0d0d18',
        color: active ? '#c4b5fd' : '#888',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function PageButton({ label, active, disabled, onClick }: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 10px',
        borderRadius: '4px',
        border: `1px solid ${active ? '#8b5cf6' : '#1e1e35'}`,
        fontSize: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: active ? '#8b5cf6' : '#0d0d18',
        color: active ? '#fff' : disabled ? '#444' : '#888',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}
