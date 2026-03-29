import React from 'react';
import { STAT_RANGES } from '../../shared/constants';

interface StatGaugeProps {
  label: string;
  value: number;
  statKey: keyof typeof STAT_RANGES;
  suffix?: string;
  decimals?: number;
}

function getColor(statKey: keyof typeof STAT_RANGES, value: number): string {
  const ranges = STAT_RANGES[statKey];
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

export function StatGauge({ label, value, statKey, suffix = '', decimals = 0 }: StatGaugeProps) {
  const color = getColor(statKey, value);
  const displayValue = decimals > 0 ? value.toFixed(decimals) : Math.round(value);

  // SVG arc gauge (semi-circle)
  const radius = 36;
  const cx = 45;
  const cy = 45;
  const startAngle = -180;
  const endAngle = 0;

  // Normalize value to 0-1 range based on stat type
  const maxVal = statKey === 'af' ? 6 : 100;
  const normalized = Math.min(1, Math.max(0, value / maxVal));
  const sweepAngle = normalized * (endAngle - startAngle);
  const currentAngle = startAngle + sweepAngle;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const bgStartX = cx + radius * Math.cos(toRad(startAngle));
  const bgStartY = cy + radius * Math.sin(toRad(startAngle));
  const bgEndX = cx + radius * Math.cos(toRad(endAngle));
  const bgEndY = cy + radius * Math.sin(toRad(endAngle));

  const arcEndX = cx + radius * Math.cos(toRad(currentAngle));
  const arcEndY = cy + radius * Math.sin(toRad(currentAngle));
  const largeArc = sweepAngle > 180 ? 1 : 0;

  return (
    <div style={{
      background: 'linear-gradient(180deg, #12122a 0%, #0d0d18 100%)',
      border: '1px solid #1e1e35',
      borderRadius: '10px',
      padding: '14px 16px 10px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      minWidth: '108px',
      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    }}>
      {/* Label at top, more prominent */}
      <div style={{
        fontSize: '12px',
        color: '#aaa',
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        marginBottom: '6px',
        fontWeight: '600',
      }}>
        {label}
      </div>
      <svg width="90" height="52" viewBox="0 0 90 52">
        {/* Background arc */}
        <path
          d={`M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 1 1 ${bgEndX} ${bgEndY}`}
          fill="none"
          stroke="#1e1e35"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {/* Value arc */}
        {normalized > 0.01 && (
          <path
            d={`M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 ${largeArc} 1 ${arcEndX} ${arcEndY}`}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
          />
        )}
      </svg>
      <div style={{
        fontSize: '24px',
        fontWeight: 'bold',
        color,
        marginTop: '-2px',
        fontFamily: 'Consolas, Monaco, monospace',
      }}>
        {displayValue}{suffix}
      </div>
    </div>
  );
}
