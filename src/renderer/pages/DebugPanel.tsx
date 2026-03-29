import React, { useState, useEffect, useRef } from 'react';
import type { TableInfo, TableLayout } from '../../shared/types';
import { ROICalibrator } from '../components/ROICalibrator';

interface CalibrationState {
  tableId: string;
  imageBase64: string;
  imageWidth: number;
  imageHeight: number;
  layout: TableLayout;
}

export function DebugPanel() {
  const [logs, setLogs] = useState<string[]>([]);
  const [windows, setWindows] = useState<{ hwnd: number; title: string }[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ocrResults, setOcrResults] = useState<any>(null);
  const [loading, setLoading] = useState('');
  const [calibration, setCalibration] = useState<CalibrationState | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!window.cardCatcher) return;

    window.cardCatcher.onDebugLog((line: string) => {
      setLogs(prev => [...prev.slice(-150), line]);
    });

    window.cardCatcher.getTables().then(setTables).catch(() => {});
    return () => {};
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const scanWindows = async () => {
    setLoading('Scanning...');
    try {
      const result = await window.cardCatcher.debugListWindows();
      setWindows(result);
      setLogs(prev => [...prev, `Found ${result.length} visible windows`]);
    } catch (err: any) {
      setLogs(prev => [...prev, `Error: ${err.message}`]);
    }
    setLoading('');
  };

  const refreshTables = async () => {
    const t = await window.cardCatcher.getTables();
    setTables(t);
    setLogs(prev => [...prev, `${t.length} poker tables detected`]);
  };

  const captureTable = async (tableId: string) => {
    setLoading('Capturing...');
    try {
      const result = await window.cardCatcher.debugCaptureTable(tableId);
      if (result.error) {
        setLogs(prev => [...prev, `Capture error: ${result.error}`]);
      } else if (result.image) {
        setCapturedImage(`data:image/png;base64,${result.image}`);
        setLogs(prev => [...prev, `Captured ${result.width}x${result.height}`]);
      }
    } catch (err: any) {
      setLogs(prev => [...prev, `Error: ${err.message}`]);
    }
    setLoading('');
  };

  const captureROIOverlay = async (tableId: string) => {
    setLoading('Generating ROI overlay...');
    try {
      const result = await window.cardCatcher.debugROIOverlay(tableId);
      if (result.error) {
        setLogs(prev => [...prev, `ROI overlay error: ${result.error}`]);
      } else if (result.image) {
        setCapturedImage(`data:image/png;base64,${result.image}`);
        setLogs(prev => [...prev, `ROI overlay ${result.width}x${result.height} — saved to: ${result.path}`]);
      }
    } catch (err: any) {
      setLogs(prev => [...prev, `Error: ${err.message}`]);
    }
    setLoading('');
  };

  const testOCR = async (tableId: string) => {
    setLoading('Running OCR...');
    try {
      const result = await window.cardCatcher.debugOCRTest(tableId);
      if (result.error) {
        setLogs(prev => [...prev, `OCR error: ${result.error}`]);
      } else {
        setOcrResults(result.snapshot);
        setLogs(prev => [...prev, `OCR complete (layout: ${result.layout})`]);
      }
    } catch (err: any) {
      setLogs(prev => [...prev, `Error: ${err.message}`]);
    }
    setLoading('');
  };

  const startCalibration = async (tableId: string) => {
    setLoading('Capturing for calibration...');
    try {
      const captureResult = await window.cardCatcher.debugCaptureTable(tableId);
      if (captureResult.error || !captureResult.image) {
        setLogs(prev => [...prev, `Capture failed: ${captureResult.error}`]);
        setLoading('');
        return;
      }
      const layouts = await window.cardCatcher.getLayouts();
      const layout = layouts[0]; // ignition-6max
      setCalibration({
        tableId,
        imageBase64: captureResult.image,
        imageWidth: captureResult.width,
        imageHeight: captureResult.height,
        layout,
      });
    } catch (err: any) {
      setLogs(prev => [...prev, `Error: ${err.message}`]);
    }
    setLoading('');
  };

  const handleCalibrationSave = async (rois: { key: string; x: number; y: number; width: number; height: number }[]) => {
    try {
      await (window.cardCatcher as any).debugSaveROIs(rois);
      setLogs(prev => [...prev, `ROIs saved! Restart tracking for changes to take effect.`]);
    } catch (err: any) {
      setLogs(prev => [...prev, `Save error: ${err.message}`]);
    }
    setCalibration(null);
  };

  const buildROIBoxes = (layout: TableLayout) => {
    const colors = ['#ff4444', '#44ff44', '#4488ff', '#ff8800', '#ff44ff', '#44ffff'];
    const boxes: any[] = [];

    const p = layout.regions.pot;
    boxes.push({ key: 'pot', label: 'POT', color: '#ffff00', x: p.x, y: p.y, width: p.width, height: p.height });

    const c = layout.regions.communityCards;
    boxes.push({ key: 'cc', label: 'COMMUNITY', color: '#ffffff', x: c.x, y: c.y, width: c.width, height: c.height });

    for (const seat of layout.regions.seats) {
      const col = colors[seat.seatIndex % colors.length];
      boxes.push({ key: `s${seat.seatIndex}-stack`, label: `S${seat.seatIndex} Stack`, color: col, x: seat.chipStack.x, y: seat.chipStack.y, width: seat.chipStack.width, height: seat.chipStack.height });
      boxes.push({ key: `s${seat.seatIndex}-bet`, label: `S${seat.seatIndex} Bet`, color: col + '99', x: seat.betAmount.x, y: seat.betAmount.y, width: seat.betAmount.width, height: seat.betAmount.height });
    }

    return boxes;
  };

  // Calibration mode — full-page
  if (calibration) {
    return (
      <ROICalibrator
        imageBase64={calibration.imageBase64}
        imageWidth={calibration.imageWidth}
        imageHeight={calibration.imageHeight}
        initialROIs={buildROIBoxes(calibration.layout)}
        onSave={handleCalibrationSave}
        onCancel={() => setCalibration(null)}
      />
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px', color: '#e0e0e0' }}>
        Debug Panel
      </h2>

      {loading && (
        <div style={{ padding: '8px 14px', background: '#1a1a3e', borderRadius: '6px', marginBottom: '12px', color: '#8b5cf6', fontSize: '12px' }}>
          {loading}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <DebugButton label="Scan All Windows" onClick={scanWindows} />
        <DebugButton label="Refresh Tables" onClick={refreshTables} />
        <DebugButton label="Clear Logs" onClick={() => setLogs([])} color="#666" />
      </div>

      {tables.length > 0 && (
        <Section title={`DETECTED POKER TABLES (${tables.length})`}>
          {tables.map(t => (
            <div key={t.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid #1a1a2e',
            }}>
              <div>
                <div style={{ fontSize: '12px', color: '#ccc' }}>{t.title}</div>
                <div style={{ fontSize: '10px', color: '#666' }}>
                  {t.id} | {t.bounds.width}x{t.bounds.height} at ({t.bounds.x},{t.bounds.y}) | {t.site} {t.format}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <DebugButton label="Capture" onClick={() => captureTable(t.id)} small />
                <DebugButton label="OCR Test" onClick={() => testOCR(t.id)} small />
                <DebugButton label="Calibrate" onClick={() => startCalibration(t.id)} small color="#06b6d4" />
                <DebugButton label="Track" onClick={() => window.cardCatcher.startTracking(t.id)} small color="#22c55e" />
              </div>
            </div>
          ))}
        </Section>
      )}

      {windows.length > 0 && (
        <Section title={`ALL VISIBLE WINDOWS (${windows.length})`}>
          <div style={{ maxHeight: '200px', overflow: 'auto', fontSize: '11px', fontFamily: 'monospace' }}>
            {windows.map((w, i) => {
              const isMatch = /poker|ignition|bovada|table|hold|casino|lobby/i.test(w.title);
              return (
                <div key={i} style={{
                  padding: '2px 0', color: isMatch ? '#4ade80' : '#aaa',
                  fontWeight: isMatch ? 'bold' : 'normal',
                }}>
                  {isMatch ? '>>> ' : '    '}{w.title || `(no title, hwnd=${w.hwnd})`}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {capturedImage && (
        <Section title="CAPTURED SCREENSHOT">
          <img src={capturedImage} style={{ maxWidth: '100%', borderRadius: '4px', border: '1px solid #333' }} />
        </Section>
      )}

      {ocrResults && (
        <Section title="OCR RESULTS">
          <pre style={{
            fontSize: '11px', fontFamily: 'monospace', color: '#ccc',
            background: '#0a0a15', padding: '12px', borderRadius: '6px',
            overflow: 'auto', maxHeight: '300px', whiteSpace: 'pre-wrap',
          }}>
            {`Pot: "${ocrResults.pot}"
Community Cards: "${ocrResults.communityCards}"

${ocrResults.seats?.map((s: any) =>
  `Seat ${s.seatIndex}: name="${s.playerName}" stack="${s.chipStack}" bet="${s.betAmount}" action="${s.actionText}" cards="${s.cards}"`
).join('\n')}`}
          </pre>
        </Section>
      )}

      <Section title="LOG OUTPUT">
        <div ref={logRef} style={{
          fontSize: '11px', fontFamily: 'Consolas, Monaco, monospace',
          background: '#0a0a15', padding: '10px', borderRadius: '6px',
          maxHeight: '250px', overflow: 'auto', color: '#8b8ba0',
          lineHeight: '1.5',
        }}>
          {logs.length === 0 ? (
            <span style={{ color: '#444' }}>No logs yet. Click "Scan All Windows" to start debugging.</span>
          ) : (
            logs.map((line, i) => (
              <div key={i} style={{
                color: line.includes('Error') || line.includes('failed') ? '#f87171'
                  : line.includes('MATCH') || line.includes('found') ? '#4ade80'
                  : '#8b8ba0',
              }}>
                {line}
              </div>
            ))
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h3 style={{ fontSize: '11px', fontWeight: '600', color: '#666', letterSpacing: '0.5px', marginBottom: '8px' }}>
        {title}
      </h3>
      <div style={{ background: '#12121f', border: '1px solid #1e1e35', borderRadius: '8px', padding: '12px 16px' }}>
        {children}
      </div>
    </div>
  );
}

function DebugButton({ label, onClick, color, small }: {
  label: string; onClick: () => void; color?: string; small?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: small ? '4px 10px' : '8px 16px',
        borderRadius: '6px',
        border: 'none',
        fontSize: small ? '10px' : '12px',
        fontWeight: '600',
        cursor: 'pointer',
        background: color || '#8b5cf6',
        color: '#fff',
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
      onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
    >
      {label}
    </button>
  );
}
