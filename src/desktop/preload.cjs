const { contextBridge, ipcRenderer } = require("electron");

if (process.isMainFrame && process.platform === "darwin") {
  contextBridge.exposeInMainWorld("desktopUpdater", {
    getState: () => ipcRenderer.invoke("desktop-update:state"),
    ready: () => ipcRenderer.invoke("desktop-update:ready"),
    check: () => ipcRenderer.invoke("desktop-update:check"),
    download: () => ipcRenderer.invoke("desktop-update:download"),
    cancel: () => ipcRenderer.invoke("desktop-update:cancel"),
    install: () => ipcRenderer.invoke("desktop-update:install"),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on("desktop-update:state", listener);
      return () => ipcRenderer.removeListener("desktop-update:state", listener);
    },
  });
}
