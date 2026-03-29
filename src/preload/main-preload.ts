import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';

contextBridge.exposeInMainWorld('cardCatcher', {
  // Table management
  getTables: () => ipcRenderer.invoke(IPC.TABLE_LIST),
  startTracking: (tableId: string) => ipcRenderer.invoke(IPC.START_TRACKING, tableId),
  stopTracking: (tableId: string) => ipcRenderer.invoke(IPC.STOP_TRACKING, tableId),

  // Stats
  getSessionStats: (tableId: string) => ipcRenderer.invoke(IPC.GET_SESSION_STATS, tableId),
  getPlayerStats: (playerName: string) => ipcRenderer.invoke(IPC.GET_PLAYER_STATS, playerName),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC.GET_SETTINGS),
  setSettings: (settings: any) => ipcRenderer.invoke(IPC.SET_SETTINGS, settings),
  getLayouts: () => ipcRenderer.invoke(IPC.GET_LAYOUTS),
  saveLayout: (layout: any) => ipcRenderer.invoke(IPC.SAVE_LAYOUT, layout),

  // Screenshot for calibration
  captureScreenshot: (tableId: string) => ipcRenderer.invoke(IPC.CAPTURE_SCREENSHOT, tableId),

  // Lobby & Pricing
  getLobbyBalance: () => ipcRenderer.invoke(IPC.GET_LOBBY_BALANCE),
  getEthPrice: () => ipcRenderer.invoke(IPC.GET_ETH_PRICE),

  // Database
  getHandHistory: (params: any) => ipcRenderer.invoke(IPC.GET_HAND_HISTORY, params),
  getHandById: (handId: number) => ipcRenderer.invoke(IPC.GET_HAND_BY_ID, handId),
  pinHand: (handId: number) => ipcRenderer.invoke(IPC.PIN_HAND, handId),
  unpinHand: (handId: number) => ipcRenderer.invoke(IPC.UNPIN_HAND, handId),
  getPinnedHands: () => ipcRenderer.invoke(IPC.GET_PINNED_HANDS),
  getLifetimePnL: () => ipcRenderer.invoke(IPC.GET_LIFETIME_PNL),
  getHandCount: () => ipcRenderer.invoke(IPC.GET_HAND_COUNT),
  searchPlayers: (query: string) => ipcRenderer.invoke(IPC.SEARCH_PLAYERS, query),

  // Scan for tables (triggers window poll)
  scanWindows: () => ipcRenderer.invoke(IPC.DEBUG_LIST_WINDOWS),

  // Debug / Diagnostics
  debugListWindows: () => ipcRenderer.invoke(IPC.DEBUG_LIST_WINDOWS),
  debugCaptureTable: (tableId: string) => ipcRenderer.invoke(IPC.DEBUG_CAPTURE_TABLE, tableId),
  debugOCRTest: (tableId: string) => ipcRenderer.invoke(IPC.DEBUG_OCR_TEST, tableId),
  debugROIOverlay: (tableId: string) => ipcRenderer.invoke(IPC.DEBUG_ROI_OVERLAY, tableId),
  debugDumpROIs: (tableId: string) => ipcRenderer.invoke('debug:dump-rois', tableId),
  debugSaveROIs: (rois: any[]) => ipcRenderer.invoke('debug:save-rois', rois),
  onDebugLog: (callback: (line: string) => void) =>
    ipcRenderer.on(IPC.DEBUG_LOG, (_e, line) => callback(line)),

  // Event listeners
  onTableFound: (callback: (table: any) => void) =>
    ipcRenderer.on(IPC.TABLE_FOUND, (_e, table) => callback(table)),
  onTableLost: (callback: (tableId: string) => void) =>
    ipcRenderer.on(IPC.TABLE_LOST, (_e, tableId) => callback(tableId)),
  onStatsUpdated: (callback: (data: any) => void) =>
    ipcRenderer.on(IPC.STATS_UPDATED, (_e, data) => callback(data)),

  // Cleanup
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners(IPC.TABLE_FOUND);
    ipcRenderer.removeAllListeners(IPC.TABLE_LOST);
    ipcRenderer.removeAllListeners(IPC.STATS_UPDATED);
    ipcRenderer.removeAllListeners(IPC.DEBUG_LOG);
  },
});
