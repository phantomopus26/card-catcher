import React, { useRef, useEffect } from 'react';
import type { PnLPoint } from '../../shared/types';

interface PnLChartProps {
  data: PnLPoint[];
  height?: number;
}

export function PnLChart({ data, height = 220 }: PnLChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 20, right: 16, bottom: 24, left: 50 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Clear
    ctx.clearRect(0, 0, w, h);

    if (data.length < 2) {
      ctx.fillStyle = '#555';
      ctx.font = '12px Consolas, Monaco, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting hand data...', w / 2, h / 2);
      return;
    }

    const amounts = data.map(d => d.amount);
    const minVal = Math.min(0, ...amounts);
    const maxVal = Math.max(0, ...amounts);
    const range = maxVal - minVal || 1;

    // Y-axis scale
    const yScale = (v: number) => pad.top + plotH - ((v - minVal) / range) * plotH;
    const xScale = (i: number) => pad.left + (i / (data.length - 1)) * plotW;

    // Zero line
    const zeroY = yScale(0);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(w - pad.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Grid lines
    ctx.fillStyle = '#555';
    ctx.font = '10px Consolas, Monaco, monospace';
    ctx.textAlign = 'right';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const v = minVal + (range * i) / steps;
      const y = yScale(v);
      ctx.fillText(`$${v.toFixed(0)}`, pad.left - 6, y + 3);
      if (i > 0 && i < steps) {
        ctx.strokeStyle = '#1e1e35';
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
      }
    }

    // Draw fill gradient
    const gradient = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0.15)');
    gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.02)');
    gradient.addColorStop(1, 'rgba(239, 68, 68, 0.15)');

    ctx.beginPath();
    ctx.moveTo(xScale(0), zeroY);
    for (let i = 0; i < data.length; i++) {
      ctx.lineTo(xScale(i), yScale(data[i].amount));
    }
    ctx.lineTo(xScale(data.length - 1), zeroY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    const lastAmount = data[data.length - 1].amount;
    const lineColor = lastAmount >= 0 ? '#22c55e' : '#ef4444';

    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(data[0].amount));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(xScale(i), yScale(data[i].amount));
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Current value dot
    const lastX = xScale(data.length - 1);
    const lastY = yScale(lastAmount);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();

    // Current value label
    ctx.fillStyle = lineColor;
    ctx.font = 'bold 11px Consolas, Monaco, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`$${lastAmount.toFixed(2)}`, lastX + 8, lastY + 4);

    // X-axis label
    ctx.fillStyle = '#555';
    ctx.font = '10px Consolas, Monaco, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${data.length} hands`, w / 2, h - 4);

  }, [data, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${height}px`, display: 'block' }}
    />
  );
}
