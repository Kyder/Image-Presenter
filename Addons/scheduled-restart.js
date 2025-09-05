// Addons/scheduled-restart.js
// Scheduled PC Restart Addon for Digital Signage
// This addon provides scheduled PC restarts with visual countdown and announcements

// Addon information (required)
const info = {
  name: "Scheduled PC Restart",
  version: "1.0.6",
  description: "Automatically restart the PC at scheduled intervals with visual countdown and announcements",
  author: "Digital Signage Team",
  category: "System"
};

// Addon settings definition (optional)
const settings = [
  {
    id: "enabled",
    type: "boolean",
    name: "Enable Scheduled Restart",
    description: "Enable automatic PC restart functionality",
    default: false
  },
  {
    id: "restartInterval",
    type: "range",
    name: "Restart Interval",
    description: "Time between restarts",
    min: 1,
    max: 72,
    default: 24,
    unit: "hours"
  },
  {
    id: "testMode",
    type: "boolean",
    name: "Test Mode (Minutes)",
    description: "Use minutes instead of hours for testing",
    default: false
  },
  {
    id: "testInterval",
    type: "range",
    name: "Test Interval",
    description: "Time between restarts in test mode",
    min: 1,
    max: 60,
    default: 5,
    unit: "minutes"
  },
  {
    id: "warningTime",
    type: "range",
    name: "Warning Time",
    description: "Show warning this many minutes before restart",
    min: 1,
    max: 30,
    default: 5,
    unit: "minutes"
  },
  {
    id: "font",
    type: "select",
    name: "Font",
    description: "Font to use for restart warning messages",
    options: [
      { value: "default", label: "Default (Arial)" }
    ],
    default: "default"
  },
  {
    id: "fontSize",
    type: "range",
    name: "Message Font Size",
    description: "Size of the restart warning messages",
    min: 24,
    max: 72,
    default: 48,
    unit: "px"
  },
  {
    id: "textColor",
    type: "color",
    name: "Text Color",
    description: "Color of the restart messages",
    default: "#FFFFFF"
  },
  {
    id: "backgroundColor",
    type: "color",
    name: "Message Background",
    description: "Background color of restart messages",
    default: "#FF0000"
  }
];

// Main addon class (Backend)
class ScheduledRestartAddon {
  constructor(config = {}) {
    this.config = {
      enabled: false,
      restartInterval: 24,
      testMode: false,
      testInterval: 5,
      warningTime: 5,
      font: 'default',
      fontSize: 48,
      textColor: '#FFFFFF',
      backgroundColor: '#FF0000',
      ...config
    };
    
    this.fontsDir = null;
    this.directoryName = 'Fonts';
    this.fontDataCache = new Map();
    this.restartTimer = null;
    this.warningTimer = null;
    this.updateTimer = null;
    this.startTime = null;
    this.isWarningActive = false;
    this.timeRemaining = 'Not scheduled';
    this.isShuttingDown = false; // Track shutdown state
    
    // Store reference to this instance globally so frontend can access it
    global.scheduledRestartAddon = this;
    
    this.safeLog('ScheduledRestartAddon created with config:', this.config);
  }
  
  // Safe logging method that handles EIO errors during shutdown
  safeLog(message, ...args) {
    try {
      console.log(message, ...args);
    } catch (err) {
      // Silently ignore write errors during shutdown
      if (err.code !== 'EIO') {
        // Re-throw non-EIO errors only if not shutting down
        if (!this.isShuttingDown) {
          throw err;
        }
      }
    }
  }
  
  async init() {
    this.safeLog('Initializing Scheduled Restart addon with config:', this.config);
    
    await this.ensureFontsDirectory();
    await this.updateFontOptions();
    
    if (!this.config.enabled) {
      this.safeLog('Scheduled Restart addon is disabled');
      this.stopSchedule();
      return;
    }
    
    this.startSchedule();
    this.safeLog('Scheduled Restart addon initialized successfully');
  }
  
