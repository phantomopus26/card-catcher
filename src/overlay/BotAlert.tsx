import React, { useEffect, useState } from 'react';

interface BotAlertProps {
  seatIndex: number;
  reasons: string[];
  onDismiss: () => void;
}

export function BotAlert({ seatIndex, reasons, onDismiss }: BotAlertProps) {
  const [opacity, setOpacity] = useState(0);

  // Fade in on mount
  useEffect(() => {
    const timer = setTimeout(() => setOpacity(1), 50);
    return () => clearTimeout(timer);
  }, []);

  // Auto-fade out before dismissal
  useEffect(() => {
    const fadeTimer = setTimeout(() => setOpacity(0), 8500);
    const dismissTimer = setTimeout(onDismiss, 10000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  return (
    <div
      style={{
        position: 'absolute',
        top: '4px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.9), rgba(249, 115, 22, 0.9))',
        borderRadius: '6px',
        padding: '6px 14px',
        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
        fontSize: '12px',
        color: '#fff',
        whiteSpace: 'nowrap',
        zIndex: 2000,
        pointerEvents: 'auto',
        cursor: 'pointer',
        boxShadow: '0 2px 10px rgba(239, 68, 68, 0.5), 0 0 20px rgba(239, 68, 68, 0.3)',
        opacity,
        transition: 'opacity 0.5s ease-in-out',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        animation: 'botAlertSlideIn 0.3s ease-out',
      }}
      onClick={onDismiss}
      title="Click to dismiss"
    >
      <style>{`
        @keyframes botAlertSlideIn {
          from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>

      <span style={{ fontSize: '14px' }}>{'\u26A0\uFE0F'}</span>
      <span>
        <strong>Possible bot detected at Seat {seatIndex + 1}</strong>
        {reasons.length > 0 && (
          <span style={{ marginLeft: '6px', opacity: 0.85, fontSize: '11px' }}>
            — {reasons.slice(0, 2).join(', ')}
          </span>
        )}
      </span>
      <span style={{ opacity: 0.6, fontSize: '10px', marginLeft: '4px' }}>[click to dismiss]</span>
    </div>
  );
}
