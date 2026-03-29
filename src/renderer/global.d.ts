import type { TableInfo, PlayerStats, HudUpdate } from '../shared/types';

declare global {
  interface Window {
    cardCatcher: {
      getTables: () => Promise<TableInfo[]>;
      startTracking: (tableId: string) => Promise<void>;
      stopTracking: (tableId: string) => Promise<void>;
      getSessionStats: (tableId: string) => Promise<PlayerStats[]>;
      getPlayerStats: (playerName: string) => Promise<PlayerStats>;
      getSettings: () => Promise<any>;
      setSettings: (settings: any) => Promise<void>;
      getLayouts: () => Promise<any[]>;
      saveLayout: (layout: any) => Promise<void>;
      captureScreenshot: (tableId: string) => Promise<string>;
      getHandHistory: (params: any) => Promise<any[]>;
      searchPlayers: (query: string) => Promise<any[]>;
      getLifetimePnL: () => Promise<number>;
      getHandCount: () => Promise<number>;
      getLobbyBalance: () => Promise<number | null>;
      getEthPrice: () => Promise<number | null>;
      getHandById: (handId: number) => Promise<any>;
      pinHand: (handId: number) => Promise<void>;
      unpinHand: (handId: number) => Promise<void>;
      getPinnedHands: () => Promise<any[]>;
      scanWindows: () => Promise<any>;
      debugListWindows: () => Promise<{ hwnd: number; title: string }[]>;
      debugCaptureTable: (tableId: string) => Promise<{ image?: string; width?: number; height?: number; error?: string }>;
      debugOCRTest: (tableId: string) => Promise<{ snapshot?: any; layout?: string; error?: string }>;
      debugROIOverlay: (tableId: string) => Promise<{ image?: string; width?: number; height?: number; path?: string; error?: string }>;
      onTableFound: (callback: (table: TableInfo) => void) => void;
      onTableLost: (callback: (tableId: string) => void) => void;
      onStatsUpdated: (callback: (data: HudUpdate) => void) => void;
      onDebugLog: (callback: (line: string) => void) => void;
      removeAllListeners: () => void;
    };
  }
}
