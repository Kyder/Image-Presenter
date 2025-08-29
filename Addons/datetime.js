// Addons/datetime.js
// Date/Time Display Addon for Digital Signage
// This addon is completely self-contained and includes both backend and frontend code

// Addon information (required)
const info = {
  name: "Date/Time Display",
  version: "1.1.0",
  description: "Displays current date and time with customizable animations, styling, font size, and date separators",
  author: "Digital Signage Team",
  category: "Display"
};

// Addon settings definition (optional)
const settings = [
  {
    id: "enabled",
    type: "boolean",
    name: "Enable Date/Time Display",
    description: "Show date and time on the display",
    default: true
  },
  {
    id: "font",
    type: "select",
    name: "Font",
    description: "Font to use for date/time display",
    options: [
      { value: "default", label: "Default (Arial)" }
    ], // Will be populated dynamically by the addon itself
    default: "default"
  },
  {
    id: "fontSize",
    type: "range",
    name: "Font Size",
    description: "Size of the date/time text",
    min: 12,
    max: 120,
    default: 24,
    unit: "px"
  },
  {
    id: "bold",
    type: "boolean",
    name: "Bold Text",
    description: "Make the text bold",
    default: false
  },
  {
    id: "color",
    type: "color",
    name: "Text Color",
    description: "Color of the date/time text",
    default: "#FFFFFF"
  },
  {
    id: "borderColor",
    type: "color",
    name: "Border Color",
    description: "Color of the text border",
    default: "#000000"
  },
  {
    id: "borderWidth",
    type: "range",
    name: "Border Width",
    description: "Width of the text border in pixels",
    min: 0,
    max: 5,
    default: 2,
    unit: "px"
  },
  {
    id: "dateSeparator",
    type: "select",
    name: "Date Separator",
    description: "Separator character for date (day/month/year)",
    options: [
      { value: ".", label: "Dot (.)" },
      { value: "/", label: "Slash (/)" },
      { value: "-", label: "Dash (-)" },
      { value: ":", label: "Colon (:)" },
      { value: " ", label: "Space ( )" }
    ],
    default: "."
  },
  {
    id: "timeSeparator",
    type: "select",
    name: "Time Separator",
    description: "Separator character for time (hour:minute:second)",
    options: [
      { value: ":", label: "Colon (:)" },
      { value: ".", label: "Dot (.)" },
      { value: "-", label: "Dash (-)" },
      { value: " ", label: "Space ( )" }
    ],
    default: ":"
  },
  {
    id: "style",
    type: "select",
    name: "Animation Style",
    description: "How the date/time moves on screen",
    options: [
      { value: "static", label: "Static (bottom right)" },
      { value: "sliding", label: "Sliding (left to right)" },
      { value: "teleporting", label: "Teleporting (corner to corner)" },
      { value: "bouncing", label: "Bouncing (DVD screensaver style)" }
    ],
    default: "static"
  },
  {
    id: "speed",
    type: "range",
    name: "Animation Speed",
    description: "Speed of the animation (higher = faster)",
    min: 10,
    max: 200,
    default: 50
  },
  {
    id: "layout",
    type: "select",
    name: "Date/Time Layout",
    description: "How date and time are arranged",
    options: [
      { value: "inline", label: "Date and time on same line" },
      { value: "below", label: "Time below date" },
      { value: "above", label: "Time above date" }
    ],
    default: "inline"
  }
];

// Main addon class (Backend)
class DateTimeAddon {
  constructor(config = {}) {
    this.config = {
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
      layout: 'inline',
      ...config
    };
    
    this.fontsDir = null;
    this.directoryName = 'DateTimeFonts';
    this.fontDataCache = new Map(); // Cache font data as base64
    console.log('DateTimeAddon created with config:', this.config);
  }
  
  // Initialize the addon
  async init() {
    console.log('Initializing Date/Time addon with config:', this.config);
    
    if (!this.config.enabled) {
      console.log('Date/Time addon is disabled');
      return;
    }
    
    // Create this addon's specific directory if needed
    await this.ensureAddonDirectory();
    
    // Test font access for debugging (remove this line later for production)
    await this.testFontAccess();
    
    // Update font options dynamically in the settings
    await this.updateFontOptions();
    
    console.log('Date/Time addon initialized successfully');
  }
  
