-- Add hero_cards, hero_seat_index, and pinned columns to hands table
ALTER TABLE hands ADD COLUMN hero_cards TEXT;
ALTER TABLE hands ADD COLUMN hero_seat_index INTEGER;
ALTER TABLE hands ADD COLUMN pinned INTEGER DEFAULT 0;

-- Add player_name column to actions table for easier querying
ALTER TABLE actions ADD COLUMN player_name TEXT;

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  stake TEXT,
  game_type TEXT,
  tables_count INTEGER DEFAULT 1,
  hands_played INTEGER DEFAULT 0,
  pnl REAL DEFAULT 0
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_hands_pinned ON hands(pinned);
CREATE INDEX IF NOT EXISTS idx_hands_table_id ON hands(table_id);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time);
