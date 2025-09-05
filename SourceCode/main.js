const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcrypt');
const dgram = require('dgram');
const WebSocket = require('ws');
const os = require('os');
const { exec } = require('child_process');
const axios = require('axios');
const UpdateManager = require('./updateapp');

// Configuration
let config = {
  displayName: os.hostname(),
  imageDuration: 5000, // milliseconds
  videoPosition: 'after', // 'between' or 'after'
  imageScaling: 'contain', // 'contain', 'fill', 'cover'
  manualResolution: false,
  manualWidth: null,
  manualHeight: null,
  password: '',
  staticIp: '',
  localhostOnly: false, // New option
  port: 3000,
  wsPort: 3001,
  discoveryPort: 3002,
  peers: [],
  rotation: 0, // 0, 90, -90, 180, 270
  addons: {} // Addon configurations
};

// Global variables
let mainWindow;
let webServer;
let wsServer;
let discoverySocket;
let addons = new Map(); // Store loaded addons
let updateManager;

// Get the directory where the app is running
const appDir = app.isPackaged 
  ? path.dirname(process.execPath)  // Production: directory of the executable
  : __dirname;                       // Development: current directory
const mediaDir = path.join(appDir, 'Media');
const configPath = path.join(appDir, 'config.json');
const addonsDir = path.join(appDir, 'Addons');

// Initialize update manager
updateManager = new UpdateManager(appDir);

// Load configuration
async function loadConfig() {
  try {
    const data = await fs.readFile(configPath, 'utf8');
    const loadedConfig = JSON.parse(data);
    
    // Deep merge to preserve default structure
    config = {
      ...config,
      ...loadedConfig,
      addons: {
        ...config.addons,
        ...(loadedConfig.addons || {})
      }
    };
  } catch (err) {
    await saveConfig();
  }
}

// Save configuration
async function saveConfig() {
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

// Ensure media directory exists
async function ensureMediaDir() {
  try {
    await fs.access(mediaDir);
  } catch {
    await fs.mkdir(mediaDir, { recursive: true });
  }
}

// Ensure addons directory exists
async function ensureAddonsDir() {
  try {
    await fs.access(addonsDir);
  } catch {
    await fs.mkdir(addonsDir, { recursive: true });
    console.log('Created Addons directory:', addonsDir);
  }
}

// Load and initialize addons
async function loadAddons() {
  try {
    const files = await fs.readdir(addonsDir);
    const addonFiles = files.filter(file => file.endsWith('.js'));
    
    console.log(`Found ${addonFiles.length} addon files`);
    
    for (const file of addonFiles) {
      try {
        const addonPath = path.join(addonsDir, file);
        const addonId = path.basename(file, '.js');
        
        // Clear require cache to allow reloading
        delete require.cache[require.resolve(addonPath)];
        
        const addonModule = require(addonPath);
        
        // Validate addon structure
        if (!addonModule.info || !addonModule.info.name || !addonModule.info.version) {
          console.error(`Invalid addon structure in ${file}: missing info.name or info.version`);
          continue;
        }
        
        // Load addon config
        const addonConfig = config.addons?.[addonId] || {};
        
        // Initialize addon
        const addon = {
          id: addonId,
          file: file,
          info: addonModule.info,
          config: addonConfig,
          enabled: addonConfig.enabled !== false, // Default to enabled
          module: addonModule,
          instance: null
        };
        
        // Create addon instance if it has a class
        if (addonModule.Addon && typeof addonModule.Addon === 'function') {
          addon.instance = new addonModule.Addon(addon.config);
        }
        
        addons.set(addonId, addon);
        console.log(`Loaded addon: ${addon.info.name} v${addon.info.version}`);
        
        // Initialize addon if enabled
        if (addon.enabled && addon.instance && addon.instance.init) {
          try {
            await addon.instance.init();
            console.log(`Initialized addon: ${addon.info.name}`);
          } catch (err) {
            console.error(`Failed to initialize addon ${addon.info.name}:`, err);
          }
        }
        
      } catch (err) {
        console.error(`Failed to load addon ${file}:`, err);
      }
    }
    
  } catch (err) {
    console.error('Failed to load addons:', err);
  }
}

// Get addon configuration for API
function getAddonConfigs() {
  const addonConfigs = {};
  for (const [id, addon] of addons) {
    addonConfigs[id] = {
      id: addon.id,
      info: addon.info,
      enabled: addon.enabled,
      config: addon.config,
      settings: addon.module.settings || []
    };
  }
  return addonConfigs;
}

// Update addon configuration
async function updateAddonConfig(addonId, newConfig) {
  const addon = addons.get(addonId);
  if (!addon) {
    throw new Error(`Addon ${addonId} not found`);
  }
  
  // Update global config
  if (!config.addons) config.addons = {};
  config.addons[addonId] = { ...addon.config, ...newConfig };
  
  // Update addon config
  addon.config = config.addons[addonId];
  addon.enabled = addon.config.enabled !== false;
  
  // Reinitialize addon if it has an instance
  if (addon.instance) {
    // Stop if running
    if (addon.instance.stop) {
      try {
        await addon.instance.stop();
      } catch (err) {
        console.error(`Error stopping addon ${addon.info.name}:`, err);
      }
    }
    
    // Update config
    if (addon.instance.updateConfig) {
      addon.instance.updateConfig(addon.config);
    }
    
    // Restart if enabled
    if (addon.enabled && addon.instance.init) {
      try {
        await addon.instance.init();
        console.log(`Reinitialized addon: ${addon.info.name}`);
      } catch (err) {
        console.error(`Failed to reinitialize addon ${addon.info.name}:`, err);
      }
    }
  }
  
  await saveConfig();
  broadcastAddonUpdate();
}

// Broadcast addon updates
function broadcastAddonUpdate() {
  if (wsServer) {
    wsServer.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'addons-update'
        }));
      }
    });
  }
  
  if (mainWindow) {
    mainWindow.webContents.send('addons-update');
  }
}

