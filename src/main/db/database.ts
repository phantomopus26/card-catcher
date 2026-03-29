import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import type { HandRecord, HandPlayer, PlayerAction } from '../../shared/types';

let db: Database.Database | null = null;

// ============ Prepared statement cache ============
let stmtCache: {
  insertHand: Database.Statement;
  insertPlayer: Database.Statement;
  insertAction: Database.Statement;
  selectHandById: Database.Statement;
  selectPlayersByHand: Database.Statement;
  selectActionsByHand: Database.Statement;
  selectRecentHands: Database.Statement;
  selectPinnedHands: Database.Statement;
  pinHand: Database.Statement;
  unpinHand: Database.Statement;
  countHands: Database.Statement;
  lifetimePnL: Database.Statement;
  sessionPnL: Database.Statement;
} | null = null;

// ============ Initialization ============

function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  const dbDir = path.join(userDataPath, 'data');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return path.join(dbDir, 'card-catcher.db');
}

export function initDatabase(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  // Prepare cached statements
  prepareStatements(db);

  return db;
}

function runMigrations(database: Database.Database): void {
  // Track which migrations have been applied
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    (database.prepare('SELECT name FROM _migrations').all() as { name: string }[])
      .map(r => r.name)
  );

  const migrationsDir = path.join(__dirname, 'migrations');
  const migrationFiles = [
    '001-initial.sql',
    '002-hand-history.sql',
  ];

  for (const filename of migrationFiles) {
    if (applied.has(filename)) continue;

    let sql: string;
    const filePath = path.join(migrationsDir, filename);

    if (fs.existsSync(filePath)) {
      sql = fs.readFileSync(filePath, 'utf-8');
    } else {
      // Inline fallback for packaged app
      sql = getInlineMigration(filename);
      if (!sql) continue;
    }

    // Execute each statement separately to handle ALTER TABLE gracefully
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      try {
        database.exec(stmt + ';');
      } catch (err: any) {
        // Ignore "duplicate column" errors from re-running ALTER TABLE
        if (err.message?.includes('duplicate column')) continue;
        // Ignore "table already exists" for CREATE TABLE IF NOT EXISTS
        if (err.message?.includes('already exists')) continue;
        throw err;
      }
    }

    database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(filename);
    console.log(`[DB] Applied migration: ${filename}`);
  }
}

function getInlineMigration(name: string): string {
  if (name === '001-initial.sql') {
    return `
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
        went_to_showdown INTEGER DEFAULT 0,
        hero_cards TEXT,
        hero_seat_index INTEGER,
        pinned INTEGER DEFAULT 0
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
        player_name TEXT,
        street TEXT NOT NULL,
        action_order INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        amount REAL DEFAULT 0
      );
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
      CREATE INDEX IF NOT EXISTS idx_hand_players_player ON hand_players(player_id);
      CREATE INDEX IF NOT EXISTS idx_hand_players_hand ON hand_players(hand_id);
      CREATE INDEX IF NOT EXISTS idx_actions_hand ON actions(hand_id);
      CREATE INDEX IF NOT EXISTS idx_hands_site_table ON hands(site, table_id);
      CREATE INDEX IF NOT EXISTS idx_hands_timestamp ON hands(timestamp);
      CREATE INDEX IF NOT EXISTS idx_hands_pinned ON hands(pinned);
      CREATE INDEX IF NOT EXISTS idx_hands_table_id ON hands(table_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time);
    `;
  }
  if (name === '002-hand-history.sql') {
    return `
      ALTER TABLE hands ADD COLUMN hero_cards TEXT;
      ALTER TABLE hands ADD COLUMN hero_seat_index INTEGER;
      ALTER TABLE hands ADD COLUMN pinned INTEGER DEFAULT 0;
      ALTER TABLE actions ADD COLUMN player_name TEXT;
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
      CREATE INDEX IF NOT EXISTS idx_hands_pinned ON hands(pinned);
      CREATE INDEX IF NOT EXISTS idx_hands_table_id ON hands(table_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time);
    `;
  }
  return '';
}

