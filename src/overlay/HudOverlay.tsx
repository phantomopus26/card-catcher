import React, { useState, useEffect, useCallback } from 'react';
import { PlayerHud } from './PlayerHud';
import { BotAlert } from './BotAlert';
import type { PlayerStats, HudUpdate } from '../shared/types';

declare global {
  interface Window {
    hudAPI: {
      onStatsUpdate: (callback: (data: HudUpdate) => void) => void;
      onLayoutUpdate: (callback: (data: any) => void) => void;
      onVisibility: (callback: (visible: boolean) => void) => void;
      onInit: (callback: (data: { tableId: string }) => void) => void;
      ready: () => void;
      removeAllListeners: () => void;
    };
  }
}

// HUD positions calibrated for Ignition 6-max layout
// Percentage positions (x%, y%) relative to overlay window
// These are offset from player positions so the HUD box doesn't cover seat info
const SEAT_POSITIONS_6MAX: Record<number, { x: number; y: number }> = {
  0: { x: 50, y: 75 },   // Seat 0 (hero, bottom center) — hidden by default
  1: { x: 20, y: 65 },   // Seat 1 (lower-left)
  2: { x: 12, y: 35 },   // Seat 2 (upper-left)
  3: { x: 50, y: 25 },   // Seat 3 (top-center)
  4: { x: 82, y: 35 },   // Seat 4 (upper-right)
  5: { x: 80, y: 65 },   // Seat 5 (lower-right)
};

const SEAT_POSITIONS_9MAX: Record<number, { x: number; y: number }> = {
  0: { x: 42, y: 80 },
  1: { x: 14, y: 72 },
  2: { x: 2, y: 47 },
  3: { x: 14, y: 18 },
  4: { x: 42, y: 5 },
  5: { x: 70, y: 18 },
  6: { x: 82, y: 47 },
  7: { x: 70, y: 72 },
  8: { x: 60, y: 80 },
};

interface BotAlertInfo {
  seatIndex: number;
  reasons: string[];
  timestamp: number;
}

const BOT_SCORE_THRESHOLD = 60;
const ALERT_DURATION_MS = 10000;

export function HudOverlay() {
  const [tableId, setTableId] = useState<string>('');
  const [seats, setSeats] = useState<PlayerStats[]>([]);
  const [heroSeatIndex, setHeroSeatIndex] = useState<number>(0);
  const [visible, setVisible] = useState(true);
  const [seatPositions, setSeatPositions] = useState(SEAT_POSITIONS_6MAX);
  const [botAlerts, setBotAlerts] = useState<BotAlertInfo[]>([]);
  // Track which seats have already triggered an alert (don't re-alert)
  const [alertedSeats, setAlertedSeats] = useState<Set<number>>(new Set());

  // Auto-dismiss bot alerts after ALERT_DURATION_MS
  useEffect(() => {
    if (botAlerts.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setBotAlerts(prev => prev.filter(a => now - a.timestamp < ALERT_DURATION_MS));
    }, 1000);
    return () => clearInterval(timer);
  }, [botAlerts.length]);

  const dismissAlert = useCallback((seatIndex: number) => {
    setBotAlerts(prev => prev.filter(a => a.seatIndex !== seatIndex));
  }, []);

  useEffect(() => {
    if (!window.hudAPI) return;

    window.hudAPI.onInit((data) => {
      setTableId(data.tableId);
      window.hudAPI.ready();
    });

    window.hudAPI.onStatsUpdate((data: HudUpdate) => {
      setSeats(data.seats);
      setHeroSeatIndex(data.heroSeatIndex);
      // Auto-detect layout from seat count
      if (data.seats.length > 6) {
        setSeatPositions(SEAT_POSITIONS_9MAX);
      } else {
        setSeatPositions(SEAT_POSITIONS_6MAX);
      }

      // Check for new bot detections and fire alerts
      for (const s of data.seats) {
        if (s.botScore && s.botScore > BOT_SCORE_THRESHOLD) {
          setAlertedSeats(prev => {
            if (prev.has(s.seatIndex)) return prev;
            // New bot detected — add alert
            setBotAlerts(alerts => [
              ...alerts.filter(a => a.seatIndex !== s.seatIndex),
              {
                seatIndex: s.seatIndex,
                reasons: s.botReasons || [],
                timestamp: Date.now(),
              },
            ]);
            const next = new Set(prev);
            next.add(s.seatIndex);
            return next;
          });
        }
      }
    });

    window.hudAPI.onVisibility((v) => setVisible(v));

    return () => {
      window.hudAPI.removeAllListeners();
    };
  }, []);

  if (!visible) return null;

  const hasData = seats.length > 0;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    }}>
      {/* Status indicator — small dot in top-left to show overlay is active */}
      <div style={{
        position: 'absolute',
        top: '4px',
        left: '4px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        background: 'rgba(0,0,0,0.6)',
        padding: '2px 6px',
        borderRadius: '4px',
        fontSize: '9px',
        color: hasData ? '#22c55e' : '#f59e0b',
        zIndex: 1000,
      }}>
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: hasData ? '#22c55e' : '#f59e0b',
          display: 'inline-block',
        }} />
        {hasData ? 'HUD Active' : 'Waiting for data...'}
      </div>

      {/* Bot alert bar at the top */}
      {botAlerts.map(alert => (
        <BotAlert
          key={alert.seatIndex}
          seatIndex={alert.seatIndex}
          reasons={alert.reasons}
          onDismiss={() => dismissAlert(alert.seatIndex)}
        />
      ))}

      {seats.map((stats) => {
        // Don't show HUD for hero seat (hero stats are on the Dashboard)
        if (stats.seatIndex === heroSeatIndex) return null;
        // Don't show HUD for empty seats
        if (stats.handsPlayed === 0) return null;

        const pos = seatPositions[stats.seatIndex] || { x: 50, y: 50 };
        const isBot = (stats.botScore ?? 0) > BOT_SCORE_THRESHOLD;
        return (
          <PlayerHud
            key={stats.seatIndex}
            stats={stats}
            x={pos.x}
            y={pos.y}
            isBot={isBot}
          />
        );
      })}
    </div>
  );
}
