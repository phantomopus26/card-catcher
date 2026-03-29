import React, { useState, useEffect, useCallback } from 'react';
import type { TableInfo, PlayerStats, HudUpdate, PnLPoint } from '../../shared/types';
import { StatGauge } from '../components/StatGauge';
import { PlayerTable } from '../components/PlayerTable';
import { PnLChart } from '../components/PnLChart';

interface TableData {
  seats: PlayerStats[];
  handsPlayed: number;
  pnlHistory: PnLPoint[];
  heroSeatIndex: number;
}

/** Try to parse big blind from a table title like "$0.25/$0.50" */
function parseBigBlind(title: string): number {
  const m = title.match(/\$[\d.]+\/\$([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

/** Format a stake string from table title e.g. "$0.25/$0.50" */
function parseStakes(title: string): string | null {
  const m = title.match(/(\$[\d.]+\/\$[\d.]+)/);
  return m ? m[1] : null;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function Dashboard() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [trackingTables, setTrackingTables] = useState<Set<string>>(new Set());
  const [tableData, setTableData] = useState<Map<string, TableData>>(new Map());
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [sessionStart] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [lifetimePnL, setLifetimePnL] = useState<number>(0);
  const [lobbyBalance, setLobbyBalance] = useState<number | null>(null);
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualBalance, setManualBalance] = useState<string>('');
  const [editingBalance, setEditingBalance] = useState(false);

  // Auto-update elapsed every 30s
  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - sessionStart), 30000);
    setElapsed(Date.now() - sessionStart);
    return () => clearInterval(id);
  }, [sessionStart]);

  // Fetch lifetime PnL on mount and periodically
  useEffect(() => {
    if (!window.cardCatcher) return;
    const fetchPnL = () => {
      window.cardCatcher.getLifetimePnL().then(setLifetimePnL).catch(() => {});
    };
    fetchPnL();
    const id = setInterval(fetchPnL, 15000);
    return () => clearInterval(id);
  }, []);

  // Fetch lobby balance and ETH price on mount and periodically
  useEffect(() => {
    if (!window.cardCatcher) return;
    const fetchBalanceAndPrice = () => {
      window.cardCatcher.getLobbyBalance().then(setLobbyBalance).catch(() => {});
      window.cardCatcher.getEthPrice().then(setEthPrice).catch(() => {});
    };
    fetchBalanceAndPrice();
    const id = setInterval(fetchBalanceAndPrice, 30000);
    return () => clearInterval(id);
  }, []);

  const scanForTables = useCallback(() => {
    if (!window.cardCatcher) return;
    setScanning(true);
    window.cardCatcher.scanWindows().then(() => {
      window.cardCatcher.getTables().then(setTables).catch(() => {});
    }).catch(() => {
      // fallback: just get tables directly
      window.cardCatcher.getTables().then(setTables).catch(() => {});
    }).finally(() => {
      setTimeout(() => setScanning(false), 800);
    });
  }, []);

  useEffect(() => {
    if (!window.cardCatcher) return;

    // Initial scan
    scanForTables();

    window.cardCatcher.onTableFound((table) => {
      setTables(prev => [...prev.filter(t => t.id !== table.id), table]);
    });

    window.cardCatcher.onTableLost((tableId) => {
      setTables(prev => prev.filter(t => t.id !== tableId));
      setTrackingTables(prev => {
        const next = new Set(prev);
        next.delete(tableId);
        return next;
      });
    });

    window.cardCatcher.onStatsUpdated((data: HudUpdate) => {
      setTableData(prev => {
        const next = new Map(prev);
        next.set(data.tableId, {
          seats: data.seats,
          handsPlayed: data.handsPlayed || 0,
          pnlHistory: data.pnlHistory || [],
          heroSeatIndex: data.heroSeatIndex ?? 0,
        });
        return next;
      });
    });
  }, []);

  const toggleTracking = useCallback(async (tableId: string) => {
    if (trackingTables.has(tableId)) {
      await window.cardCatcher.stopTracking(tableId);
      setTrackingTables(prev => {
        const next = new Set(prev);
        next.delete(tableId);
        return next;
      });
    } else {
      await window.cardCatcher.startTracking(tableId);
      setTrackingTables(prev => new Set(prev).add(tableId));
      setSelectedTable(tableId);
    }
  }, [trackingTables]);

  // Current table data
  const currentData = selectedTable ? tableData.get(selectedTable) : null;
  const allSeats = currentData?.seats || [];
  const handsPlayed = currentData?.handsPlayed || 0;
  const pnlHistory = currentData?.pnlHistory || [];
  const heroSeatIndex = currentData?.heroSeatIndex ?? 0;
  const heroStats = allSeats.find(s => s.seatIndex === heroSeatIndex);

  // Total hands across all tables
  let totalHands = 0;
  for (const td of tableData.values()) {
    totalHands += td.handsPlayed;
  }

  // Session PnL
  const sessionPnL = pnlHistory.length > 0 ? pnlHistory[pnlHistory.length - 1].amount : 0;

  // Parse BB from selected table title for buy-in calculation
  const selectedTableInfo = tables.find(t => t.id === selectedTable);
  const bigBlind = selectedTableInfo ? parseBigBlind(selectedTableInfo.title) : 0;
  const buyIn = bigBlind > 0 ? bigBlind * 100 : 0; // 100 BB
  const stakes = selectedTableInfo ? parseStakes(selectedTableInfo.title) : null;

  const sessionBuyIns = buyIn > 0 ? sessionPnL / buyIn : null;
  const lifetimeBuyIns = buyIn > 0 ? lifetimePnL / buyIn : null;

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    }}>
      {/* ── Table Tabs ── */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {tables.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0' }}>
            <button
              onClick={scanForTables}
              disabled={scanning}
              style={{
                padding: '10px 24px',
                borderRadius: '8px',
                border: '1px solid #8b5cf6',
                fontSize: '13px',
                fontWeight: '600',
                cursor: scanning ? 'wait' : 'pointer',
                background: scanning ? '#1a1a3a' : 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                color: '#fff',
                transition: 'all 0.2s ease',
                boxShadow: '0 0 12px rgba(139,92,246,0.3)',
              }}
            >
              {scanning ? '\u21BB Scanning...' : '\u{1F50D} Scan for Tables'}
            </button>
            <span style={{ color: '#555', fontSize: '13px' }}>
              Open a poker table, then click scan
            </span>
          </div>
        ) : (
          <>
          {tables.map(table => {
            const isTracking = trackingTables.has(table.id);
            const isSelected = selectedTable === table.id;
            return (
              <div key={table.id} style={{ display: 'flex', gap: '2px' }}>
                <button
                  onClick={() => setSelectedTable(table.id)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px 0 0 6px',
                    border: `1px solid ${isSelected ? '#8b5cf6' : '#1e1e35'}`,
                    borderRight: 'none',
                    fontSize: '12px',
                    fontWeight: isSelected ? '600' : '400',
                    cursor: 'pointer',
                    background: isSelected ? '#1a1a3a' : '#0d0d18',
                    color: isSelected ? '#e0e0e0' : '#888',
                    boxShadow: isSelected ? '0 0 8px rgba(139,92,246,0.3), inset 0 0 4px rgba(139,92,246,0.1)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {table.title.substring(0, 30)}
                  {isTracking && <span style={{ color: '#22c55e', marginLeft: '6px' }}>{'\u25CF'}</span>}
                </button>
                <button
                  onClick={() => toggleTracking(table.id)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '0 6px 6px 0',
                    border: `1px solid ${isSelected ? '#8b5cf6' : '#1e1e35'}`,
                    fontSize: '11px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    background: isTracking ? '#dc2626' : '#8b5cf6',
                    color: '#fff',
                    transition: 'background 0.15s ease',
                  }}
                >
                  {isTracking ? 'Stop' : 'Track'}
                </button>
              </div>
            );
          })}
          <button
            onClick={scanForTables}
            disabled={scanning}
            title="Rescan for tables"
            style={{
              padding: '7px 12px',
              borderRadius: '6px',
              border: '1px solid #1e1e35',
              fontSize: '12px',
              cursor: scanning ? 'wait' : 'pointer',
              background: '#0d0d18',
              color: '#888',
              transition: 'all 0.15s ease',
            }}
          >
            {scanning ? '\u21BB' : '\u{1F50D}'}
          </button>
          </>
        )}
      </div>

      {/* ── Hero Stats Gauges (prominent, full width) ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0d0d18 0%, #12122a 100%)',
        border: '1px solid #1e1e35',
        borderRadius: '10px',
        padding: '18px 20px',
      }}>
        <div style={{
          fontSize: '11px',
          color: '#666',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: '14px',
          fontWeight: '600',
        }}>
          Hero Stats {heroStats ? `\u2014 ${heroStats.handsPlayed} hands` : ''}
        </div>
        <div style={{
          display: 'flex',
          gap: '14px',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          <StatGauge label="VPIP" value={heroStats?.vpip || 0} statKey="vpip" />
          <StatGauge label="PFR" value={heroStats?.pfr || 0} statKey="pfr" />
          <StatGauge label="3-Bet" value={heroStats?.threeBet || 0} statKey="threeBet" suffix="%" />
          <StatGauge label="AF" value={heroStats?.af || 0} statKey="af" decimals={1} />
          <StatGauge label="Fold to 3-Bet" value={heroStats?.foldTo3Bet || 0} statKey="foldTo3Bet" />
        </div>
      </div>

      {/* ── Session Info + PnL Row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
      }}>
        {/* Session Info Panel */}
        <div style={{
          background: '#0d0d18',
          border: '1px solid #1e1e35',
          borderRadius: '10px',
          padding: '16px 18px',
        }}>
          <div style={{
            fontSize: '11px',
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '14px',
            fontWeight: '600',
          }}>
            Session Info
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <SessionRow label="Started" value={formatDateTime(sessionStart)} />
            <SessionRow label="Duration" value={formatDuration(elapsed)} />
            <SessionRow label="Tables" value={`${trackingTables.size}`} />
            <SessionRow label="Total Hands" value={`${totalHands}`} />
            {stakes && <SessionRow label="Stakes" value={stakes} accent />}
            <SessionRow label="Game Type" value="Cash Game" accent />
          </div>
        </div>

        {/* PnL Panel */}
        <div style={{
          background: '#0d0d18',
          border: '1px solid #1e1e35',
          borderRadius: '10px',
          padding: '16px 18px',
        }}>
          <div style={{
            fontSize: '11px',
            color: '#666',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '14px',
            fontWeight: '600',
          }}>
            Profit / Loss
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <SessionRow
              label="Session PnL"
              value={`${sessionPnL >= 0 ? '+' : ''}$${sessionPnL.toFixed(2)}`}
              color={sessionPnL >= 0 ? '#22c55e' : '#ef4444'}
            />
            {sessionBuyIns !== null && (
              <SessionRow
                label="Session BI"
                value={`${sessionBuyIns >= 0 ? '+' : ''}${sessionBuyIns.toFixed(2)} BI`}
                color={sessionBuyIns >= 0 ? '#22c55e' : '#ef4444'}
              />
            )}
            <SessionRow
              label="Lifetime PnL"
              value={`${lifetimePnL >= 0 ? '+' : ''}$${lifetimePnL.toFixed(2)}`}
              color={lifetimePnL >= 0 ? '#22c55e' : '#ef4444'}
            />
            {lifetimeBuyIns !== null && (
              <SessionRow
                label="Lifetime BI"
                value={`${lifetimeBuyIns >= 0 ? '+' : ''}${lifetimeBuyIns.toFixed(2)} BI`}
                color={lifetimeBuyIns >= 0 ? '#22c55e' : '#ef4444'}
              />
            )}
            {handsPlayed > 0 && (
              <SessionRow
                label="bb/100"
                value={(() => {
                  const bb100 = handsPlayed > 0 ? (sessionPnL / handsPlayed) * 100 : 0;
                  return `${bb100 >= 0 ? '+' : ''}${bb100.toFixed(1)}`;
                })()}
                color={sessionPnL >= 0 ? '#22c55e' : '#ef4444'}
              />
            )}
            <div style={{ borderTop: '1px solid #1e1e35', margin: '4px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#777' }}>Account Balance</span>
              {editingBalance ? (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const val = parseFloat(manualBalance);
                  if (!isNaN(val) && val > 0) {
                    setLobbyBalance(val);
                  }
                  setEditingBalance(false);
                }} style={{ display: 'flex', gap: '4px' }}>
                  <input
                    autoFocus
                    type="text"
                    placeholder="189.87"
                    value={manualBalance}
                    onChange={(e) => setManualBalance(e.target.value)}
                    style={{
                      width: '80px',
                      padding: '2px 6px',
                      fontSize: '13px',
                      fontFamily: 'Consolas, Monaco, monospace',
                      background: '#0a0a1a',
                      border: '1px solid #8b5cf6',
                      borderRadius: '4px',
                      color: '#e0e0e0',
                      textAlign: 'right',
                    }}
                  />
                  <button type="submit" style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    background: '#8b5cf6',
                    border: 'none',
                    borderRadius: '4px',
                    color: '#fff',
                    cursor: 'pointer',
                  }}>{'\u2713'}</button>
                </form>
              ) : (
                <span
                  onClick={() => { setEditingBalance(true); setManualBalance(lobbyBalance?.toFixed(2) || ''); }}
                  title="Click to edit balance"
                  style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#8b5cf6',
                    fontFamily: 'Consolas, Monaco, monospace',
                    cursor: 'pointer',
                    borderBottom: '1px dashed #8b5cf644',
                  }}
                >
                  {lobbyBalance !== null ? `$${lobbyBalance.toFixed(2)}` : 'Click to set'}
                </span>
              )}
            </div>
            {lobbyBalance !== null && ethPrice !== null && (
              <SessionRow
                label={'\u039E Balance (ETH)'}
                value={`\u039E${(lobbyBalance / ethPrice).toFixed(4)}`}
                color="#8b5cf6"
              />
            )}
            {ethPrice !== null && (
              <SessionRow
                label="ETH/USD"
                value={`$${ethPrice.toLocaleString()}`}
                color="#666"
              />
            )}
          </div>
        </div>
      </div>

      {/* ── PnL Chart (larger) ── */}
      <div style={{
        background: '#0d0d18',
        border: '1px solid #1e1e35',
        borderRadius: '10px',
        padding: '16px 18px',
      }}>
        <div style={{
          fontSize: '11px',
          color: '#666',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: '10px',
          fontWeight: '600',
        }}>
          Money Won
        </div>
        <PnLChart data={pnlHistory} height={220} />
      </div>

      {/* ── Player Stats Table ── */}
      <div style={{
        background: '#0d0d18',
        border: '1px solid #1e1e35',
        borderRadius: '10px',
        padding: '16px 18px',
      }}>
        <div style={{
          fontSize: '11px',
          color: '#666',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          marginBottom: '10px',
          fontWeight: '600',
        }}>
          Player Stats {selectedTable ? '' : '(select a table)'}
        </div>
        <PlayerTable
          players={allSeats.filter(s => s.seatIndex !== heroSeatIndex)}
          heroSeatIndex={heroSeatIndex}
        />
      </div>
    </div>
  );
}

function SessionRow({
  label,
  value,
  color,
  accent,
}: {
  label: string;
  value: string;
  color?: string;
  accent?: boolean;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '12px', color: '#777' }}>{label}</span>
      <span style={{
        fontSize: '14px',
        fontWeight: '600',
        color: color || (accent ? '#8b5cf6' : '#e0e0e0'),
        fontFamily: 'Consolas, Monaco, monospace',
      }}>
        {value}
      </span>
    </div>
  );
}
