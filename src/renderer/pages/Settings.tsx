import React, { useState } from 'react';

export function Settings() {
  const [captureRate, setCaptureRate] = useState(2);
  const [overlayOpacity, setOverlayOpacity] = useState(88);
  const [fontSize, setFontSize] = useState(11);

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px', color: '#e0e0e0' }}>
        Settings
      </h2>

      {/* General Settings */}
      <Section title="CAPTURE">
        <SettingRow label="Capture Rate (FPS)">
          <input
            type="range"
            min={1}
            max={4}
            value={captureRate}
            onChange={(e) => setCaptureRate(Number(e.target.value))}
            style={sliderStyle}
          />
          <span style={valueStyle}>{captureRate} FPS</span>
        </SettingRow>
      </Section>

      <Section title="HUD DISPLAY">
        <SettingRow label="Overlay Opacity">
          <input
            type="range"
            min={50}
            max={100}
            value={overlayOpacity}
            onChange={(e) => setOverlayOpacity(Number(e.target.value))}
            style={sliderStyle}
          />
          <span style={valueStyle}>{overlayOpacity}%</span>
        </SettingRow>

        <SettingRow label="Font Size">
          <input
            type="range"
            min={9}
            max={16}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            style={sliderStyle}
          />
          <span style={valueStyle}>{fontSize}px</span>
        </SettingRow>
      </Section>

      <Section title="TABLE LAYOUTS">
        <div style={{ color: '#888', fontSize: '12px', padding: '8px 0' }}>
          <p style={{ marginBottom: '8px' }}>Pre-configured layouts:</p>
          <ul style={{ paddingLeft: '16px', lineHeight: '1.8' }}>
            <li>Ignition 6-Max</li>
            <li>Ignition 9-Max</li>
          </ul>
          <p style={{ marginTop: '12px', color: '#666' }}>
            Custom layout calibration tool coming soon.
          </p>
        </div>
      </Section>

      <Section title="KEYBOARD SHORTCUTS">
        <div style={{ color: '#888', fontSize: '12px', padding: '8px 0' }}>
          <ShortcutRow keys="Alt + H" description="Toggle HUD click-through / interactive mode" />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{
        fontSize: '11px',
        fontWeight: '600',
        color: '#666',
        letterSpacing: '0.5px',
        marginBottom: '12px',
      }}>
        {title}
      </h3>
      <div style={{
        background: '#12121f',
        border: '1px solid #1e1e35',
        borderRadius: '8px',
        padding: '12px 18px',
      }}>
        {children}
      </div>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 0',
      borderBottom: '1px solid #1a1a2e',
    }}>
      <label style={{ fontSize: '13px', color: '#ccc' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {children}
      </div>
    </div>
  );
}

function ShortcutRow({ keys, description }: { keys: string; description: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <code style={{
        background: '#1a1a2e',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        color: '#8b5cf6',
      }}>
        {keys}
      </code>
      <span style={{ fontSize: '12px', color: '#888' }}>{description}</span>
    </div>
  );
}

const sliderStyle: React.CSSProperties = {
  width: '120px',
  accentColor: '#8b5cf6',
};

const valueStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#8b5cf6',
  minWidth: '40px',
  textAlign: 'right' as const,
};
