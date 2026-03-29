import React from 'react';
import type { PlayerStats } from '../shared/types';

interface PlayerHudProps {
  stats: PlayerStats;
  x: number; // percentage position
  y: number;
  isBot?: boolean;
}

// Player type classification based on stats
type PlayerType = 'whale' | 'fish' | 'nit' | 'bot' | 'reg';

function classifyPlayer(stats: PlayerStats, isBot: boolean): PlayerType {
  if (isBot) return 'bot';
  if (stats.vpip > 50) return 'whale';
  if (stats.vpip >= 35 && stats.af < 1.5) return 'fish';
  if (stats.vpip < 15) return 'nit';
  return 'reg';
}

function getPlayerIcon(type: PlayerType): string {
  switch (type) {
    case 'whale': return '\u{1F40B}'; // whale emoji
    case 'fish':  return '\u{1F41F}'; // fish emoji
    case 'nit':   return '\u{1FAA8}'; // rock emoji
    case 'bot':   return '\u{1F916}'; // robot emoji
    case 'reg':   return '';
  }
}

// Color code stats: green = exploitable/good, red = tough/bad, white = neutral
function getVpipColor(vpip: number): string {
  if (vpip < 15) return '#60a5fa';     // blue — nit
  if (vpip < 20) return '#4ade80';     // green — tight
  if (vpip < 30) return '#e0e0e0';     // white — average
  if (vpip < 40) return '#fbbf24';     // amber — loose
  return '#f87171';                     // red — very loose
}

function getPfrColor(pfr: number): string {
  if (pfr < 10) return '#60a5fa';      // blue — passive
  if (pfr < 18) return '#4ade80';      // green — tight
  if (pfr < 24) return '#e0e0e0';      // white — average
  return '#f87171';                     // red — aggressive
}

function getThreeBetColor(threeBet: number): string {
  if (threeBet < 4) return '#4ade80';   // green — low 3bet
  if (threeBet < 8) return '#e0e0e0';   // white — average
  if (threeBet < 12) return '#fbbf24';  // amber — high
  return '#f87171';                      // red — very high
}

function getAfColor(af: number): string {
  if (af < 1.0) return '#60a5fa';       // blue — very passive
  if (af < 1.5) return '#4ade80';       // green — passive
  if (af < 3.0) return '#e0e0e0';       // white — average
  return '#f87171';                      // red — aggressive
}

function getF3bColor(f3b: number): string {
  if (f3b < 40) return '#f87171';       // red — rarely folds (tough)
  if (f3b < 55) return '#e0e0e0';       // white — average
  if (f3b < 70) return '#4ade80';       // green — folds often (exploitable)
  return '#4ade80';                      // green — very exploitable
}

export function PlayerHud({ stats, x, y, isBot = false }: PlayerHudProps) {
  if (stats.handsPlayed === 0) return null;

  const playerType = classifyPlayer(stats, isBot);
  const icon = getPlayerIcon(playerType);

  const vpipStr = Math.round(stats.vpip).toString();
  const pfrStr = Math.round(stats.pfr).toString();
  const threeBetStr = Math.round(stats.threeBet).toString();
  const afStr = stats.af.toFixed(1);
  const f3bStr = Math.round(stats.foldTo3Bet).toString();

  // Bot alert pulsing animation via inline keyframes
  const botBorderStyle = isBot
    ? '2px solid #ef4444'
    : '1px solid rgba(139, 92, 246, 0.3)';

  return (
    <div style={{
      position: 'absolute',
      left: `${x}%`,
      top: `${y}%`,
      transform: 'translate(-50%, -50%)',
      background: 'rgba(10, 10, 26, 0.85)',
      border: botBorderStyle,
      borderRadius: '4px',
      padding: '3px 5px',
      fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
      fontSize: '11px',
      lineHeight: '1.35',
      color: '#e0e0e0',
      whiteSpace: 'nowrap',
      maxWidth: '110px',
      boxShadow: isBot
        ? '0 0 8px rgba(239, 68, 68, 0.6), 0 2px 6px rgba(0,0,0,0.4)'
        : '0 2px 6px rgba(0,0,0,0.4)',
      animation: isBot ? 'botPulse 1.5s ease-in-out infinite' : undefined,
      zIndex: 1000,
    }}>
      {/* Inject bot pulse animation */}
      {isBot && (
        <style>{`
          @keyframes botPulse {
            0%, 100% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.4), 0 2px 6px rgba(0,0,0,0.4); border-color: rgba(239, 68, 68, 0.5); }
            50% { box-shadow: 0 0 12px rgba(239, 68, 68, 0.8), 0 2px 6px rgba(0,0,0,0.4); border-color: rgba(239, 68, 68, 1.0); }
          }
        `}</style>
      )}

      {/* Row 1: Icon + VPIP/PFR/3Bet */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        {icon && (
          <span style={{ fontSize: '10px', lineHeight: 1 }}>{icon}</span>
        )}
        <span>
          <span style={{ color: getVpipColor(stats.vpip), fontWeight: 'bold' }}>{vpipStr}</span>
          <span style={{ color: '#666' }}>/</span>
          <span style={{ color: getPfrColor(stats.pfr), fontWeight: 'bold' }}>{pfrStr}</span>
          <span style={{ color: '#666' }}>/</span>
          <span style={{ color: getThreeBetColor(stats.threeBet), fontWeight: 'bold' }}>{threeBetStr}</span>
        </span>
      </div>

      {/* Row 2: AF/F3B + hand count */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ paddingLeft: icon ? '14px' : '0px' }}>
          <span style={{ color: getAfColor(stats.af), fontWeight: 'bold' }}>{afStr}</span>
          <span style={{ color: '#666' }}>/</span>
          <span style={{ color: getF3bColor(stats.foldTo3Bet), fontWeight: 'bold' }}>{f3bStr}</span>
        </span>
        <span style={{
          color: '#555',
          fontSize: '9px',
          marginLeft: '4px',
        }}>
          ({stats.handsPlayed})
        </span>
      </div>
    </div>
  );
}
