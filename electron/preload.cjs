const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  onNewChat: (cb) => ipcRenderer.on('menu:new-chat', cb),
  onOpenProject: (cb) => ipcRenderer.on('menu:open-project', (e, folderPath) => cb(folderPath))
});