function prepareStatements(database: Database.Database): void {
  stmtCache = {
    insertHand: database.prepare(`
      INSERT OR IGNORE INTO hands
        (hand_hash, table_id, site, timestamp, num_seats, dealer_seat, pot_total, community_cards, went_to_showdown, hero_cards, hero_seat_index, pinned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `),

    insertPlayer: database.prepare(`
      INSERT INTO hand_players (hand_id, seat_index, player_label, hole_cards, starting_stack, final_stack, is_winner)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),

    insertAction: database.prepare(`
      INSERT INTO actions (hand_id, player_seat, player_name, street, action_order, action_type, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),

    selectHandById: database.prepare('SELECT * FROM hands WHERE id = ?'),
    selectPlayersByHand: database.prepare('SELECT * FROM hand_players WHERE hand_id = ? ORDER BY seat_index'),
    selectActionsByHand: database.prepare('SELECT * FROM actions WHERE hand_id = ? ORDER BY action_order'),
    selectRecentHands: database.prepare('SELECT * FROM hands ORDER BY timestamp DESC LIMIT ?'),
    selectPinnedHands: database.prepare('SELECT * FROM hands WHERE pinned = 1 ORDER BY timestamp DESC'),
    pinHand: database.prepare('UPDATE hands SET pinned = 1 WHERE id = ?'),
    unpinHand: database.prepare('UPDATE hands SET pinned = 0 WHERE id = ?'),
    countHands: database.prepare('SELECT COUNT(*) as count FROM hands'),
    lifetimePnL: database.prepare(`
      SELECT COALESCE(SUM(hp.final_stack - hp.starting_stack), 0) as pnl
      FROM hand_players hp
      INNER JOIN hands h ON hp.hand_id = h.id
      WHERE hp.seat_index = h.hero_seat_index
    `),
    sessionPnL: database.prepare(`
      SELECT COALESCE(SUM(hp.final_stack - hp.starting_stack), 0) as pnl
      FROM hand_players hp
      INNER JOIN hands h ON hp.hand_id = h.id
      INNER JOIN sessions s ON h.timestamp BETWEEN s.start_time AND COALESCE(s.end_time, 9999999999999)
      WHERE s.id = ? AND hp.seat_index = h.hero_seat_index
    `),
  };
}

// ============ Helpers ============

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function closeDatabase(): void {
  stmtCache = null;
  if (db) {
    db.close();
    db = null;
  }
}

function rowToHandRecord(row: any): HandRecord {
  const database = getDatabase();
  const players = (stmtCache!.selectPlayersByHand.all(row.id) as any[]).map(p => ({
    seatIndex: p.seat_index,
    playerName: p.player_label,
    holeCards: p.hole_cards ? JSON.parse(p.hole_cards) : null,
    startingStack: p.starting_stack,
    finalStack: p.final_stack,
    isWinner: p.is_winner === 1,
  } as HandPlayer));

  const actions = (stmtCache!.selectActionsByHand.all(row.id) as any[]).map(a => ({
    seatIndex: a.player_seat,
    playerName: a.player_name || '',
    action: a.action_type,
    amount: a.amount,
    street: a.street,
    order: a.action_order,
  } as PlayerAction));

  return {
    id: row.id,
    tableId: row.table_id,
    site: row.site,
    timestamp: row.timestamp,
    numSeats: row.num_seats,
    dealerSeat: row.dealer_seat,
    potTotal: row.pot_total,
    communityCards: row.community_cards ? JSON.parse(row.community_cards) : [],
    heroCards: row.hero_cards ? JSON.parse(row.hero_cards) : null,
    wentToShowdown: row.went_to_showdown === 1,
    players,
    actions,
  };
}

// ============ Public API ============

export function saveHand(hand: HandRecord, heroSeatIndex?: number): number {
  const database = getDatabase();
  if (!stmtCache) throw new Error('Statements not prepared');

  const hash = `${hand.timestamp}-${hand.tableId}-${hand.dealerSeat}`;
  const seatIdx = heroSeatIndex ?? hand.players.findIndex(p =>
    hand.heroCards && p.holeCards &&
    JSON.stringify(p.holeCards) === JSON.stringify(hand.heroCards)
  );

  const saveAll = database.transaction(() => {
    const result = stmtCache!.insertHand.run(
      hash,
      hand.tableId,
      hand.site,
      hand.timestamp,
      hand.numSeats,
      hand.dealerSeat,
      hand.potTotal,
      JSON.stringify(hand.communityCards),
      hand.wentToShowdown ? 1 : 0,
      hand.heroCards ? JSON.stringify(hand.heroCards) : null,
      seatIdx >= 0 ? seatIdx : null,
    );

    const handId = result.lastInsertRowid as number;
    if (handId === 0) return 0; // duplicate

    for (const player of hand.players) {
      stmtCache!.insertPlayer.run(
        handId,
        player.seatIndex,
        player.playerName,
        player.holeCards ? JSON.stringify(player.holeCards) : null,
        player.startingStack,
        player.finalStack,
        player.isWinner ? 1 : 0,
      );
    }

    for (const action of hand.actions) {
      stmtCache!.insertAction.run(
        handId,
        action.seatIndex,
        action.playerName,
        action.street,
        action.order,
        action.action,
        action.amount,
      );
    }

    return handId;
  });

  return saveAll() as number;
}

export interface GetHandsOptions {
  tableId?: string;
  limit?: number;
  offset?: number;
  since?: number;
  stake?: string;
}

export function getHands(options: GetHandsOptions = {}): HandRecord[] {
  const database = getDatabase();
  const conditions: string[] = [];
  const params: any[] = [];

  if (options.tableId) {
    conditions.push('table_id = ?');
    params.push(options.tableId);
  }
  if (options.since) {
    conditions.push('timestamp >= ?');
    params.push(options.since);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  const sql = `SELECT * FROM hands ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const rows = database.prepare(sql).all(...params) as any[];
  return rows.map(rowToHandRecord);
}

export function getHandById(id: number): HandRecord | null {
  if (!stmtCache) throw new Error('Statements not prepared');
  const row = stmtCache.selectHandById.get(id) as any;
  if (!row) return null;
  return rowToHandRecord(row);
}

export function getRecentHands(count: number = 100): HandRecord[] {
  if (!stmtCache) throw new Error('Statements not prepared');
  const rows = stmtCache.selectRecentHands.all(count) as any[];
  return rows.map(rowToHandRecord);
}

export function getPinnedHands(): HandRecord[] {
  if (!stmtCache) throw new Error('Statements not prepared');
  const rows = stmtCache.selectPinnedHands.all() as any[];
  return rows.map(rowToHandRecord);
}

export function pinHand(handId: number): void {
  if (!stmtCache) throw new Error('Statements not prepared');
  stmtCache.pinHand.run(handId);
}

export function unpinHand(handId: number): void {
  if (!stmtCache) throw new Error('Statements not prepared');
  stmtCache.unpinHand.run(handId);
}

export function getLifetimePnL(): number {
  if (!stmtCache) throw new Error('Statements not prepared');
  const result = stmtCache.lifetimePnL.get() as any;
  return result?.pnl || 0;
}

export function getSessionPnL(sessionId: number): number {
  if (!stmtCache) throw new Error('Statements not prepared');
  const result = stmtCache.sessionPnL.get(sessionId) as any;
  return result?.pnl || 0;
}

export function getHandCount(): number {
  if (!stmtCache) throw new Error('Statements not prepared');
  const result = stmtCache.countHands.get() as any;
  return result?.count || 0;
}
