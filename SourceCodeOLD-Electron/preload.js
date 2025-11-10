const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Get media files
    getMediaFiles: () => ipcRenderer.invoke('get-media-files'),
    
    // Get configuration
    getConfig: () => ipcRenderer.invoke('get-config'),
    
    // Get addons directory
    getAddonsDir: () => ipcRenderer.invoke('get-addons-dir'),
    
    // Get addons
    getAddons: () => ipcRenderer.invoke('get-addons'),
    
    // Get addon frontend script
    getAddonFrontendScript: (addonId, addonConfig) => ipcRenderer.invoke('get-addon-frontend-script', addonId, addonConfig),
    
    // Get addon font data (generic for any addon)
    getAddonFontData: (addonId, fontName) => ipcRenderer.invoke('get-addon-font-data', addonId, fontName),
    
    // Listen for config updates
    onConfigUpdate: (callback) => {
        ipcRenderer.on('config-update', (event, config) => callback(config));
    },
    
    // Listen for media updates
    onMediaUpdate: (callback) => {
        ipcRenderer.on('media-update', () => callback());
    },
    
    // Listen for addon updates
    onAddonsUpdate: (callback) => {
        ipcRenderer.on('addons-update', () => callback());
    }
});