// Get media files
async function getMediaFiles() {
  const files = await fs.readdir(mediaDir);
  const mediaFiles = files.filter(file => 
    /\.(svg|png|jpg|jpeg|mp4)$/i.test(file)
  ).sort();
  
  const fileData = await Promise.all(
    mediaFiles.map(async (file) => {
      const filePath = path.join(mediaDir, file);
      const stats = await fs.stat(filePath);
      const ext = path.extname(file).toLowerCase();
      return {
        name: file,
        path: filePath,
        type: ['.mp4'].includes(ext) ? 'video' : 'image',
        size: stats.size,
        modified: stats.mtime
      };
    })
  );
  
  return fileData;
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  
  // Hide menu bar completely
  Menu.setApplicationMenu(null);
  
  // DevTools shortcut (Ctrl+Shift+I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.openDevTools();
    }
  });
}

// Check if peer is online
async function checkPeerStatus(peer) {
  try {
    // Get the actual IP to use for connection
    let connectIp = peer.ip;
    
    // If peer is localhost but we're bound to an IP, use our IP
    if ((peer.ip === 'localhost' || peer.ip === '127.0.0.1') && config.staticIp) {
      connectIp = config.staticIp;
    }
    
    const url = `http://${connectIp}:${peer.port}/api/config`;
    console.log(`Checking peer status: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 2000,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    peer.online = true;
    peer.lastChecked = Date.now();
    if (response.data.displayName) {
      peer.name = response.data.displayName;
    }
    return true;
  } catch (err) {
    console.error(`Failed to reach peer ${peer.ip}:${peer.port}:`, err.message);
    peer.online = false;
    peer.lastChecked = Date.now();
    return false;
  }
}

// Periodically check peer status
async function checkAllPeers() {
  for (const peer of config.peers) {
    await checkPeerStatus(peer);
  }
}

// Setup web server
function setupWebServer() {
  const webApp = express();
  webApp.use(express.json());
  
  // Add CORS middleware to allow cross-origin requests
  webApp.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    
    next();
  });
  
  webApp.use(express.static(path.join(__dirname, 'web')));
  
  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: mediaDir,
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  });
  const upload = multer({ 
    storage,
    limits: {
      fileSize: 100 * 1024 * 1024 // 100MB limit
    }
  });
  
  // Separate multer config for updates
  const uploadUpdate = multer({ 
    dest: path.join(app.getPath('userData'), 'updates'),
    limits: {
      fileSize: 100 * 1024 * 1024 // 100MB limit
    }
  });

  // Authentication middleware
  const auth = async (req, res, next) => {
    const password = req.body.password;
    
    if (!config.password || password === config.password) {
      next();
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  };

  // API Routes
  webApp.get('/api/config', (req, res) => {
    res.json({
      displayName: config.displayName,
      imageDuration: config.imageDuration,
      videoPosition: config.videoPosition,
      imageScaling: config.imageScaling,
      manualResolution: config.manualResolution,
      manualWidth: config.manualWidth,
      manualHeight: config.manualHeight,
      hasPassword: !!config.password,
      staticIp: config.staticIp,
      localhostOnly: config.localhostOnly,
      port: config.port,
      wsPort: config.wsPort,
      discoveryPort: config.discoveryPort,
      peers: config.peers,
      rotation: config.rotation,
      version: app.getVersion()
    });
  });

  webApp.post('/api/config', auth, async (req, res) => {
    const updates = req.body;
    delete updates.password; // Don't update password this way
    
    Object.assign(config, updates);
    await saveConfig();
    broadcastConfig();
    res.json({ success: true });
  });

  webApp.post('/api/password', auth, async (req, res) => {
    const { newPassword } = req.body;
    config.password = newPassword;
    await saveConfig();
    res.json({ success: true });
  });

  webApp.get('/api/media', async (req, res) => {
    const files = await getMediaFiles();
    res.json(files);
  });

  webApp.post('/api/media/upload', upload.array('files'), async (req, res) => {
    // Check auth after multer processes the upload
    const password = req.body.password;
    if (config.password && password !== config.password) {
      // Delete uploaded files if auth fails
      if (req.files) {
        for (const file of req.files) {
          await fs.unlink(file.path).catch(() => {});
        }
      }
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    const { target } = req.body; // 'local' or 'all'
    
    if (target === 'all') {
      // Distribute files to all peers
      console.log(`Distributing files to ${config.peers.length} peers...`);
      for (const peer of config.peers) {
        if (!peer.online) {
          console.log(`Skipping offline peer: ${peer.name}`);
          continue;
        }
        
        for (const file of req.files) {
          try {
            console.log(`Sending ${file.filename} to ${peer.name} at ${peer.ip}:${peer.port}`);
            const fileData = await fs.readFile(file.path);
            
            const peerUrl = `http://${peer.ip}:${peer.port}/api/media/receive`;
            
            await axios.post(peerUrl, {
              filename: file.filename,
              data: fileData.toString('base64'),
              password: config.password
            }, {
              timeout: 30000,
              maxContentLength: Infinity,
              maxBodyLength: Infinity
            });
            
            console.log(`Successfully sent ${file.filename} to ${peer.name}`);
          } catch (err) {
            console.error(`Failed to send file to ${peer.name}:`, err.message);
          }
        }
      }
    }
    
    broadcastUpdate('media');
    res.json({ success: true, files: req.files.length });
  });

  webApp.post('/api/media/receive', auth, async (req, res) => {
    const { filename, data } = req.body;
    const filePath = path.join(mediaDir, filename);
    await fs.writeFile(filePath, Buffer.from(data, 'base64'));
    broadcastUpdate('media');
    res.json({ success: true });
  });

  webApp.delete('/api/media/:filename', auth, async (req, res) => {
    const filePath = path.join(mediaDir, req.params.filename);
    await fs.unlink(filePath);
    broadcastUpdate('media');
    res.json({ success: true });
  });

  // Addon API Routes
  webApp.get('/api/addons', (req, res) => {
    res.json(getAddonConfigs());
  });

  webApp.post('/api/addons/:id/config', auth, async (req, res) => {
    try {
      const addonId = req.params.id;
      const newConfig = req.body;
      delete newConfig.password;
      
      await updateAddonConfig(addonId, newConfig);
      
      res.json({ success: true });
    } catch (err) {
      console.error('Failed to update addon config:', err);
      res.status(500).json({ error: err.message });
    }
  });

  webApp.post('/api/addons/reload', auth, async (req, res) => {
    try {
      // Stop all running addons with proper error handling
      for (const [id, addon] of addons) {
        if (addon.enabled && addon.instance && addon.instance.stop) {
          try {
            await addon.instance.stop();
          } catch (err) {
            // Handle EIO errors during shutdown gracefully
            if (err.code === 'EIO') {
              console.log(`Addon ${addon.info.name} stopped (EIO ignored)`);
            } else {
              console.error(`Error stopping addon ${addon.info.name}:`, err);
            }
          }
        }
      }
      
      // Clear addons
      addons.clear();
      
      // Reload addons
      await loadAddons();
      
      broadcastAddonUpdate();
      
      res.json({ success: true, message: 'Addons reloaded successfully' });
    } catch (err) {
      console.error('Failed to reload addons:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Update API Routes - Now using UpdateManager
  webApp.get('/api/update/test', (req, res) => {
    res.json({ 
      success: true, 
      message: 'Update endpoint is accessible',
      isPackaged: app.isPackaged,
      platform: process.platform,
      appPath: appDir
    });
  });
  
  webApp.post('/api/update', uploadUpdate.single('update'), async (req, res) => {
    try {
      console.log('Update handler reached');
      
      // Check auth
      const password = req.body.password;
      if (config.password && password !== config.password) {
        if (req.file) {
          await fs.unlink(req.file.path).catch(() => {});
        }
        return res.status(401).json({ error: 'Invalid password' });
      }
      
      const { target, restartPC } = req.body;
      
      if (!req.file) {
        return res.status(400).json({ error: 'No update file provided' });
      }
      
      console.log('Update received:', req.file.originalname, 'Size:', req.file.size);
      
      // Ensure updates directory exists
      const updateDir = path.join(app.getPath('userData'), 'updates');
      await fs.mkdir(updateDir, { recursive: true });
      
      // Move to final location
      const updatePath = path.join(updateDir, 'pending-update.asar');
      await fs.copyFile(req.file.path, updatePath);
      await fs.unlink(req.file.path).catch(() => {});
      
      console.log('Update saved to:', updatePath);
      
      // Store update info
      const updateInfo = {
        version: new Date().toISOString(),
        path: updatePath,
        originalName: req.file.originalname,
        size: req.file.size,
        applied: false
      };
      await fs.writeFile(
        path.join(updateDir, 'update-info.json'), 
        JSON.stringify(updateInfo, null, 2)
      );
      
      if (target === 'all') {
        // Distribute update to all peers
        console.log(`Distributing update to ${config.peers.length} peers...`);
        for (const peer of config.peers) {
          if (!peer.online) {
            console.log(`Skipping offline peer: ${peer.name}`);
            continue;
          }
          
          try {
            console.log(`Sending update to ${peer.name} at ${peer.ip}:${peer.port}`);
            const updateData = await fs.readFile(updatePath);
            
            const peerUrl = `http://${peer.ip}:${peer.port}/api/update/receive`;
            
            await axios.post(peerUrl, {
              data: updateData.toString('base64'),
              password: config.password,
              restartPC: restartPC
            }, {
              timeout: 60000,
              maxContentLength: Infinity,
              maxBodyLength: Infinity
            });
            
            console.log(`Update sent to ${peer.name}`);
          } catch (err) {
            console.error(`Failed to send update to ${peer.name}:`, err.message);
          }
        }
      }
      
      // Process update using UpdateManager
      const result = await updateManager.processUpdate(updatePath, restartPC, target);
      res.json(result);
      
    } catch (err) {
      console.error('Update error:', err);
      res.status(500).json({ error: 'Update failed: ' + err.message });
    }
  });

  webApp.post('/api/update/receive', auth, async (req, res) => {
    const { data } = req.body;
    
    // Store in user data directory
    const updateDir = path.join(app.getPath('userData'), 'updates');
    await fs.mkdir(updateDir, { recursive: true });
    
    const updatePath = path.join(updateDir, 'pending-update.asar');
    await fs.writeFile(updatePath, Buffer.from(data, 'base64'));
    
    // Store update info
    const updateInfo = {
      version: new Date().toISOString(),
      path: updatePath,
      applied: false
    };
    await fs.writeFile(
      path.join(updateDir, 'update-info.json'), 
      JSON.stringify(updateInfo, null, 2)
    );
    
    // Use UpdateManager to handle received update
    await updateManager.createReceivedUpdateScript(updatePath);
    
    res.json({ success: true });
    
    setTimeout(() => {
      app.exit(0);
    }, 1000);
  });

  // Peer management routes
  webApp.get('/api/peers', (req, res) => {
    res.json(config.peers);
  });

  webApp.post('/api/peers/add', auth, async (req, res) => {
    const { ip, name, port } = req.body;
    const peerPort = port || config.port;
    const peer = { 
      ip, 
      name, 
      port: peerPort, 
      manual: true,
      id: `${ip}:${peerPort}`,
      lastChecked: 0,
      online: false
    };
    
    // Check if peer already exists
    const existingIndex = config.peers.findIndex(p => p.id === peer.id);
    if (existingIndex >= 0) {
      config.peers[existingIndex] = peer;
    } else {
      config.peers.push(peer);
    }
    
    await saveConfig();
    checkPeerStatus(peer);
    res.json({ success: true });
  });
  
  webApp.delete('/api/peers/:id', auth, async (req, res) => {
    const peerId = decodeURIComponent(req.params.id);
    config.peers = config.peers.filter(p => p.id !== peerId);
    await saveConfig();
    res.json({ success: true });
  });
  
  webApp.get('/api/peers/check/:id', async (req, res) => {
    const peerId = decodeURIComponent(req.params.id);
    const peer = config.peers.find(p => p.id === peerId);
    if (peer) {
      const online = await checkPeerStatus(peer);
      res.json({ online });
    } else {
      res.json({ online: false });
    }
  });

  webServer = webApp.listen(config.port, config.staticIp || (config.localhostOnly ? '127.0.0.1' : '0.0.0.0'), () => {
    const listenAddress = config.staticIp || (config.localhostOnly ? 'localhost' : 'all interfaces');
    console.log(`Web interface available at http://${config.staticIp || 'localhost'}:${config.port}`);
    console.log(`Listening on: ${listenAddress}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRNOTAVAIL') {
      console.error(`Error: Cannot bind to IP ${config.staticIp}. This IP is not available on this machine.`);
      console.log('Falling back to localhost...');
      // Fallback to localhost
      config.staticIp = '';
      saveConfig();
      webServer = webApp.listen(config.port, '127.0.0.1', () => {
        console.log(`Web interface available at http://localhost:${config.port}`);
      });
    } else {
      console.error('Server error:', err);
    }
  });
}

// Setup WebSocket server for real-time updates
function setupWebSocketServer() {
  wsServer = new WebSocket.Server({ port: config.wsPort });
  
  wsServer.on('connection', (ws) => {
    ws.on('message', async (message) => {
      const data = JSON.parse(message);
      
      if (data.type === 'getConfig') {
        ws.send(JSON.stringify({
          type: 'config',
          data: {
            imageDuration: config.imageDuration,
            videoPosition: config.videoPosition,
            imageScaling: config.imageScaling,
            manualResolution: config.manualResolution,
            manualWidth: config.manualWidth,
            manualHeight: config.manualHeight,
            rotation: config.rotation
          }
        }));
      }
    });
  });
}

// Broadcast configuration updates
function broadcastConfig() {
  if (wsServer) {
    wsServer.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'config',
          data: {
            imageDuration: config.imageDuration,
            videoPosition: config.videoPosition,
            imageScaling: config.imageScaling,
            manualResolution: config.manualResolution,
            manualWidth: config.manualWidth,
            manualHeight: config.manualHeight,
            rotation: config.rotation
          }
        }));
      }
    });
  }
  
  if (mainWindow) {
    mainWindow.webContents.send('config-update', {
      imageDuration: config.imageDuration,
      videoPosition: config.videoPosition,
      imageScaling: config.imageScaling,
      manualResolution: config.manualResolution,
      manualWidth: config.manualWidth,
      manualHeight: config.manualHeight,
      rotation: config.rotation
    });
  }
}

