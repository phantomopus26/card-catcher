// Main → Renderer IPC channels
export const IPC = {
  // HUD overlay channels
  HUD_STATS_UPDATE: 'hud:stats-update',
  HUD_LAYOUT_UPDATE: 'hud:layout-update',
  HUD_VISIBILITY: 'hud:visibility',

  // Overlay → Main
  OVERLAY_READY: 'overlay:ready',

  // Table management
  TABLE_FOUND: 'table:found',
  TABLE_LOST: 'table:lost',
  TABLE_MOVED: 'table:moved',
  TABLE_LIST: 'table:list',

  // Settings
  GET_SETTINGS: 'settings:get',
  SET_SETTINGS: 'settings:set',
  GET_LAYOUTS: 'settings:get-layouts',
  SAVE_LAYOUT: 'settings:save-layout',

  // Capture control
  START_TRACKING: 'capture:start',
  STOP_TRACKING: 'capture:stop',
  CAPTURE_SCREENSHOT: 'capture:screenshot',

  // Stats
  GET_PLAYER_STATS: 'stats:get-player',
  GET_SESSION_STATS: 'stats:get-session',
  STATS_UPDATED: 'stats:updated',

  // Database
  GET_HAND_HISTORY: 'db:get-hands',
  GET_HAND_BY_ID: 'db:get-hand-by-id',
  PIN_HAND: 'db:pin-hand',
  UNPIN_HAND: 'db:unpin-hand',
  GET_PINNED_HANDS: 'db:get-pinned-hands',
  GET_LIFETIME_PNL: 'db:get-lifetime-pnl',
  GET_HAND_COUNT: 'db:get-hand-count',
  SEARCH_PLAYERS: 'db:search-players',

  // Lobby & Pricing
  GET_LOBBY_BALANCE: 'lobby:get-balance',
  GET_ETH_PRICE: 'price:get-eth',

  // Debug / Diagnostics
  DEBUG_LIST_WINDOWS: 'debug:list-windows',
  DEBUG_CAPTURE_TABLE: 'debug:capture-table',
  DEBUG_OCR_TEST: 'debug:ocr-test',
  DEBUG_LOG: 'debug:log',
  DEBUG_ROI_OVERLAY: 'debug:roi-overlay',
} as const;
