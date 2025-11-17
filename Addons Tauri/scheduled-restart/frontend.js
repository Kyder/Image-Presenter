// Scheduled PC Restart Addon - Frontend (Tauri version)
// Handles countdown display and restart warnings

(async function() {
  try {
    console.log('=== SCHEDULED RESTART ADDON LOADING ===');
    
    // IMPORTANT: Clean up any existing instance first
    if (window.scheduledRestartAddon) {
      console.log('=== CLEANING UP EXISTING INSTANCE ===');
      window.scheduledRestartAddon.cleanup();
      window.scheduledRestartAddon = null;
    }
    
    // Get config from addon system
    const config = window.addonConfig || {
      enabled: false,
      restartInterval: 24,
      testMode: false,
      testInterval: 5,
      warningTime: 5,
      font: 'default',
      fontSize: 48,
      textColor: '#FFFFFF',
      backgroundColor: '#FF0000',
      backgroundOpacity: 95,
      enableBlink: true
    };
    
    console.log('Scheduled Restart config:', config);
    
    if (!config.enabled) {
      console.log('Scheduled Restart addon is disabled');
      return;
    }
    
    // Font loader for Tauri (same as datetime)
    async function loadCustomFont(fontName) {
      if (!fontName || fontName === 'default') {
        return 'Arial, sans-serif';
      }
      
      if (fontName.match(/\.(ttf|otf|woff|woff2)$/i)) {
        try {
          console.log('Loading custom font:', fontName);
          
          const { invoke } = window.__TAURI__.core;
          const fontDataUrl = await invoke('get_font_data', { fontName: fontName });
          
          const fontFamilyName = fontName.replace(/\.(ttf|otf|woff|woff2)$/i, '');
          
          const existingStyle = document.getElementById(`font-restart-${fontFamilyName}`);
          if (!existingStyle) {
            const style = document.createElement('style');
            style.id = `font-restart-${fontFamilyName}`;
            style.textContent = `
              @font-face {
                font-family: 'Restart-${fontFamilyName}';
                src: url('${fontDataUrl}');
              }
            `;
            document.head.appendChild(style);
            console.log('Custom font loaded for restart:', fontFamilyName);
          }
          
          return `'Restart-${fontFamilyName}', Arial, sans-serif`;
        } catch (err) {
          console.error('Failed to load custom font:', err);
          return 'Arial, sans-serif';
        }
      }
      
      return fontName + ', Arial, sans-serif';
    }
    
    const fontFamily = await loadCustomFont(config.font);
    
    // Global addon object
    window.scheduledRestartAddon = {
      instanceId: Date.now(), // Unique ID for this instance
      config: config,
      fontFamily: fontFamily,
      restartTimer: null,
      warningTimer: null,
      updateTimer: null,
      countdownUpdateTimer: null,
      startTime: null,
      isWarningActive: false,
      warningElement: null,
      
      init() {
        console.log('=== SCHEDULED RESTART: Initializing (Instance ID: ' + this.instanceId + ') ===');
        console.log('Config:', this.config);
        
        // Clean up any existing timers
        this.cleanup();
        
        if (!this.config.enabled) {
          console.log('Scheduled Restart is disabled');
          return;
        }
        
        this.startSchedule();
        console.log('=== SCHEDULED RESTART: Initialized ===');
      },
      
      startSchedule() {
        const intervalMs = this.config.testMode 
          ? this.config.testInterval * 60 * 1000
          : this.config.restartInterval * 60 * 60 * 1000;
        
        const warningMs = this.config.warningTime * 60 * 1000;
        
        console.log(`Restart interval: ${intervalMs}ms (${intervalMs/1000/60} minutes)`);
        console.log(`Warning time: ${warningMs}ms (${warningMs/1000/60} minutes)`);
        console.log(`Warning will show at: ${(intervalMs - warningMs)/1000/60} minutes`);
        
        this.startTime = Date.now();
        console.log('Start time:', new Date(this.startTime));
        
        // Schedule warning
        const timeUntilWarning = intervalMs - warningMs;
        if (timeUntilWarning > 0) {
          console.log(`Scheduling warning in ${timeUntilWarning}ms (${timeUntilWarning/1000/60} minutes)`);
          this.warningTimer = setTimeout(() => {
            console.log('=== WARNING TIMER TRIGGERED ===');
            this.showWarning();
          }, timeUntilWarning);
        } else {
          console.log('Warning time >= interval time, showing warning immediately');
          this.showWarning();
        }
        
        // Schedule restart
        console.log(`Scheduling restart in ${intervalMs}ms (${intervalMs/1000/60} minutes)`);
        this.restartTimer = setTimeout(() => {
          console.log('=== RESTART TIMER TRIGGERED ===');
          this.executeRestart();
        }, intervalMs);
        
        // Update countdown display every second
        this.updateTimer = setInterval(() => {
          this.logCountdown();
        }, 10000); // Log every 10 seconds
        
        console.log('All timers scheduled successfully');
      },
      
      logCountdown() {
        const remaining = this.getTimeRemaining();
        console.log(`[Instance ${this.instanceId}] Time until restart: ${remaining.hours}h ${remaining.minutes}m ${remaining.seconds}s`);
      },
      
      getTimeRemaining() {
        if (!this.startTime) {
          return { hours: 0, minutes: 0, seconds: 0, total: 0 };
        }
        
        const intervalMs = this.config.testMode 
          ? this.config.testInterval * 60 * 1000
          : this.config.restartInterval * 60 * 60 * 1000;
        
        const elapsed = Date.now() - this.startTime;
        const remaining = intervalMs - elapsed;
        
        if (remaining <= 0) {
          return { hours: 0, minutes: 0, seconds: 0, total: 0 };
        }
        
        const hours = Math.floor(remaining / (60 * 60 * 1000));
        const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
        
        return { hours, minutes, seconds, total: remaining };
      },
      
      stopSchedule() {
        if (this.restartTimer) {
          clearTimeout(this.restartTimer);
          this.restartTimer = null;
          console.log('Cleared restart timer');
        }
        
        if (this.warningTimer) {
          clearTimeout(this.warningTimer);
          this.warningTimer = null;
          console.log('Cleared warning timer');
        }
        
        if (this.updateTimer) {
          clearInterval(this.updateTimer);
          this.updateTimer = null;
          console.log('Cleared update timer');
        }
        
        if (this.countdownUpdateTimer) {
          clearInterval(this.countdownUpdateTimer);
          this.countdownUpdateTimer = null;
          console.log('Cleared countdown update timer');
        }
        
        this.removeWarning();
        this.startTime = null;
        
        console.log('All schedules stopped');
      },
      
      showWarning() {
        console.log('=== SHOWING RESTART WARNING ===');
        
        this.isWarningActive = true;
        
        // Remove existing warning if any
        this.removeWarning();
        
        // Convert opacity percentage to 0-1 range
        const opacity = this.config.backgroundOpacity / 100;
        
        // Convert hex color to rgba with opacity
        const bgColor = this.config.backgroundColor;
        let r, g, b;
        if (bgColor.length === 7) {
          r = parseInt(bgColor.substring(1, 3), 16);
          g = parseInt(bgColor.substring(3, 5), 16);
          b = parseInt(bgColor.substring(5, 7), 16);
        } else {
          r = 255; g = 0; b = 0; // fallback to red
        }
        const bgColorRgba = `rgba(${r}, ${g}, ${b}, ${opacity})`;
        
        // Create overlay backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'restart-warning-backdrop';
        backdrop.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 999999;
        `;
        
        // Create warning box
        this.warningElement = document.createElement('div');
        this.warningElement.id = 'restart-warning';
        this.warningElement.style.cssText = `
          background: ${bgColorRgba};
          color: ${this.config.textColor};
          padding: 60px 80px;
          border-radius: 20px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
          font-family: ${this.fontFamily};
          font-size: ${this.config.fontSize}px;
          font-weight: bold;
          text-align: center;
          max-width: 80%;
          ${this.config.enableBlink ? 'animation: pulse 2s ease-in-out infinite;' : ''}
        `;
        
        const minutesLeft = this.config.warningTime;
        
        this.warningElement.innerHTML = `
          <div style="font-size: 1.5em; margin-bottom: 30px;">⚠️ WARNING ⚠️</div>
          <div id="restart-warning-text" style="margin-bottom: 20px;">PC will restart in ${minutesLeft} minutes</div>
          <div style="font-size: 0.6em; opacity: 0.9;">
            Please save your work
          </div>
        `;
        
        backdrop.appendChild(this.warningElement);
        
        // Add pulsing animation only if enabled
        if (this.config.enableBlink) {
          const style = document.createElement('style');
          style.id = 'restart-warning-animation';
          style.textContent = `
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.7; }
            }
          `;
          document.head.appendChild(style);
        }
        
        const addonContainer = document.getElementById('addon-container');
        if (addonContainer) {
          addonContainer.appendChild(backdrop);
          console.log('Warning added to addon-container');
        } else {
          document.body.appendChild(backdrop);
          console.log('Warning added to body');
        }
        
        // Update countdown every second
        let secondsLeft = minutesLeft * 60;
        this.countdownUpdateTimer = setInterval(() => {
          secondsLeft--;
          
          if (secondsLeft <= 0) {
            clearInterval(this.countdownUpdateTimer);
            this.countdownUpdateTimer = null;
            return;
          }
          
          const mins = Math.floor(secondsLeft / 60);
          const secs = secondsLeft % 60;
          
          const textElement = this.warningElement?.querySelector('#restart-warning-text');
          if (textElement) {
            if (mins > 0) {
              textElement.textContent = `PC will restart in ${mins} minute${mins !== 1 ? 's' : ''} ${secs} seconds`;
            } else {
              textElement.textContent = `PC will restart in ${secs} seconds`;
            }
          }
        }, 1000);
        
        console.log('=== RESTART WARNING SHOWN ===');
      },
      
      removeWarning() {
        // Remove backdrop (which contains the warning box)
        const backdrop = document.getElementById('restart-warning-backdrop');
        if (backdrop && backdrop.parentNode) {
          backdrop.parentNode.removeChild(backdrop);
          console.log('Warning backdrop removed');
        }
        
        // Just in case, also try to remove warning element directly
        if (this.warningElement && this.warningElement.parentNode) {
          this.warningElement.parentNode.removeChild(this.warningElement);
          console.log('Warning element removed');
        }
        
        this.warningElement = null;
        
        if (this.countdownUpdateTimer) {
          clearInterval(this.countdownUpdateTimer);
          this.countdownUpdateTimer = null;
        }
        
        const animStyle = document.getElementById('restart-warning-animation');
        if (animStyle) {
          animStyle.remove();
        }
        
        this.isWarningActive = false;
      },
      
      async executeRestart() {
        console.log('=== EXECUTING PC RESTART ===');
        
        // Show final message
        this.removeWarning();
        
        const finalMessage = document.createElement('div');
        finalMessage.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: #000000;
          color: #FFFFFF;
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999999;
          font-family: ${this.fontFamily};
          font-size: ${this.config.fontSize * 1.2}px;
          font-weight: bold;
        `;
        
        finalMessage.textContent = 'Restarting PC...';
        
        const addonContainer = document.getElementById('addon-container');
        if (addonContainer) {
          addonContainer.appendChild(finalMessage);
        } else {
          document.body.appendChild(finalMessage);
        }
        
        // Wait 2 seconds then trigger restart
        setTimeout(async () => {
          try {
            console.log('Calling restart_pc function via IPC...');
            const { invoke } = window.__TAURI__.core;
            const result = await invoke('call_addon_function', {
              addonId: 'scheduled-restart',
              functionName: 'restart_pc'
            });
            console.log('Restart command result:', result);
          } catch (err) {
            console.error('Failed to restart PC:', err);
            alert('Failed to restart PC: ' + err.message);
          }
        }, 2000);
      },
      
      getTimeRemainingString() {
        const remaining = this.getTimeRemaining();
        
        if (remaining.total <= 0) {
          return 'Restarting...';
        }
        
        if (remaining.hours > 0) {
          return `${remaining.hours}h ${remaining.minutes}m ${remaining.seconds}s`;
        } else if (remaining.minutes > 0) {
          return `${remaining.minutes}m ${remaining.seconds}s`;
        } else {
          return `${remaining.seconds}s`;
        }
      },
      
      testWarning() {
        console.log('=== TEST WARNING TRIGGERED ===');
        this.showWarning();
        
        // Auto-hide after 10 seconds in test mode
        setTimeout(() => {
          this.removeWarning();
          console.log('=== TEST WARNING REMOVED ===');
        }, 10000);
      },
      
      cleanup() {
        console.log('=== CLEANUP CALLED (Instance ID: ' + this.instanceId + ') ===');
        this.stopSchedule();
        this.removeWarning();
        console.log('=== CLEANUP COMPLETE (Instance ID: ' + this.instanceId + ') ===');
      },
      
      updateConfig(newConfig) {
        console.log('=== CONFIG UPDATE RECEIVED ===');
        console.log('Old config:', this.config);
        console.log('New config:', newConfig);
        
        // Stop ALL existing timers first
        this.stopSchedule();
        
        // Update config
        this.config = { ...this.config, ...newConfig };
        console.log('Merged config:', this.config);
        
        // Restart schedule with new config if enabled
        if (this.config.enabled) {
          console.log('Restarting schedule with new config...');
          this.startSchedule();
        } else {
          console.log('Addon is disabled, not starting schedule');
        }
      }
    };
    
    // Initialize
    window.scheduledRestartAddon.init();
    
    console.log('=== SCHEDULED RESTART ADDON LOADED SUCCESSFULLY ===');
    
  } catch (error) {
    console.error('CRITICAL ERROR in Scheduled Restart addon:', error);
    console.error('Error stack:', error.stack);
  }
})();