// Broadcast media updates
function broadcastUpdate(type) {
  if (mainWindow) {
    mainWindow.webContents.send('media-update');
  }
}

// Setup discovery service
function setupDiscovery() {
  try {
    discoverySocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    
    discoverySocket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        
        // Skip our own announcements
        if (data.type === 'announce' && data.id !== config.displayName) {
          // Determine the peer's actual IP
          let peerIp = rinfo.address;
          
          // If message is from loopback, check if we should use a different IP
          if (rinfo.address === '127.0.0.1') {
            // If we have a static IP and the peer is on a different port, use our static IP
            if (config.staticIp && data.port !== config.port) {
              peerIp = config.staticIp;
            } else {
              peerIp = 'localhost';
            }
          }
          
          // Create unique peer ID
          const peerId = `${peerIp}:${data.port}`;
          const existingPeer = config.peers.find(p => p.id === peerId);
          
          if (existingPeer) {
            existingPeer.name = data.name;
            existingPeer.lastSeen = Date.now();
            existingPeer.online = true;
            existingPeer.port = data.port;
          } else {
            const newPeer = {
              name: data.name,
              ip: peerIp,
              port: data.port,
              lastSeen: Date.now(),
              manual: false,
              online: true,
              id: peerId
            };
            config.peers.push(newPeer);
            console.log(`Discovered new peer: ${newPeer.name} at ${newPeer.ip}:${newPeer.port}`);
          }
        }
      } catch (err) {
        console.error('Discovery message error:', err);
      }
    });
    
    discoverySocket.on('error', (err) => {
      console.error('Discovery socket error:', err);
      if (err.code === 'EADDRINUSE') {
        console.log(`Discovery port ${config.discoveryPort} is in use`);
      }
    });
    
    discoverySocket.bind(config.discoveryPort, () => {
      discoverySocket.setBroadcast(true);
      console.log(`Discovery service listening on port ${config.discoveryPort}`);
    });
    
    // Announce presence periodically
    setInterval(() => {
      const announcement = JSON.stringify({
        type: 'announce',
        id: config.displayName,
        name: config.displayName,
        port: config.port
      });
      
      try {
        // Broadcast to network
        discoverySocket.send(
          announcement,
          0,
          announcement.length,
          config.discoveryPort,
          '255.255.255.255'
        );
        
        // Also send to localhost for multiple instances on same machine
        discoverySocket.send(
          announcement,
          0,
          announcement.length,
          config.discoveryPort,
          '127.0.0.1'
        );
        
        // If we have a static IP, also announce to that subnet
        if (config.staticIp) {
          const subnet = config.staticIp.split('.').slice(0, 3).join('.') + '.255';
          discoverySocket.send(
            announcement,
            0,
            announcement.length,
            config.discoveryPort,
            subnet
          );
        }
      } catch (err) {
        console.error('Failed to send discovery announcement:', err);
      }
    }, 5000);
    
    // Clean up old peers
    setInterval(() => {
      const now = Date.now();
      config.peers = config.peers.filter(peer => 
        peer.manual || (now - peer.lastSeen < 30000)
      );
    }, 10000);
    
  } catch (err) {
    console.error('Failed to setup discovery service:', err);
  }
}

