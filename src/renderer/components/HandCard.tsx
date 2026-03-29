import React, { useState } from 'react';
import type { HandRecord, PlayerAction } from '../../shared/types';

// --------------- Card rendering helpers ---------------

const SUIT_SYMBOLS: Record<string, string> = {
  h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660',
};
const SUIT_COLORS: Record<string, string> = {
  h: '#ef4444', d: '#3b82f6', c: '#22c55e', s: '#e0e0e0',
};

function CardPill({ card }: { card: string }) {
  const rank = card[0];
  const suit = card[1];
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '1px',
      background: '#1a1a30',
      border: '1px solid #2a2a45',
      borderRadius: '4px',
      padding: '2px 5px',
      fontSize: '12px',
      fontWeight: 600,
      fontFamily: 'Consolas, Monaco, monospace',
      color: SUIT_COLORS[suit] || '#e0e0e0',
      lineHeight: 1,
    }}>
      {rank}
      <span style={{ fontSize: '11px' }}>{SUIT_SYMBOLS[suit] || suit}</span>
    </span>
  );
}

function CardRow({ cards, label }: { cards: string[] | null; label?: string }) {
  if (!cards || cards.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
      {label && <span style={{ fontSize: '10px', color: '#555', marginRight: '2px' }}>{label}</span>}
      {cards.map((c, i) => <CardPill key={i} card={c} />)}
    </span>
  );
}

// --------------- Action formatting ---------------

function formatAction(a: PlayerAction): string {
  const name = a.playerName || `Seat ${a.seatIndex}`;
  switch (a.action) {
    case 'fold': return `${name} folds`;
    case 'check': return `${name} checks`;
    case 'call': return `${name} calls $${a.amount.toFixed(2)}`;
    case 'bet': return `${name} bets $${a.amount.toFixed(2)}`;
    case 'raise': return `${name} raises to $${a.amount.toFixed(2)}`;
    case 'all_in': return `${name} all-in $${a.amount.toFixed(2)}`;
    case 'post_blind': return `${name} posts $${a.amount.toFixed(2)}`;
    default: return `${name} ${a.action} $${a.amount.toFixed(2)}`;
  }
}

function streetLabel(street: string): string {
  return street.charAt(0).toUpperCase() + street.slice(1);
}

// --------------- Main component ---------------

interface HandCardProps {
  hand: HandRecord;
  onPin?: (handId: number) => void;
  onUnpin?: (handId: number) => void;
  isPinned?: boolean;
}

export function HandCard({ hand, onPin, onUnpin, isPinned }: HandCardProps) {
  const [expanded, setExpanded] = useState(false);

  const heroPlayer = hand.players.find(p => p.holeCards && p.holeCards.length > 0);
  const pnl = heroPlayer ? heroPlayer.finalStack - heroPlayer.startingStack : 0;
  const timestamp = new Date(hand.timestamp).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // Group actions by street
  const actionsByStreet = new Map<string, PlayerAction[]>();
  for (const a of hand.actions || []) {
    const street = a.street || 'preflop';
    if (!actionsByStreet.has(street)) actionsByStreet.set(street, []);
    actionsByStreet.get(street)!.push(a);
  }

  return (
    <div style={{
      background: '#0d0d18',
      border: '1px solid #1e1e35',
      borderRadius: '8px',
      padding: '12px 14px',
      cursor: 'pointer',
      transition: 'border-color 0.15s ease',
    }}
      onClick={() => setExpanded(!expanded)}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = '#8b5cf640'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = '#1e1e35'}
    >
      {/* Summary row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>{timestamp}</span>
          <CardRow cards={hand.heroCards} />
          <CardRow cards={hand.communityCards.length > 0 ? hand.communityCards : null} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{
            fontSize: '12px',
            color: '#888',
            fontFamily: 'Consolas, Monaco, monospace',
          }}>
            Pot ${hand.potTotal.toFixed(2)}
          </span>
          <span style={{
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: 'Consolas, Monaco, monospace',
            color: pnl >= 0 ? '#22c55e' : '#ef4444',
          }}>
            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
          </span>
          {(onPin || onUnpin) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isPinned && onUnpin && hand.id) onUnpin(hand.id);
                else if (!isPinned && onPin && hand.id) onPin(hand.id);
              }}
              style={{
                background: 'none',
                border: '1px solid #2a2a45',
                borderRadius: '4px',
                padding: '3px 8px',
                fontSize: '10px',
                color: isPinned ? '#f59e0b' : '#888',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#2a2a45'}
            >
              {isPinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          <span style={{ fontSize: '10px', color: '#555', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
            {'\u25BC'}
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: '12px', borderTop: '1px solid #1a1a30', paddingTop: '10px' }}>
          {/* Players */}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', color: '#555', textTransform: 'uppercase', marginBottom: '4px' }}>Players</div>
            {hand.players.map((p, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '2px 0',
                color: p.isWinner ? '#22c55e' : '#888',
              }}>
                <span>{p.playerName || `Seat ${p.seatIndex}`} {p.holeCards ? '' : ''}</span>
                <span style={{ fontFamily: 'Consolas, Monaco, monospace' }}>
                  {p.holeCards && <CardRow cards={p.holeCards} />}
                  {' '}
                  ${p.startingStack.toFixed(2)} {'\u2192'} ${p.finalStack.toFixed(2)}
                  {p.isWinner && ' \u2713'}
                </span>
              </div>
            ))}
          </div>

          {/* Actions by street */}
          {['preflop', 'flop', 'turn', 'river'].map(street => {
            const actions = actionsByStreet.get(street);
            if (!actions || actions.length === 0) return null;
            return (
              <div key={street} style={{ marginBottom: '6px' }}>
                <div style={{
                  fontSize: '10px', color: '#8b5cf6', textTransform: 'uppercase',
                  marginBottom: '2px', fontWeight: 600,
                }}>
                  {streetLabel(street)}
                </div>
                {actions.map((a, i) => (
                  <div key={i} style={{ fontSize: '11px', color: '#999', padding: '1px 0 1px 8px' }}>
                    {formatAction(a)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { CardRow, CardPill };
