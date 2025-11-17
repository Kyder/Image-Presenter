// Date/Time Display Addon - Frontend
// Tauri version with custom font support

(async function() {
  try {
    console.log('Date/Time Display addon loaded');
    
    // Get config from addon system
    const config = window.addonConfig || {
      enabled: true,
      font: 'default',
      fontSize: 24,
      bold: false,
      color: '#FFFFFF',
      borderColor: '#000000',
      borderWidth: 2,
      dateSeparator: '.',
      timeSeparator: ':',
      style: 'static',
      speed: 50,
      layout: 'inline'
    };
    
    console.log('DateTime config:', config);
    
    if (!config.enabled) {
      console.log('DateTime addon is disabled');
      return;
    }
    
    // Font loader for Tauri
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
          
          const existingStyle = document.getElementById(`font-${fontFamilyName}`);
          if (!existingStyle) {
            const style = document.createElement('style');
            style.id = `font-${fontFamilyName}`;
            style.textContent = `
              @font-face {
                font-family: '${fontFamilyName}';
                src: url('${fontDataUrl}');
              }
            `;
            document.head.appendChild(style);
            console.log('Custom font loaded:', fontFamilyName);
          }
          
          return `'${fontFamilyName}', Arial, sans-serif`;
        } catch (err) {
          console.error('Failed to load custom font:', err);
          return 'Arial, sans-serif';
        }
      }
      
      return fontName + ', Arial, sans-serif';
    }
    
    const fontFamily = await loadCustomFont(config.font);
    
    window.dateTimeAddon = {
      element: null,
      updateInterval: null,
      teleportInterval: null,
      bounceAnimFrame: null,
      config: config,
      fontFamily: fontFamily,
      
      init() {
        console.log('Initializing DateTime display');
        
        // CRITICAL: Clean up ALL existing datetime displays first
        const existingDisplays = document.querySelectorAll('#datetime-display');
        existingDisplays.forEach(display => {
          console.log('Removing duplicate datetime display');
          display.remove();
        });
        
        // Stop all intervals/animations first
        this.clearIntervals();
        
        // Remove old element reference
        if (this.element && this.element.parentNode) {
          this.element.parentNode.removeChild(this.element);
          this.element = null;
        }
        
        // Now create new element
        this.element = document.createElement('div');
        this.element.id = 'datetime-display';
        this.element.style.cssText = `
          position: absolute;
          z-index: 10000;
          pointer-events: none;
          font-family: ${this.fontFamily};
          font-size: ${this.config.fontSize}px;
          font-weight: ${this.config.bold ? 'bold' : 'normal'};
          color: ${this.config.color};
          white-space: nowrap;
        `;
        
        const dateEl = document.createElement('span');
        dateEl.id = 'datetime-date';
        
        const timeEl = document.createElement('span');
        timeEl.id = 'datetime-time';
        
        this.element.appendChild(dateEl);
        this.element.appendChild(timeEl);
        
        // Append to addon container, not body
        const addonContainer = document.getElementById('addon-container');
        if (addonContainer) {
          addonContainer.appendChild(this.element);
          console.log('DateTime added to addon-container');
        } else {
          document.body.appendChild(this.element);
          console.log('DateTime added to body (fallback)');
        }
        
        this.applyBorder();
        this.setupLayout(dateEl, timeEl);
        this.startTimeUpdate(dateEl, timeEl);
        this.applyAnimation();
        
        console.log('DateTime display initialized');
      },
      
      applyBorder() {
        const bw = this.config.borderWidth || 0;
        const bc = this.config.borderColor || '#000000';
        
        if (bw > 0) {
          const shadows = [];
          for (let x = -bw; x <= bw; x++) {
            for (let y = -bw; y <= bw; y++) {
              if (x !== 0 || y !== 0) {
                shadows.push(`${x}px ${y}px 0 ${bc}`);
              }
            }
          }
          this.element.style.textShadow = shadows.join(', ');
        } else {
          this.element.style.textShadow = 'none';
        }
      },
      
      setupLayout(dateEl, timeEl) {
        dateEl.style.display = 'block';
        timeEl.style.display = 'block';
        dateEl.style.marginLeft = '0';
        timeEl.style.marginLeft = '0';
        dateEl.style.marginTop = '0';
        timeEl.style.marginTop = '0';
        
        if (this.config.layout === 'inline') {
          dateEl.style.display = 'inline-block';
          timeEl.style.display = 'inline-block';
          timeEl.style.marginLeft = '20px';
        } else if (this.config.layout === 'above') {
          this.element.innerHTML = '';
          this.element.appendChild(timeEl);
          this.element.appendChild(dateEl);
          dateEl.style.marginTop = '5px';
        } else if (this.config.layout === 'below') {
          this.element.innerHTML = '';
          this.element.appendChild(dateEl);
          this.element.appendChild(timeEl);
          timeEl.style.marginTop = '5px';
        }
      },
      
      startTimeUpdate(dateEl, timeEl) {
        const updateDateTime = () => {
          const now = new Date();
          
          const day = String(now.getDate()).padStart(2, '0');
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const year = now.getFullYear();
          const dateSep = this.config.dateSeparator || '.';
          const dateString = `${day}${dateSep}${month}${dateSep}${year}`;
          
          const hours = String(now.getHours()).padStart(2, '0');
          const minutes = String(now.getMinutes()).padStart(2, '0');
          const seconds = String(now.getSeconds()).padStart(2, '0');
          const timeSep = this.config.timeSeparator || ':';
          const timeString = `${hours}${timeSep}${minutes}${timeSep}${seconds}`;
          
          dateEl.textContent = dateString;
          timeEl.textContent = timeString;
        };
        
        updateDateTime();
        this.updateInterval = setInterval(updateDateTime, 1000);
      },
      
      applyAnimation() {
        this.element.style.animation = 'none';
        this.element.style.left = 'auto';
        this.element.style.top = 'auto';
        this.element.style.right = '10px';
        this.element.style.bottom = '10px';
        this.element.style.transform = 'none';
        this.element.style.position = 'absolute';
        
        const style = this.config.style || 'static';
        
        if (style === 'sliding') {
          this.startSliding();
        } else if (style === 'bouncing') {
          this.startBouncing();
        } else if (style === 'teleporting') {
          this.startTeleporting();
        }
      },
      
      startSliding() {
        this.element.style.top = '20px';
        this.element.style.bottom = 'auto';
        this.element.style.right = 'auto';
        this.element.style.left = '100vw';
        
        const duration = Math.max(5, (window.innerWidth + 400) / (this.config.speed || 50));
        this.element.style.animation = `datetime-slide ${duration}s linear infinite`;
        
        if (!document.getElementById('datetime-slide-keyframes')) {
          const style = document.createElement('style');
          style.id = 'datetime-slide-keyframes';
          style.textContent = `
            @keyframes datetime-slide {
              from { left: 100vw; transform: translateX(0); }
              to { left: -100%; transform: translateX(-100%); }
            }
          `;
          document.head.appendChild(style);
        }
      },
      
      startBouncing() {
        let x = Math.random() * (window.innerWidth - 200);
        let y = Math.random() * (window.innerHeight - 100);
        let dx = (this.config.speed || 50) / 30;
        let dy = (this.config.speed || 50) / 30;
        
        if (Math.abs(dx) < 1) dx = dx < 0 ? -1 : 1;
        if (Math.abs(dy) < 1) dy = dy < 0 ? -1 : 1;
        
        const animate = () => {
          const rect = this.element.getBoundingClientRect();
          
          x += dx;
          y += dy;
          
          if (x <= 0 || x + rect.width >= window.innerWidth) {
            dx = -dx;
            x = Math.max(0, Math.min(x, window.innerWidth - rect.width));
          }
          if (y <= 0 || y + rect.height >= window.innerHeight) {
            dy = -dy;
            y = Math.max(0, Math.min(y, window.innerHeight - rect.height));
          }
          
          this.element.style.left = `${x}px`;
          this.element.style.top = `${y}px`;
          this.element.style.right = 'auto';
          this.element.style.bottom = 'auto';
          
          this.bounceAnimFrame = requestAnimationFrame(animate);
        };
        
        animate();
      },
      
      startTeleporting() {
        const teleport = () => {
          const positions = [
            { top: '10px', left: '10px', bottom: 'auto', right: 'auto' },
            { top: '10px', right: '10px', bottom: 'auto', left: 'auto' },
            { bottom: '10px', right: '10px', top: 'auto', left: 'auto' },
            { bottom: '10px', left: '10px', top: 'auto', right: 'auto' }
          ];
          
          const pos = positions[Math.floor(Math.random() * positions.length)];
          Object.assign(this.element.style, pos);
          this.element.style.transform = 'none';
        };
        
        teleport();
        
        const intervalMs = Math.max(1000, (200 - (this.config.speed || 50)) * 50);
        this.teleportInterval = setInterval(teleport, intervalMs);
      },
      
      clearIntervals() {
        if (this.updateInterval) {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
        }
        
        if (this.teleportInterval) {
          clearInterval(this.teleportInterval);
          this.teleportInterval = null;
        }
        
        if (this.bounceAnimFrame) {
          cancelAnimationFrame(this.bounceAnimFrame);
          this.bounceAnimFrame = null;
        }
      },
      
      remove() {
        console.log('Removing DateTime display');
        this.clearIntervals();
        
        // Remove all datetime displays from DOM
        const allDisplays = document.querySelectorAll('#datetime-display');
        allDisplays.forEach(display => display.remove());
        
        if (this.element) {
          this.element = null;
        }
        
        const keyframes = document.getElementById('datetime-slide-keyframes');
        if (keyframes) {
          keyframes.remove();
        }
      },
      
      cleanup() {
        console.log('DateTime cleanup called');
        this.remove();
      },
      
      updateConfig(newConfig) {
        console.log('DateTime received config update:', newConfig);
        this.config = { ...this.config, ...newConfig };
        this.init();
      }
    };
    
    window.dateTimeAddon.init();
    
  } catch (error) {
    console.error('CRITICAL ERROR in DateTime addon:', error);
    console.error('Error stack:', error.stack);
    console.error('Error message:', error.message);
  }
})();