  async ensureFontsDirectory() {
    const path = require('path');
    const fs = require('fs').promises;
    const { app } = require('electron');
    
    try {
      const appDir = app.isPackaged 
        ? path.dirname(process.execPath)
        : __dirname.replace(/[\\\/]Addons$/, '');
      
      this.fontsDir = path.join(appDir, this.directoryName);
      
      try {
        await fs.access(this.fontsDir);
        this.safeLog(`${this.directoryName} directory already exists:`, this.fontsDir);
      } catch {
        await fs.mkdir(this.fontsDir, { recursive: true });
        this.safeLog(`Created ${this.directoryName} directory:`, this.fontsDir);
        
        const readmeContent = `Fonts Directory
===============

This directory is shared by all addons that need custom fonts.
Place your custom font files here (.ttf, .otf, .woff, .woff2)

The fonts will be available for selection in addon settings.

Supported formats:
- TrueType (.ttf)
- OpenType (.otf)
- Web Open Font Format (.woff, .woff2)

After adding fonts, click "Reload Addons" to refresh the font list.
`;
        await fs.writeFile(path.join(this.fontsDir, 'README.txt'), readmeContent);
      }
    } catch (err) {
      this.safeLog(`Failed to create ${this.directoryName} directory:`, err);
    }
  }
  
  async updateFontOptions() {
    try {
      const availableFonts = await this.getAvailableFonts();
      
      const fontSetting = settings.find(s => s.id === 'font');
      if (fontSetting) {
        fontSetting.options = [
          { value: 'default', label: 'Default (Arial)' },
          ...availableFonts.map(font => ({ value: font, label: font }))
        ];
        
        this.safeLog('Updated font options for restart addon:', fontSetting.options);
      }
    } catch (err) {
      this.safeLog('Failed to update font options:', err);
    }
  }
  
  async getAvailableFonts() {
    if (!this.fontsDir) {
      await this.ensureFontsDirectory();
    }
    
    const fs = require('fs').promises;
    
    try {
      const files = await fs.readdir(this.fontsDir);
      const fontFiles = files.filter(file => 
        /\.(ttf|otf|woff|woff2)$/i.test(file) && file !== 'README.txt'
      );
      return fontFiles;
    } catch {
      return [];
    }
  }
  
  async getFontAsDataUrl(fontName) {
    if (this.fontDataCache.has(fontName)) {
      return this.fontDataCache.get(fontName);
    }
    
    const path = require('path');
    const fs = require('fs').promises;
    
    try {
      if (!this.fontsDir) {
        await this.ensureFontsDirectory();
      }
      
      const fontPath = path.join(this.fontsDir, fontName);
      const fontData = await fs.readFile(fontPath);
      const base64Data = fontData.toString('base64');
      
      const ext = fontName.toLowerCase().split('.').pop();
      let mimeType = 'application/octet-stream';
      
      switch (ext) {
        case 'ttf':
          mimeType = 'font/ttf';
          break;
        case 'otf':
          mimeType = 'font/otf';
          break;
        case 'woff':
          mimeType = 'font/woff';
          break;
        case 'woff2':
          mimeType = 'font/woff2';
          break;
      }
      
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      this.fontDataCache.set(fontName, dataUrl);
      
      this.safeLog(`Font ${fontName} cached for restart addon`);
      return dataUrl;
    } catch (err) {
      this.safeLog(`Failed to read font ${fontName}:`, err);
      return null;
    }
  }
  
  // Method to trigger test warning (called from frontend)
  triggerTestWarning() {
    this.safeLog('=== BACKEND: Test warning triggered from frontend ===');
    this.safeLog('=== BACKEND: Broadcasting test-warning message ===');
    this.broadcastToFrontend({
      type: 'test-warning'
    });
    this.safeLog('=== BACKEND: Message should now be available at window.restartAddonMessage ===');
  }
  