  // Create addon's specific directory only when this addon needs it
  async ensureAddonDirectory() {
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
        console.log(`${this.directoryName} directory already exists:`, this.fontsDir);
      } catch {
        await fs.mkdir(this.fontsDir, { recursive: true });
        console.log(`Created ${this.directoryName} directory for DateTime addon:`, this.fontsDir);
        
        const readmeContent = `DateTimeFonts Directory
======================

This directory is created by the Date/Time Display addon.
Place your custom font files here (.ttf, .otf, .woff, .woff2)

The fonts will be available for selection in the addon settings.

Supported formats:
- TrueType (.ttf)
- OpenType (.otf)
- Web Open Font Format (.woff, .woff2)

After adding fonts, click "Reload Addons" to refresh the font list.
`;
        await fs.writeFile(path.join(this.fontsDir, 'README.txt'), readmeContent);
      }
    } catch (err) {
      console.error(`Failed to create ${this.directoryName} directory:`, err);
    }
  }
  
  // Test method to check fonts directory and files
  async testFontAccess() {
    const path = require('path');
    const fs = require('fs').promises;
    
    console.log('=== Font Access Test ===');
    console.log(`Fonts directory path: ${this.fontsDir}`);
    
    try {
      // Check if directory exists
      await fs.access(this.fontsDir);
      console.log('✓ Fonts directory exists');
      
      // List all files
      const files = await fs.readdir(this.fontsDir);
      console.log('Files in directory:', files);
      
      // Filter font files
      const fontFiles = files.filter(file => 
        /\.(ttf|otf|woff|woff2)$/i.test(file) && file !== 'README.txt'
      );
      console.log('Font files found:', fontFiles);
      
      // Test reading first font file if exists
      if (fontFiles.length > 0) {
        const testFont = fontFiles[0];
        const testPath = path.join(this.fontsDir, testFont);
        console.log(`Testing access to: ${testPath}`);
        
        try {
          await fs.access(testPath);
          console.log(`✓ Can access ${testFont}`);
          
          const stats = await fs.stat(testPath);
          console.log(`File size: ${stats.size} bytes`);
          
          // Try reading first few bytes
          const handle = await fs.open(testPath, 'r');
          const buffer = Buffer.alloc(10);
          await handle.read(buffer, 0, 10, 0);
          await handle.close();
          console.log(`✓ Can read ${testFont}, first 10 bytes:`, buffer);
          
        } catch (err) {
          console.error(`✗ Cannot access ${testFont}:`, err);
        }
      } else {
        console.log('No font files found in directory');
      }
      
    } catch (err) {
      console.error('✗ Cannot access fonts directory:', err);
    }
    
    console.log('=== End Font Access Test ===');
  }
  
  // Update font options dynamically in the settings object
  async updateFontOptions() {
    try {
      const availableFonts = await this.getAvailableFonts();
      
      const fontSetting = settings.find(s => s.id === 'font');
      if (fontSetting) {
        fontSetting.options = [
          { value: 'default', label: 'Default (Arial)' },
          ...availableFonts.map(font => ({ value: font, label: font }))
        ];
        
        console.log('Updated font options:', fontSetting.options);
      }
    } catch (err) {
      console.error('Failed to update font options:', err);
    }
  }
  
  // Stop the addon
  async stop() {
    console.log('Stopping Date/Time addon');
    this.fontDataCache.clear();
  }
  
  // Update configuration
  updateConfig(newConfig) {
    console.log('Updating DateTimeAddon config:', newConfig);
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    if (oldConfig.font !== this.config.font) {
      console.log('Font changed from', oldConfig.font, 'to', this.config.font);
    }
    if (oldConfig.fontSize !== this.config.fontSize) {
      console.log('Font size changed from', oldConfig.fontSize, 'to', this.config.fontSize);
    }
    if (oldConfig.dateSeparator !== this.config.dateSeparator) {
      console.log('Date separator changed from', oldConfig.dateSeparator, 'to', this.config.dateSeparator);
    }
    if (oldConfig.timeSeparator !== this.config.timeSeparator) {
      console.log('Time separator changed from', oldConfig.timeSeparator, 'to', this.config.timeSeparator);
    }
  }
  
  // Get current configuration for frontend
  getConfig() {
    return this.config;
  }
  
  // Get available fonts from this addon's directory
  async getAvailableFonts() {
    if (!this.fontsDir) {
      await this.ensureAddonDirectory();
    }
    
    const fs = require('fs').promises;
    
    try {
      const files = await fs.readdir(this.fontsDir);
      const fontFiles = files.filter(file => 
        /\.(ttf|otf|woff|woff2)$/i.test(file) && file !== 'README.txt'
      );
      console.log('Found font files:', fontFiles);
      return fontFiles;
    } catch {
      console.log('No fonts directory or error reading fonts');
      return [];
    }
  }
  
  // Get font as base64 data URL (with debugging)
  async getFontAsDataUrl(fontName) {
    console.log(`getFontAsDataUrl called with fontName: "${fontName}"`);
    
    if (this.fontDataCache.has(fontName)) {
      console.log(`Font ${fontName} found in cache`);
      return this.fontDataCache.get(fontName);
    }
    
    const path = require('path');
    const fs = require('fs').promises;
    
    try {
      // Ensure fonts directory exists
      if (!this.fontsDir) {
        console.log('Fonts directory not set, creating...');
        await this.ensureAddonDirectory();
      }
      
      console.log(`Looking for font in directory: ${this.fontsDir}`);
      
      // Check if fonts directory exists
      try {
        await fs.access(this.fontsDir);
        console.log('Fonts directory exists');
      } catch (err) {
        console.error('Fonts directory does not exist:', this.fontsDir);
        return null;
      }
      
      const fontPath = path.join(this.fontsDir, fontName);
      console.log(`Attempting to read font from path: ${fontPath}`);
      
      // Check if specific font file exists
      try {
        await fs.access(fontPath);
        console.log(`Font file ${fontName} exists`);
      } catch (err) {
        console.error(`Font file ${fontName} does not exist at path: ${fontPath}`);
        return null;
      }
      
      // Read the font file
      const fontData = await fs.readFile(fontPath);
      console.log(`Font file read successfully, size: ${fontData.length} bytes`);
      
      const base64Data = fontData.toString('base64');
      console.log(`Font converted to base64, length: ${base64Data.length} characters`);
      
      // Determine MIME type
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
        default:
          console.warn(`Unknown font extension: ${ext}, using default MIME type`);
      }
      
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      this.fontDataCache.set(fontName, dataUrl);
      
      console.log(`Font ${fontName} cached successfully as data URL with MIME type: ${mimeType}`);
      return dataUrl;
    } catch (err) {
      console.error(`Failed to read font ${fontName}:`, err);
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        path: err.path
      });
      return null;
    }
  }
  
  // Generate frontend script
  getFrontendScript() {
    return `
      // Date/Time Display Frontend Script - Generated by DateTime Addon
      window.DateTimeAddon = {
        config: ${JSON.stringify(this.config)},
        updateInterval: null,
        teleportInterval: null,
        bounceAnimFrame: null,
        customFont: null,
        element: null,
        
        async init() {
          console.log('DateTimeAddon frontend init with config:', this.config);
          
          if (!this.config.enabled) {
            console.log('DateTimeAddon is disabled, removing display');
            this.remove();
            return;
          }
          
          await this.setup();
        },
        
        async setup() {
          console.log('Setting up DateTimeAddon display');
          
          this.element = this.createElement();
          const dateEl = this.element.querySelector('.datetime-date');
          const timeEl = this.element.querySelector('.datetime-time');
          
          this.clearIntervals();
          this.element.style.display = 'block';
          
          await this.loadFont();
          this.applyStyles();
          this.setupLayout(dateEl, timeEl);
          this.startTimeUpdate(dateEl, timeEl);
          this.applyAnimation();
          
          console.log('DateTimeAddon setup complete');
        },
        
        createElement() {
          const existing = document.getElementById('datetime-display-addon');
          if (existing) {
            existing.remove();
          }
          
          console.log('Creating datetime display element');
          const display = document.createElement('div');
          display.id = 'datetime-display-addon';
          display.className = 'datetime-addon-display';
          display.innerHTML = '<div class="datetime-date"></div><div class="datetime-time"></div>';
          
          display.style.cssText = \`
            position: absolute;
            font-family: Arial, sans-serif;
            z-index: 1000;
            user-select: none;
            white-space: nowrap;
            font-size: \${this.config.fontSize || 24}px;
            display: none;
            bottom: 10px;
            right: 10px;
            pointer-events: none;
          \`;
          
          const addonContainer = document.getElementById('addon-container');
          if (addonContainer) {
            addonContainer.appendChild(display);
          } else {
            document.body.appendChild(display);
          }
          
          return display;
        },
        
        async loadFont() {
          try {
            console.log('Loading font:', this.config.font);
            
            // If using default font
            if (!this.config.font || this.config.font === 'default' || this.config.font.trim() === '') {
              console.log('Using default font (Arial)');
              this.element.style.fontFamily = 'Arial, sans-serif';
              return;
            }
            
            // Remove old custom font if exists
            if (this.customFont) {
              try {
                document.fonts.delete(this.customFont);
                console.log('Removed old custom font');
              } catch (e) {
                console.log('Could not delete old font:', e);
              }
            }
            
            // Get font data URL from backend addon via IPC with retry
            console.log('Requesting font data from backend...');
            let fontDataUrl = null;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (!fontDataUrl && retryCount < maxRetries) {
              try {
                fontDataUrl = await this.getFontDataUrl(this.config.font);
                if (fontDataUrl) {
                  break;
                }
              } catch (err) {
                console.log(\`Font data request attempt \${retryCount + 1} failed:\`, err);
              }
              
              retryCount++;
              if (retryCount < maxRetries) {
                console.log(\`Retrying font data request in 500ms (attempt \${retryCount + 1}/\${maxRetries})...\`);
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
            
            if (!fontDataUrl) {
              throw new Error(\`Could not get font data from backend after \${maxRetries} attempts\`);
            }
            
            // Load custom font using data URL
            const fontFamilyName = 'CustomDateTimeFont_' + this.config.font.replace(/[^a-zA-Z0-9]/g, '') + '_' + Date.now();
            
            console.log('Loading custom font using data URL...');
            
            this.customFont = new FontFace(fontFamilyName, \`url("\${fontDataUrl}")\`);
            await this.customFont.load();
            document.fonts.add(this.customFont);
            
            this.element.style.fontFamily = \`\${fontFamilyName}, Arial, sans-serif\`;
            
            console.log('Custom font loaded successfully:', fontFamilyName);
          } catch (err) {
            console.error('Failed to load custom font:', err);
            console.log('Falling back to default font');
            this.element.style.fontFamily = 'Arial, sans-serif';
          }
        },
        
        // Get font data URL from backend via IPC with better error handling
        async getFontDataUrl(fontName) {
          try {
            // Check if API is available
            if (!window.electronAPI) {
              throw new Error('electronAPI not available');
            }
            
            if (!window.electronAPI.getAddonFontData) {
              throw new Error('getAddonFontData method not available');
            }
            
            console.log(\`Requesting font data for: \${fontName}\`);
            const result = await window.electronAPI.getAddonFontData('datetime', fontName);
            
            if (!result) {
              throw new Error('Backend returned null/undefined for font data');
            }
            
            console.log('Font data received successfully');
            return result;
          } catch (err) {
            console.error('Failed to get font data from backend:', err);
            throw err;
          }
        },
        
        applyStyles() {
          console.log('Applying styles with config:', this.config);
          
          this.element.style.color = this.config.color || '#FFFFFF';
          this.element.style.fontWeight = this.config.bold ? 'bold' : 'normal';
          this.element.style.fontSize = \`\${this.config.fontSize || 24}px\`;
          
          if (this.config.borderWidth > 0) {
            const shadow = [];
            const bw = this.config.borderWidth;
            const bc = this.config.borderColor || '#000000';
            
            for (let x = -bw; x <= bw; x++) {
              for (let y = -bw; y <= bw; y++) {
                if (x !== 0 || y !== 0) {
                  shadow.push(\`\${x}px \${y}px 0 \${bc}\`);
                }
              }
            }
            this.element.style.textShadow = shadow.join(', ');
          } else {
            this.element.style.textShadow = 'none';
          }
        },
        
        setupLayout(dateEl, timeEl) {
          if (this.config.layout === 'inline') {
            dateEl.style.display = 'inline';
            timeEl.style.display = 'inline';
            timeEl.style.marginLeft = '20px';
            timeEl.style.marginTop = '0';
            dateEl.style.marginTop = '0';
          } else if (this.config.layout === 'above') {
            dateEl.style.display = 'block';
            timeEl.style.display = 'block';
            timeEl.style.marginLeft = '0';
            timeEl.style.marginTop = '0';
            dateEl.style.marginTop = '10px';
            this.element.insertBefore(timeEl, dateEl);
          } else if (this.config.layout === 'below') {
            dateEl.style.display = 'block';
            timeEl.style.display = 'block';
            timeEl.style.marginLeft = '0';
            dateEl.style.marginTop = '0';
            timeEl.style.marginTop = '10px';
            this.element.insertBefore(dateEl, timeEl);
          }
        },
        
        startTimeUpdate(dateEl, timeEl) {
          const updateDateTime = () => {
            const now = new Date();
            
            // Format date with custom separator
            const dateOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
            let dateString = now.toLocaleDateString('en-GB', dateOptions);
            
            // Replace default separators with configured separator
            const dateSep = this.config.dateSeparator || '.';
            dateString = dateString.replace(/[\\/.-]/g, dateSep);
            
            // Format time with custom separator
            const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
            let timeString = now.toLocaleTimeString('en-GB', timeOptions);
            
            // Replace default separators with configured separator
            const timeSep = this.config.timeSeparator || ':';
            timeString = timeString.replace(/[:.-]/g, timeSep);
            
            dateEl.textContent = dateString;
            timeEl.textContent = timeString;
          };
          
          updateDateTime();
          this.updateInterval = setInterval(updateDateTime, 1000);
          console.log('DateTime update interval started');
        },
        
        applyAnimation() {
          this.element.style.animation = 'none';
          this.element.classList.remove('sliding', 'bouncing');
          
          this.element.style.left = 'auto';
          this.element.style.top = 'auto';
          this.element.style.right = '10px';
          this.element.style.bottom = '10px';
          this.element.style.transform = 'none';
          
          const style = this.config.style || 'static';
          console.log('Applying animation style:', style);
          
          if (style === 'sliding') {
            this.startSliding();
          } else if (style === 'bouncing') {
            this.startBouncing();
          } else if (style === 'teleporting') {
            this.startTeleporting();
          } else {
            this.element.style.position = 'absolute';
            this.element.style.bottom = '10px';
            this.element.style.right = '10px';
            this.element.style.left = 'auto';
            this.element.style.top = 'auto';
          }
        },
        
        startSliding() {
          this.element.style.position = 'absolute';
          this.element.style.top = '20px';
          this.element.style.bottom = 'auto';
          this.element.style.right = 'auto';
          
          const duration = (window.innerWidth + 400) / (this.config.speed || 50);
          this.element.style.animation = \`datetime-slide \${duration}s linear infinite\`;
          
          if (!document.getElementById('datetime-slide-keyframes')) {
            const style = document.createElement('style');
            style.id = 'datetime-slide-keyframes';
            style.textContent = \`
              @keyframes datetime-slide {
                from { transform: translateX(100vw); }
                to { transform: translateX(-100%); }
              }
            \`;
            document.head.appendChild(style);
          }
        },
        
        startBouncing() {
          let x = 50;
          let y = 50;
          let dx = (this.config.speed || 50) / 60;
          let dy = (this.config.speed || 50) / 60;
          
          this.element.style.position = 'absolute';
          
          const animate = () => {
            const rect = this.element.getBoundingClientRect();
            const containerRect = document.body.getBoundingClientRect();
            
            x += dx;
            y += dy;
            
            if (x <= 0 || x + rect.width >= containerRect.width) {
              dx = -dx;
              x = Math.max(0, Math.min(x, containerRect.width - rect.width));
            }
            if (y <= 0 || y + rect.height >= containerRect.height) {
              dy = -dy;
              y = Math.max(0, Math.min(y, containerRect.height - rect.height));
            }
            
            this.element.style.left = \`\${x}px\`;
            this.element.style.top = \`\${y}px\`;
            this.element.style.right = 'auto';
            this.element.style.bottom = 'auto';
            this.element.style.transform = 'none';
            
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
            this.element.style.top = pos.top;
            this.element.style.bottom = pos.bottom;
            this.element.style.left = pos.left;
            this.element.style.right = pos.right;
            this.element.style.transform = 'none';
          };
          
          teleport();
          this.teleportInterval = setInterval(teleport, (this.config.speed || 5) * 1000);
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
          console.log('Removing DateTimeAddon display');
          this.clearIntervals();
          if (this.element) {
            this.element.remove();
            this.element = null;
          }
          
          const keyframes = document.getElementById('datetime-slide-keyframes');
          if (keyframes) {
            keyframes.remove();
          }
          
          if (this.customFont) {
            try {
              document.fonts.delete(this.customFont);
            } catch (e) {
              console.log('Could not delete custom font:', e);
            }
          }
        },
        
        cleanup() {
          this.remove();
        },
        
        updateConfig(newConfig) {
          console.log('Frontend received config update:', newConfig);
          this.config = { ...this.config, ...newConfig };
          this.init();
        }
      };
      
      console.log('Initializing DateTimeAddon frontend script');
      window.DateTimeAddon.init();
    `;
  }
}

// Export addon components
module.exports = {
  info,
  settings,
  Addon: DateTimeAddon
};