import React, { useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { Coach } from './pages/Coach';
import { HandHistory } from './pages/HandHistory';
import { Settings } from './pages/Settings';
import { PlayerLookup } from './pages/PlayerLookup';
import { DebugPanel } from './pages/DebugPanel';

type Page = 'dashboard' | 'coach' | 'hands' | 'settings' | 'players' | 'debug';

export function App() {
  const [page, setPage] = useState<Page>('dashboard');

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f1a' }}>
      {/* Sidebar Navigation */}
      <nav style={{
        width: '200px',
        background: '#12121f',
        borderRight: '1px solid #1e1e35',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 0',
      }}>
        <div style={{
          padding: '8px 20px 24px',
          borderBottom: '1px solid #1e1e35',
          marginBottom: '8px',
        }}>
          <h1 style={{
            fontSize: '18px',
            fontWeight: 'bold',
            color: '#8b5cf6',
            letterSpacing: '0.5px',
          }}>
            Card Catcher
          </h1>
          <span style={{ fontSize: '11px', color: '#555' }}>Poker HUD</span>
        </div>

        <NavItem
          label="Dashboard"
          icon="⊞"
          active={page === 'dashboard'}
          onClick={() => setPage('dashboard')}
        />
        <NavItem
          label="Coach"
          icon="⊛"
          active={page === 'coach'}
          onClick={() => setPage('coach')}
        />
        <NavItem
          label="Hands"
          icon="📋"
          active={page === 'hands'}
          onClick={() => setPage('hands')}
        />
        <NavItem
          label="Players"
          icon="⊕"
          active={page === 'players'}
          onClick={() => setPage('players')}
        />
        <NavItem
          label="Settings"
          icon="⊙"
          active={page === 'settings'}
          onClick={() => setPage('settings')}
        />
        <NavItem
          label="Debug"
          icon="⊘"
          active={page === 'debug'}
          onClick={() => setPage('debug')}
        />

        <div style={{ flex: 1 }} />
        <div style={{ padding: '12px 20px', color: '#444', fontSize: '10px' }}>
          v1.0.0
        </div>
      </nav>

      {/* Main Content */}
      <main style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        {page === 'dashboard' && <Dashboard />}
        {page === 'coach' && <Coach />}
        {page === 'hands' && <HandHistory />}
        {page === 'settings' && <Settings />}
        {page === 'players' && <PlayerLookup />}
        {page === 'debug' && <DebugPanel />}
      </main>
    </div>
  );
}

function NavItem({ label, icon, active, onClick }: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 20px',
        border: 'none',
        background: active ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
        borderLeft: active ? '3px solid #8b5cf6' : '3px solid transparent',
        color: active ? '#c4b5fd' : '#888',
        cursor: 'pointer',
        fontSize: '13px',
        textAlign: 'left',
        width: '100%',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span style={{ fontSize: '16px' }}>{icon}</span>
      {label}
    </button>
  );
}
