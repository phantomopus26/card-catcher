import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ROIBox {
  key: string;
  label: string;
  color: string;
  x: number; // percentage 0-1
  y: number;
  width: number;
  height: number;
}

interface Props {
  imageBase64: string;
  imageWidth: number;
  imageHeight: number;
  initialROIs: ROIBox[];
  onSave: (rois: ROIBox[]) => void;
  onCancel: () => void;
}

export function ROICalibrator({ imageBase64, imageWidth, imageHeight, initialROIs, onSave, onCancel }: Props) {
  const [rois, setROIs] = useState<ROIBox[]>(initialROIs);
  const [selectedROI, setSelectedROI] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ type: 'move' | 'resize'; startX: number; startY: number; origROI: ROIBox } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayScale, setDisplayScale] = useState(1);

  // Calculate display scale (image scaled to fit container)
  useEffect(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      setDisplayScale(containerWidth / imageWidth);
    }
  }, [imageWidth]);

  const getMousePos = useCallback((e: React.MouseEvent): { px: number; py: number } => {
    if (!containerRef.current) return { px: 0, py: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / (rect.width);
    const py = (e.clientY - rect.top) / (rect.width / imageWidth * imageHeight > rect.height
      ? rect.height : rect.width / imageWidth * imageHeight);
    // Use the image display dimensions
    const dispW = rect.width;
    const dispH = dispW * (imageHeight / imageWidth);
    return {
      px: (e.clientX - rect.left) / dispW,
      py: (e.clientY - rect.top) / dispH,
    };
  }, [imageWidth, imageHeight]);

  const handleMouseDown = useCallback((e: React.MouseEvent, key: string, type: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    const roi = rois.find(r => r.key === key);
    if (!roi) return;
    const pos = getMousePos(e);
    setSelectedROI(key);
    setDragging({ type, startX: pos.px, startY: pos.py, origROI: { ...roi } });
  }, [rois, getMousePos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !selectedROI) return;
    const pos = getMousePos(e);
    const dx = pos.px - dragging.startX;
    const dy = pos.py - dragging.startY;
    const orig = dragging.origROI;

    setROIs(prev => prev.map(r => {
      if (r.key !== selectedROI) return r;
      if (dragging.type === 'move') {
        return { ...r, x: Math.max(0, Math.min(1 - r.width, orig.x + dx)), y: Math.max(0, Math.min(1 - r.height, orig.y + dy)) };
      } else {
        // resize from bottom-right
        return { ...r, width: Math.max(0.01, orig.width + dx), height: Math.max(0.01, orig.height + dy) };
      }
    }));
  }, [dragging, selectedROI, getMousePos]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const dispW = containerRef.current?.clientWidth || 800;
  const dispH = dispW * (imageHeight / imageWidth);

  return (
    <div style={{ background: '#0a0a18', borderRadius: '8px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#e0e0e0' }}>
          ROI Calibration — drag rectangles to position, drag corners to resize
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={onCancel} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#333', color: '#ccc', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={() => onSave(rois)} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#22c55e', color: '#fff', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
            Save ROIs
          </button>
        </div>
      </div>

      {/* ROI list / selector */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '10px' }}>
        {rois.map(r => (
          <button
            key={r.key}
            onClick={() => setSelectedROI(r.key === selectedROI ? null : r.key)}
            style={{
              padding: '3px 8px', borderRadius: '4px', border: `2px solid ${r.color}`,
              background: r.key === selectedROI ? r.color + '40' : 'transparent',
              color: r.color, fontSize: '10px', fontWeight: '600', cursor: 'pointer',
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Image with ROI overlays */}
      <div
        ref={containerRef}
        style={{ position: 'relative', width: '100%', cursor: dragging ? 'grabbing' : 'default', userSelect: 'none' }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={`data:image/png;base64,${imageBase64}`}
          style={{ width: '100%', display: 'block', borderRadius: '4px' }}
          draggable={false}
        />
        {/* ROI rectangles */}
        {rois.map(r => {
          const isSelected = r.key === selectedROI;
          return (
            <div key={r.key}>
              {/* Main rectangle — drag to move */}
              <div
                onMouseDown={(e) => handleMouseDown(e, r.key, 'move')}
                style={{
                  position: 'absolute',
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.width * 100}%`,
                  height: `${r.height * 100}%`,
                  border: `2px solid ${r.color}`,
                  background: isSelected ? r.color + '20' : 'transparent',
                  cursor: 'grab',
                  boxSizing: 'border-box',
                  zIndex: isSelected ? 10 : 1,
                }}
              >
                {/* Label */}
                <div style={{
                  position: 'absolute', top: '-16px', left: '0',
                  fontSize: '9px', fontWeight: '700', color: r.color,
                  background: '#000a', padding: '1px 4px', borderRadius: '2px',
                  whiteSpace: 'nowrap', pointerEvents: 'none',
                }}>
                  {r.label}
                </div>
                {/* Resize handle — bottom-right corner */}
                <div
                  onMouseDown={(e) => handleMouseDown(e, r.key, 'resize')}
                  style={{
                    position: 'absolute', bottom: '-4px', right: '-4px',
                    width: '8px', height: '8px', background: r.color,
                    cursor: 'nwse-resize', borderRadius: '2px',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected ROI details */}
      {selectedROI && (() => {
        const r = rois.find(roi => roi.key === selectedROI);
        if (!r) return null;
        return (
          <div style={{ marginTop: '10px', fontSize: '11px', fontFamily: 'monospace', color: '#aaa', background: '#0d0d1a', padding: '8px 12px', borderRadius: '4px' }}>
            <span style={{ color: r.color, fontWeight: '700' }}>{r.label}</span>
            {' '}x={r.x.toFixed(3)} y={r.y.toFixed(3)} w={r.width.toFixed(3)} h={r.height.toFixed(3)}
            {' '}| px: ({Math.round(r.x * imageWidth)},{Math.round(r.y * imageHeight)}) {Math.round(r.width * imageWidth)}x{Math.round(r.height * imageHeight)}
          </div>
        );
      })()}
    </div>
  );
}
