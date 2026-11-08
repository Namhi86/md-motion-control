const { contextBridge, ipcRenderer } = require('electron');

// The whole surface of the fallback page (electron/offline.html): try the web again, count the tasks, pause the queue. The main
// process answers these offline:* channels for this page only (src/ipc-guard.js).
contextBridge.exposeInMainWorld('offline', {
  retry: () => ipcRenderer.invoke('offline:retry'),
  stats: () => ipcRenderer.invoke('offline:stats'),
  pauseQueue: () => ipcRenderer.invoke('offline:pauseQueue'),
});
