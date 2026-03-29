import React, { useState } from 'react';
import type { PlayerStats } from '../../shared/types';

export function PlayerLookup() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerStats[]>([]);

  const handleSearch = async () => {
    if (!window.cardCatcher || !query.trim()) return;
    try {
      const players = await window.cardCatcher.searchPlayers(query);
      setResults(players);
    } catch {
      setResults([]);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '20px', color: '#e0e0e0' }}>
        Player Lookup
      </h2>

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search by player name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          style={{
            flex: 1,
            padding: '10px 14px',
            background: '#12121f',
            border: '1px solid #1e1e35',
            borderRadius: '6px',
            color: '#e0e0e0',
            fontSize: '13px',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSearch}
          style={{
            padding: '10px 20px',
            background: '#8b5cf6',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Search
        </button>
      </div>

      {/* Results */}
      {results.length > 0 ? (
        <div style={{
          background: '#12121f',
          border: '1px solid #1e1e35',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e1e35' }}>
                {['Player', 'Hands', 'VPIP', 'PFR', '3-Bet', 'AF', 'F3B'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px',
                    textAlign: 'left',
                    fontSize: '11px',
                    color: '#666',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #1a1a2e' }}>
                  <td style={cellStyle}>{p.playerName}</td>
                  <td style={cellStyle}>{p.handsPlayed}</td>
                  <td style={cellStyle}>{p.vpip}%</td>
                  <td style={cellStyle}>{p.pfr}%</td>
                  <td style={cellStyle}>{p.threeBet}%</td>
                  <td style={cellStyle}>{p.af}</td>
                  <td style={cellStyle}>{p.foldTo3Bet}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: '#12121f',
          borderRadius: '8px',
          border: '1px solid #1e1e35',
          color: '#555',
          fontSize: '13px',
        }}>
          Search for a player to see their historical stats
        </div>
      )}
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: '13px',
  color: '#ccc',
};