// IPC handlers
ipcMain.handle('get-media-files', async () => {
  return await getMediaFiles();
});

ipcMain.handle('get-config', () => {
  return {
    imageDuration: config.imageDuration,
    videoPosition: config.videoPosition,
    imageScaling: config.imageScaling,
    manualResolution: config.manualResolution,
    manualWidth: config.manualWidth,
    manualHeight: config.manualHeight,
    rotation: config.rotation
  };
});

ipcMain.handle('get-addons-dir', () => {
  return addonsDir;
});

ipcMain.handle('get-addons', () => {
  return getAddonConfigs();
});

ipcMain.handle('get-addon-frontend-script', async (event, addonId, addonConfig) => {
  const addon = addons.get(addonId);
  if (!addon) {
    console.warn(`Addon ${addonId} not found`);
    return null;
  }
  
  if (addon.instance && typeof addon.instance.getFrontendScript === 'function') {
    try {
      return addon.instance.getFrontendScript();
    } catch (err) {
      console.error(`Failed to get frontend script for addon ${addonId}:`, err);
      return null;
    }
  }
  
  console.warn(`Addon ${addonId} does not provide a frontend script`);
  return null;
});

ipcMain.handle('get-addon-font-data', async (event, addonId, fontName) => {
  try {
    console.log(`=== IPC Handler: Font data requested ===`);
    console.log(`Addon ID: ${addonId}`);
    console.log(`Font Name: ${fontName}`);
    
    const addon = addons.get(addonId);
    if (!addon) {
      console.warn(`Addon ${addonId} not found in addons map`);
      console.log('Available addons:', Array.from(addons.keys()));
      return null;
    }
    
    console.log(`Addon found: ${addon.info.name}`);
    console.log(`Addon enabled: ${addon.enabled}`);
    console.log(`Addon instance exists: ${!!addon.instance}`);
    
    // Check if addon has a getFontAsDataUrl method
    if (addon.instance && typeof addon.instance.getFontAsDataUrl === 'function') {
      console.log('getFontAsDataUrl method exists, calling it...');
      
      const fontDataUrl = await addon.instance.getFontAsDataUrl(fontName);
      
      if (fontDataUrl) {
        console.log(`Font data URL generated successfully for ${fontName}`);
        console.log(`Data URL starts with: ${fontDataUrl.substring(0, 50)}...`);
      } else {
        console.error(`getFontAsDataUrl returned null/undefined for font: ${fontName}`);
      }
      
      return fontDataUrl;
    } else {
      console.warn(`Addon ${addonId} does not provide font data functionality`);
      console.log(`Instance methods:`, addon.instance ? Object.getOwnPropertyNames(Object.getPrototypeOf(addon.instance)) : 'No instance');
      return null;
    }
  } catch (err) {
    console.error(`=== IPC Handler Error ===`);
    console.error(`Failed to get font data for addon ${addonId}:`, err);
    console.error('Error stack:', err.stack);
    return null;
  }
});

// App event handlers
app.whenReady().then(async () => {
  await loadConfig();
  await ensureMediaDir();
  await ensureAddonsDir();
  
  // Clean up any scheduled tasks from previous updates (Windows only)
  await updateManager.cleanupScheduledTasks();
  
  await loadAddons();
  createWindow();
  setupWebServer();
  setupWebSocketServer();
  setupDiscovery();
  
  // Start checking peers periodically
  setInterval(checkAllPeers, 10000); // Check every 10 seconds
  
  console.log(`Web interface available at http://${config.staticIp || 'localhost'}:${config.port}`);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // Stop all addons before quitting with proper error handling
  for (const [id, addon] of addons) {
    if (addon.enabled && addon.instance && addon.instance.stop) {
      try {
        await addon.instance.stop();
      } catch (err) {
        // Handle EIO errors during shutdown gracefully
        if (err.code === 'EIO') {
          console.log(`Addon ${addon.info.name} stopped (EIO ignored during shutdown)`);
        } else {
          console.error(`Error stopping addon ${addon.info.name}:`, err);
        }
      }
    }
  }
  
  if (discoverySocket) {
    discoverySocket.close();
  }
  if (webServer) {
    webServer.close();
  }
  if (wsServer) {
    wsServer.close();
  }
});