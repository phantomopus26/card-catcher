import React, { useState } from 'react';
import type { PlayerStats } from '../../shared/types';
import { STAT_RANGES } from '../../shared/constants';

interface PlayerTableProps {
  players: PlayerStats[];
  heroSeatIndex?: number;
}

type SortKey = 'seatIndex' | 'handsPlayed' | 'vpip' | 'pfr' | 'threeBet' | 'af' | 'foldTo3Bet';

function getStatColor(statKey: string, value: number): string {
  const ranges = STAT_RANGES[statKey as keyof typeof STAT_RANGES];
  if (!ranges) return '#e0e0e0';

  const entries = Object.entries(ranges) as [string, readonly [number, number]][];
  for (const [rangeName, [low, high]] of entries) {
    if (value >= low && value < high) {
      if (rangeName === 'tight' || rangeName === 'passive' || rangeName === 'low') return '#ef4444';
      if (rangeName === 'average') return '#e0e0e0';
      if (rangeName === 'loose' || rangeName === 'aggressive' || rangeName === 'high') return '#22c55e';
    }
  }
  return '#e0e0e0';
}

/** Classify player type based on stats */
function getPlayerType(p: PlayerStats): { label: string; emoji: string } | null {
  if (p.handsPlayed < 5) return null; // not enough data
  // Bot detection takes priority
  if ((p.botScore ?? 0) > 60) return { label: 'Bot', emoji: '\uD83E\uDD16' };
  if (p.vpip > 50) return { label: 'Whale', emoji: '\uD83D\uDC0B' };
  if (p.vpip >= 35 && p.vpip <= 50 && p.af < 1.5) return { label: 'Fish', emoji: '\uD83D\uDC1F' };
  if (p.vpip < 15) return { label: 'Nit', emoji: '\uD83E\uDEA8' };
  if ((p.botScore ?? 0) > 30) return { label: 'Sus', emoji: '\u26A0\uFE0F' };
  return { label: 'Reg', emoji: '' };
}

const ROW_BG_EVEN = '#0d0d18';
const ROW_BG_ODD = '#12122a';
const ROW_HOVER = '#1a1a3a';

const COLUMNS: { key: SortKey; label: string; statKey?: string; width: string }[] = [
  { key: 'seatIndex', label: 'Seat', width: '44px' },
  { key: 'handsPlayed', label: 'Hands', width: '54px' },
  { key: 'vpip', label: 'VPIP', statKey: 'vpip', width: '56px' },
  { key: 'pfr', label: 'PFR', statKey: 'pfr', width: '52px' },
  { key: 'threeBet', label: '3-Bet', statKey: 'threeBet', width: '52px' },
  { key: 'af', label: 'AF', statKey: 'af', width: '46px' },
  { key: 'foldTo3Bet', label: 'F3B', statKey: 'foldTo3Bet', width: '52px' },
];

export function PlayerTable({ players, heroSeatIndex }: PlayerTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('seatIndex');
  const [sortAsc, setSortAsc] = useState(true);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const sorted = [...players].sort((a, b) => {
    const va = a[sortKey];
    const vb = b[sortKey];
    return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  if (players.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#555', fontSize: '13px' }}>
        No player data yet. Start tracking a table to see stats.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '13px',
        fontFamily: 'Consolas, Monaco, monospace',
      }}>
        <thead>
          <tr>
            {/* Type column header */}
            <th
              style={{
                padding: '8px 6px',
                textAlign: 'center',
                color: '#888',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                borderBottom: '1px solid #1e1e35',
                width: '54px',
                userSelect: 'none',
              }}
            >
              Type
            </th>
            {COLUMNS.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                style={{
                  padding: '8px 6px',
                  textAlign: 'right',
                  color: sortKey === col.key ? '#8b5cf6' : '#888',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #1e1e35',
                  width: col.width,
                  userSelect: 'none',
                  transition: 'color 0.15s ease',
                }}
              >
                {col.label} {sortKey === col.key ? (sortAsc ? '\u25B2' : '\u25BC') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, idx) => {
            const isHero = p.seatIndex === heroSeatIndex;
            const pType = getPlayerType(p);
            const isHovered = hoveredRow === p.seatIndex;
            const rowBg = isHovered ? ROW_HOVER : (idx % 2 === 0 ? ROW_BG_EVEN : ROW_BG_ODD);

            return (
              <tr
                key={p.seatIndex}
                onMouseEnter={() => setHoveredRow(p.seatIndex)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  borderBottom: '1px solid #1a1a2e',
                  background: rowBg,
                  transition: 'background 0.12s ease',
                }}
              >
                {/* Type column */}
                <td style={{
                  padding: '6px',
                  textAlign: 'center',
                  fontSize: '12px',
                  color: '#888',
                }}>
                  {pType ? (
                    <span title={pType.label}>
                      {pType.emoji ? `${pType.emoji} ` : ''}{pType.label}
                    </span>
                  ) : ''}
                </td>
                <td style={{
                  padding: '6px',
                  textAlign: 'right',
                  color: '#aaa',
                  fontWeight: isHero ? 'bold' : 'normal',
                }}>
                  {p.seatIndex + 1}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: '#e0e0e0' }}>
                  {p.handsPlayed}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: getStatColor('vpip', p.vpip) }}>
                  {p.vpip.toFixed(1)}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: getStatColor('pfr', p.pfr) }}>
                  {p.pfr.toFixed(1)}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: getStatColor('threeBet', p.threeBet) }}>
                  {p.threeBet.toFixed(1)}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: getStatColor('af', p.af) }}>
                  {p.af.toFixed(1)}
                </td>
                <td style={{ padding: '6px', textAlign: 'right', color: getStatColor('foldTo3Bet', p.foldTo3Bet) }}>
                  {p.foldTo3Bet.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
