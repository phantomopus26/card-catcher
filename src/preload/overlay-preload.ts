import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';

contextBridge.exposeInMainWorld('hudAPI', {
  // Receive HUD data from main process
  onStatsUpdate: (callback: (data: any) => void) =>
    ipcRenderer.on(IPC.HUD_STATS_UPDATE, (_e, data) => callback(data)),

  onLayoutUpdate: (callback: (data: any) => void) =>
    ipcRenderer.on(IPC.HUD_LAYOUT_UPDATE, (_e, data) => callback(data)),

  onVisibility: (callback: (visible: boolean) => void) =>
    ipcRenderer.on(IPC.HUD_VISIBILITY, (_e, visible) => callback(visible)),

  onInit: (callback: (data: { tableId: string }) => void) =>
    ipcRenderer.on('init', (_e, data) => callback(data)),

  // Tell main process the overlay is ready
  ready: () => ipcRenderer.send(IPC.OVERLAY_READY),

  removeAllListeners: () => {
    ipcRenderer.removeAllListeners(IPC.HUD_STATS_UPDATE);
    ipcRenderer.removeAllListeners(IPC.HUD_LAYOUT_UPDATE);
    ipcRenderer.removeAllListeners(IPC.HUD_VISIBILITY);
    ipcRenderer.removeAllListeners('init');
  },
});