  startSchedule() {
    this.stopSchedule();
    
    this.startTime = Date.now();
    const intervalMs = this.config.testMode 
      ? this.config.testInterval * 60 * 1000
      : this.config.restartInterval * 60 * 60 * 1000;
    
    const warningMs = this.config.warningTime * 60 * 1000;
    const warningTime = intervalMs - warningMs;
    
    this.safeLog(`Restart scheduled in ${this.config.testMode ? this.config.testInterval + ' minutes' : this.config.restartInterval + ' hours'}`);
    this.safeLog(`Warning will show in ${warningTime / 1000 / 60} minutes`);
    
    this.startTimeUpdater();
    
    this.warningTimer = setTimeout(() => {
      this.showWarning();
    }, warningTime);
    
    this.restartTimer = setTimeout(() => {
      this.performRestart();
    }, intervalMs);
  }
  
  startTimeUpdater() {
    this.updateTimer = setInterval(() => {
      this.updateTimeRemainingDisplay();
    }, 1000);
    
    this.updateTimeRemainingDisplay();
  }
  
  updateTimeRemainingDisplay() {
    if (!this.startTime) {
      this.timeRemaining = 'Not scheduled';
      return;
    }
    
    const timeData = this.getTimeRemaining();
    if (!timeData || timeData.total <= 0) {
      this.timeRemaining = 'Restarting soon...';
      return;
    }
    
    const { hours, minutes, seconds } = timeData;
    
    if (this.config.testMode) {
      if (minutes > 0) {
        this.timeRemaining = `${minutes}m ${seconds}s`;
      } else {
        this.timeRemaining = `${seconds}s`;
      }
    } else {
      if (hours > 0) {
        this.timeRemaining = `${hours}h ${minutes}m ${seconds}s`;
      } else if (minutes > 0) {
        this.timeRemaining = `${minutes}m ${seconds}s`;
      } else {
        this.timeRemaining = `${seconds}s`;
      }
    }
  }
  
  getTimeRemainingString() {
    return this.timeRemaining;
  }
  
  stopSchedule() {
    this.isShuttingDown = true;
    
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
    if (this.warningUpdateInterval) {
      clearInterval(this.warningUpdateInterval);
      this.warningUpdateInterval = null;
    }
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
    
    // Remove any active warnings when stopping
    if (this.isWarningActive) {
      try {
        this.broadcastToFrontend({
          type: 'remove-warning'
        });
      } catch (err) {
        // Ignore broadcast errors during shutdown
        if (err.code !== 'EIO') {
          this.safeLog('Error removing warning during shutdown:', err);
        }
      }
    }
    
    this.isWarningActive = false;
    this.startTime = null;
    this.timeRemaining = 'Not scheduled';
  }
  
  showWarning() {
    this.safeLog('Showing restart warning on main display');
    this.isWarningActive = true;
    
    // Send initial warning
    this.broadcastToFrontend({
      type: 'restart-warning',
      warningTime: this.config.warningTime
    });
    
    // Update the warning message every minute with current time remaining
    this.warningUpdateInterval = setInterval(() => {
      if (this.isWarningActive) {
        const timeData = this.getTimeRemaining();
        if (timeData && timeData.total > 0) {
          const minutesLeft = Math.ceil(timeData.total / (1000 * 60));
          this.broadcastToFrontend({
            type: 'update-warning',
            warningTime: minutesLeft
          });
          this.safeLog(`Updated warning: ${minutesLeft} minutes remaining`);
        }
      }
    }, 60000); // Update every minute
  }
  
