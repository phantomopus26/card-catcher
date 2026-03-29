CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  site TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(username, site)
);

CREATE TABLE IF NOT EXISTS hands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hand_hash TEXT UNIQUE,
  table_id TEXT NOT NULL,
  site TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  num_seats INTEGER NOT NULL,
  dealer_seat INTEGER NOT NULL,
  pot_total REAL,
  community_cards TEXT,
  went_to_showdown INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS hand_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hand_id INTEGER NOT NULL REFERENCES hands(id),
  player_id INTEGER REFERENCES players(id),
  seat_index INTEGER NOT NULL,
  player_label TEXT NOT NULL,
  hole_cards TEXT,
  starting_stack REAL,
  final_stack REAL,
  is_winner INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hand_id INTEGER NOT NULL REFERENCES hands(id),
  player_seat INTEGER NOT NULL,
  street TEXT NOT NULL,
  action_order INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  amount REAL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hand_players_player ON hand_players(player_id);
CREATE INDEX IF NOT EXISTS idx_hand_players_hand ON hand_players(hand_id);
CREATE INDEX IF NOT EXISTS idx_actions_hand ON actions(hand_id);
CREATE INDEX IF NOT EXISTS idx_hands_site_table ON hands(site, table_id);
CREATE INDEX IF NOT EXISTS idx_hands_timestamp ON hands(timestamp);