  async performRestart() {
    this.safeLog('Performing PC restart');
    
    this.broadcastToFrontend({
      type: 'restart-now'
    });
    
    setTimeout(() => {
      const { exec } = require('child_process');
      const os = require('os');
      
      if (os.platform() === 'win32') {
        exec('shutdown /r /t 0', (error) => {
          if (error) {
            this.safeLog('Failed to restart Windows:', error);
          }
        });
      } else if (os.platform() === 'linux') {
        exec('sudo reboot', (error) => {
          if (error) {
            this.safeLog('Failed to restart Linux:', error);
          }
        });
      } else if (os.platform() === 'darwin') {
        exec('sudo reboot', (error) => {
          if (error) {
            this.safeLog('Failed to restart macOS:', error);
          }
        });
      }
    }, 5000);
  }
  
  broadcastToFrontend(message) {
    // Store message in both global (for backend access) and window (for frontend access)
    global.restartAddonMessage = message;
    
    // Also send to the main window via electron IPC if available
    try {
      const { BrowserWindow } = require('electron');
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`
          window.restartAddonMessage = ${JSON.stringify(message)};
          console.log('=== MAIN DISPLAY: Message injected via IPC ===', ${JSON.stringify(message)});
        `);
        this.safeLog('=== BACKEND: Message sent via Electron IPC to main window ===');
      }
    } catch (err) {
      this.safeLog('=== BACKEND: IPC not available, using fallback method ===');
    }
    
    this.safeLog('=== BACKEND: Message stored in global.restartAddonMessage ===');
    this.safeLog('=== BACKEND: Message content:', JSON.stringify(message));
  }
  
  getTimeRemaining() {
    if (!this.startTime) return null;
    
    const now = Date.now();
    const elapsed = now - this.startTime;
    const totalInterval = this.config.testMode 
      ? this.config.testInterval * 60 * 1000
      : this.config.restartInterval * 60 * 60 * 1000;
    
    const remaining = Math.max(0, totalInterval - elapsed);
    
    return {
      total: remaining,
      hours: Math.floor(remaining / (1000 * 60 * 60)),
      minutes: Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60)),
      seconds: Math.floor((remaining % (1000 * 60)) / 1000)
    };
  }
  
  async stop() {
    this.safeLog('Stopping Scheduled Restart addon');
    this.isShuttingDown = true;
    
    // Clean up timers and intervals first
    this.stopSchedule();
    
    // Clear cache safely
    try {
      if (this.fontDataCache) {
        this.fontDataCache.clear();
      }
    } catch (err) {
      this.safeLog('Error clearing font cache:', err);
    }
    
    // Clear global reference safely
    try {
      if (typeof global !== 'undefined') {
        global.scheduledRestartAddon = null;
      }
    } catch (err) {
      // Ignore errors when clearing global during shutdown
      if (err.code !== 'EIO') {
        this.safeLog('Error clearing global reference:', err);
      }
    }
  }
  
  updateConfig(newConfig) {
    this.safeLog('Updating Scheduled Restart config:', newConfig);
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    if (oldConfig.enabled !== this.config.enabled ||
        oldConfig.restartInterval !== this.config.restartInterval ||
        oldConfig.testMode !== this.config.testMode ||
        oldConfig.testInterval !== this.config.testInterval) {
      
      if (this.config.enabled) {
        this.startSchedule();
      } else {
        this.stopSchedule();
      }
    }
  }
  
  getConfig() {
    return this.config;
  }
  
  getFrontendScript() {
    const configStr = JSON.stringify(this.config);
    
    return `
      // Cleanup any existing instances to prevent conflicts
      if (window.RestartMainDisplay && window.RestartMainDisplay.checkInterval) {
        clearInterval(window.RestartMainDisplay.checkInterval);
      }
      if (window.RestartWebControl && window.RestartWebControl.countdownInterval) {
        clearInterval(window.RestartWebControl.countdownInterval);
      }
      
      console.log('=== RESTART ADDON: Loading Frontend ===');
      
      // Create main display handler
      window.RestartMainDisplay = {
        config: ${configStr},
        warningElement: null,
        checkInterval: null,
        customFont: null,
        fontFamily: 'Arial, sans-serif',
        
        async init() {
          console.log('Restart addon: Main display initializing...');
          await this.loadFont();
          this.startMessageChecker();
          console.log('Restart addon: Main display ready - checking for messages every 500ms');
        },
        
        async loadFont() {
          try {
            this.fontFamily = 'Arial, sans-serif';
            if (this.config.font && this.config.font !== 'default') {
              const fontDataUrl = await this.getFontDataUrl(this.config.font);
              if (fontDataUrl) {
                const fontFamilyName = 'RestartFont_' + Date.now();
                this.customFont = new FontFace(fontFamilyName, 'url("' + fontDataUrl + '")');
                await this.customFont.load();
                document.fonts.add(this.customFont);
                this.fontFamily = fontFamilyName + ', Arial, sans-serif';
                console.log('Custom font loaded for restart warnings');
              }
            }
          } catch (err) {
            console.error('Font loading error:', err);
            this.fontFamily = 'Arial, sans-serif';
          }
        },
        
        async getFontDataUrl(fontName) {
          try {
            if (window.electronAPI && window.electronAPI.getAddonFontData) {
              return await window.electronAPI.getAddonFontData('scheduled-restart', fontName);
            }
          } catch (err) {
            console.error('Font data error:', err);
          }
          return null;
        },
        
        showTestWarning() {
          console.log('*** SHOWING TEST WARNING ON MAIN DISPLAY ***');
          this.showWarningMessage(this.config.warningTime, true);
          setTimeout(() => {
            this.removeWarningMessage();
            console.log('*** TEST WARNING REMOVED ***');
          }, 2000);
        },
        
        showWarningMessage(minutesLeft, isTest) {
          console.log('*** CREATING WARNING OVERLAY ***', { minutesLeft, isTest });
          this.removeWarningMessage();
          
          this.warningElement = document.createElement('div');
          this.warningElement.id = 'restart-warning-fullscreen';
          this.warningElement.style.cssText = [
            'position: fixed !important',
            'top: 0 !important',
            'left: 0 !important', 
            'width: 100vw !important',
            'height: 100vh !important',
            'background: transparent !important', // No background dimming at all
            'color: ' + this.config.textColor + ' !important',
            'display: flex !important',
            'flex-direction: column !important',
            'align-items: center !important',
            'justify-content: center !important',
            'z-index: 2147483647 !important',
            'font-family: ' + this.fontFamily + ' !important',
            'font-weight: bold !important',
            'text-align: center !important',
            'user-select: none !important',
            'pointer-events: none !important' // Allow clicks to pass through to images
          ].join('; ');
          
          const title = isTest ? '⚠️ TEST WARNING ⚠️' : '⚠️ PLANNED RESTART ⚠️';
          const text = isTest ? 'This is how the warning will look' : 'PC will restart in ' + minutesLeft + ' minutes';
          const subtitle = isTest ? 'Test warning (2 seconds)' : 'Please save your work now';
          
          // Create a semi-transparent content container
          const backgroundColor = this.config.backgroundColor;
          const rgbMatch = backgroundColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
          let transparentBg = backgroundColor;
          
          if (rgbMatch) {
            // Convert hex to rgba with 70% opacity
            const r = parseInt(rgbMatch[1], 16);
            const g = parseInt(rgbMatch[2], 16);
            const b = parseInt(rgbMatch[3], 16);
            transparentBg = 'rgba(' + r + ', ' + g + ', ' + b + ', 0.7)';
          } else {
            // Fallback for other color formats
            transparentBg = backgroundColor.replace(')', ', 0.7)').replace('rgb(', 'rgba(');
          }
          
          this.warningElement.innerHTML = [
            '<div style="background: ' + transparentBg + '; padding: 30px 50px; border-radius: 15px; box-shadow: 0 8px 25px rgba(0,0,0,0.3); max-width: 80%; text-align: center; backdrop-filter: blur(2px);">',
            '<div style="margin-bottom: 20px; font-size: ' + (this.config.fontSize * 1.2) + 'px;">' + title + '</div>',
            '<div id="restart-warning-text" style="margin-bottom: 20px; font-size: ' + this.config.fontSize + 'px;">' + text + '</div>',
            '<div style="font-size: ' + (this.config.fontSize * 0.6) + 'px; opacity: 0.9;">' + subtitle + '</div>',
            '</div>'
          ].join('');
          
          // Force append to body and ensure visibility
          document.body.appendChild(this.warningElement);
          this.warningElement.offsetHeight;
          
          console.log('*** WARNING OVERLAY ADDED TO DOM ***');
        },
        
        showFinalMessage() {
          console.log('*** SHOWING FINAL RESTART MESSAGE ***');
          this.removeWarningMessage();
          
          this.warningElement = document.createElement('div');
          this.warningElement.id = 'restart-final-fullscreen';
          this.warningElement.style.cssText = [
            'position: fixed !important',
            'top: 0 !important',
            'left: 0 !important',
            'width: 100vw !important',
            'height: 100vh !important',
            'background: #FF0000 !important',
            'color: #FFFFFF !important',
            'display: flex !important',
            'flex-direction: column !important',
            'align-items: center !important',
            'justify-content: center !important',
            'z-index: 2147483647 !important',
            'font-family: ' + this.fontFamily + ' !important',
            'font-size: ' + (this.config.fontSize + 20) + 'px !important',
            'font-weight: bold !important',
            'text-align: center !important',
            'animation: flashRed 0.5s infinite alternate !important'
          ].join('; ');
          
          this.warningElement.innerHTML = [
            '<div style="margin-bottom: 30px;">🔥 RESTARTING NOW 🔥</div>',
            '<div style="font-size: ' + (this.config.fontSize * 0.7) + 'px; margin-top: 30px;">Please wait...</div>'
          ].join('');
          
          if (!document.getElementById('restart-flash-styles')) {
            const style = document.createElement('style');
            style.id = 'restart-flash-styles';
            style.textContent = '@keyframes flashRed { from { background-color: #FF0000 !important; } to { background-color: #CC0000 !important; } }';
            document.head.appendChild(style);
          }
          
          document.body.appendChild(this.warningElement);
          this.warningElement.offsetHeight;
          console.log('*** FINAL MESSAGE DISPLAYED ***');
        },
        
        removeWarningMessage() {
          if (this.warningElement) {
            this.warningElement.remove();
            this.warningElement = null;
            console.log('*** WARNING OVERLAY REMOVED ***');
          }
        },
        
        startMessageChecker() {
          if (this.checkInterval) {
            clearInterval(this.checkInterval);
          }
          
          console.log('=== MAIN DISPLAY: Starting message checker ===');
          console.log('=== MAIN DISPLAY: Browser context - can only access window, not global ===');
          
          this.checkInterval = setInterval(() => {
            // Only check window.restartAddonMessage (global is not accessible in browser)
            if (window.restartAddonMessage) {
              const message = window.restartAddonMessage;
              console.log('=== MAIN DISPLAY: FOUND MESSAGE IN WINDOW ===', message);
              
              // Clear the message immediately
              window.restartAddonMessage = null;
              
              console.log('=== MAIN DISPLAY: PROCESSING MESSAGE ===', message);
              
              if (message.type === 'restart-warning') {
                console.log('=== MAIN DISPLAY: Showing restart warning ===');
                this.showWarningMessage(message.warningTime, false);
              } else if (message.type === 'update-warning') {
                console.log('=== MAIN DISPLAY: Updating warning time ===');
                this.updateWarningTime(message.warningTime);
              } else if (message.type === 'remove-warning') {
                console.log('=== MAIN DISPLAY: Removing warning ===');
                this.removeWarningMessage();
              } else if (message.type === 'restart-now') {
                console.log('=== MAIN DISPLAY: Showing final message ===');
                this.showFinalMessage();
              } else if (message.type === 'test-warning') {
                console.log('=== MAIN DISPLAY: Showing test warning ===');
                this.showTestWarning();
              }
            } else {
              // Only log every 100 checks to avoid spam
              if ((this.checkCount || 0) % 100 === 0) {
                console.log('=== MAIN DISPLAY: No message in window (check #' + (this.checkCount || 0) + ') ===');
              }
              this.checkCount = (this.checkCount || 0) + 1;
            }
          }, 200); // Check every 200ms
          
          console.log('=== MAIN DISPLAY: Message checker started - checking window.restartAddonMessage ===');
        },
        
        updateWarningTime(newMinutesLeft) {
          if (this.warningElement) {
            const textElement = this.warningElement.querySelector('#restart-warning-text');
            if (textElement) {
              textElement.textContent = 'PC will restart in ' + newMinutesLeft + ' minutes';
              console.log('*** WARNING TIME UPDATED TO ' + newMinutesLeft + ' MINUTES ***');
            }
          }
        },
        
        cleanup() {
          if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
          }
          this.removeWarningMessage();
        }
      };
      
      // Create web control handler
      window.RestartWebControl = {
        config: ${configStr},
        countdownElement: null,
        countdownInterval: null,
        uiInjected: false,
        
        init() {
          console.log('Restart addon: Web control initializing...');
          setTimeout(() => this.injectUI(), 2000);
          setTimeout(() => this.injectUI(), 5000);
          setTimeout(() => this.injectUI(), 8000);
        },
        
        injectUI() {
          if (this.uiInjected) return;
          
          console.log('Attempting to inject restart addon UI...');
          const addonElements = document.querySelectorAll('*');
          let restartAddon = null;
          
          for (const el of addonElements) {
            if (el.textContent && el.textContent.includes('Scheduled PC Restart')) {
              console.log('Found restart addon element');
              restartAddon = el;
              break;
            }
          }
          
          if (!restartAddon) {
            console.log('Restart addon element not found, will retry...');
            return;
          }
          
          if (restartAddon.querySelector('.restart-countdown-container')) {
            console.log('UI already injected');
            return;
          }
          
          const html = [
            '<div class="restart-countdown-container" style="background: #f8f9fa; border: 2px solid #007bff; border-radius: 10px; padding: 20px; margin: 20px 0;">',
            '<div style="color: #007bff; font-weight: 700; font-size: 18px; margin-bottom: 15px; text-align: center;">🕒 Next Restart Countdown</div>',
            '<div style="background: #fff; border: 2px solid #dee2e6; border-radius: 8px; padding: 20px; text-align: center; margin: 15px 0; font-family: monospace; font-size: 20px; font-weight: bold;">',
            '<span id="restart-time-remaining" style="padding: 12px 20px; border-radius: 6px; background: #f8f9fa; color: #6c757d;">Loading...</span>',
            '</div>',
            '<div style="text-align: center;">',
            '<button type="button" id="test-restart-warning" style="background: #28a745; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px;">🧪 Test Warning</button>',
            '</div>',
            '<div style="color: #6c757d; font-size: 14px; margin-top: 10px; text-align: center;">Click test to preview warning on main display</div>',
            '</div>'
          ].join('');
          
          restartAddon.insertAdjacentHTML('beforeend', html);
          this.uiInjected = true;
          console.log('Restart addon UI injected successfully');
          
          const testBtn = document.getElementById('test-restart-warning');
          if (testBtn) {
            testBtn.addEventListener('click', () => this.testWarning());
            console.log('Test button event listener added');
          }
          
          this.countdownElement = document.getElementById('restart-time-remaining');
          this.startCountdown();
        },
        
        testWarning() {
          console.log('=== WEB CONTROL: TEST BUTTON CLICKED ===');
          
          // Try multiple methods to get the message to the main display
          
          // Method 1: Direct window injection (works if same window)
          console.log('=== WEB CONTROL: Method 1 - Direct window injection ===');
          window.restartAddonMessage = { type: 'test-warning' };
          
          // Method 2: Try to access main window if available
          try {
            if (window.parent && window.parent !== window) {
              console.log('=== WEB CONTROL: Method 2 - Parent window injection ===');
              window.parent.restartAddonMessage = { type: 'test-warning' };
            }
          } catch (e) {
            console.log('=== WEB CONTROL: Parent window not accessible ===');
          }
          
          // Method 3: Backend trigger (should use Electron IPC)
          if (typeof global !== 'undefined' && global.scheduledRestartAddon) {
            console.log('=== WEB CONTROL: Method 3 - Backend trigger ===');
            global.scheduledRestartAddon.triggerTestWarning();
          } else {
            console.log('=== WEB CONTROL: Backend not accessible from web interface ===');
          }
          
          // Method 4: Try to trigger via electron API if available
          try {
            if (window.electronAPI) {
              console.log('=== WEB CONTROL: Method 4 - Electron API trigger ===');
              // This would need an IPC call, but let's see if electronAPI exists
              console.log('=== WEB CONTROL: Electron API available, but no direct restart trigger ===');
            }
          } catch (e) {
            console.log('=== WEB CONTROL: Electron API not available ===');
          }
          
          const btn = document.getElementById('test-restart-warning');
          if (btn) {
            btn.textContent = '✅ Test Sent!';
            btn.style.background = '#007bff';
            setTimeout(() => {
              btn.textContent = '🧪 Test Warning';
              btn.style.background = '#28a745';
            }, 2000);
          }
          
          console.log('=== WEB CONTROL: All trigger methods attempted ===');
          console.log('=== WEB CONTROL: If main display is separate window, IPC method should work ===');
        },
        
        startCountdown() {
          if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
          }
          
          this.countdownInterval = setInterval(() => {
            if (!this.countdownElement) return;
            
            let timeText = 'Not scheduled';
            let colorStyle = 'background: #f8f9fa; color: #6c757d;';
            
            if (typeof global !== 'undefined' && global.scheduledRestartAddon) {
              const enabled = global.scheduledRestartAddon.config.enabled;
              if (enabled) {
                timeText = global.scheduledRestartAddon.getTimeRemainingString();
                
                if (timeText.includes('s') && !timeText.includes('m') && !timeText.includes('h')) {
                  colorStyle = 'background: #f8d7da; color: #721c24;';
                } else if (timeText.includes('m') && !timeText.includes('h')) {
                  colorStyle = 'background: #fff3cd; color: #856404;';
                } else if (!timeText.includes('Not scheduled')) {
                  colorStyle = 'background: #d4edda; color: #155724;';
                }
              } else {
                timeText = 'Disabled';
              }
            }
            
            this.countdownElement.textContent = timeText;
            this.countdownElement.style.cssText = 'padding: 12px 20px; border-radius: 6px; ' + colorStyle;
          }, 1000);
          
          console.log('Countdown updater started');
        },
        
        cleanup() {
          if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
          }
          this.uiInjected = false;
        }
      };
      
      // Auto-detect environment and initialize (avoid variable redeclaration)
      try {
        const envIsWebControl = window.location.pathname.includes('/web/') || document.querySelector('.container') || document.querySelector('.tabs');
        
        if (envIsWebControl) {
          console.log('Environment: Web control interface detected');
          window.RestartWebControl.init();
        } else {
          console.log('Environment: Main display interface detected');
          window.RestartMainDisplay.init();
        }
      } catch (err) {
        console.error('Environment detection error:', err);
        // Fallback - assume main display
        console.log('Fallback: Loading main display interface');
        window.RestartMainDisplay.init();
      }
    `;
  }
}

module.exports = {
  info,
  settings,
  Addon: ScheduledRestartAddon
};