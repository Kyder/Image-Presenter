// Addons/datetime.js
// Date/Time Display Addon for Digital Signage
// This addon is completely self-contained and includes both backend and frontend code

// Addon information (required)
const info = {
  name: "Date/Time Display",
  version: "1.1.1",
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
    
    // Set up fonts directory path
    this.setupFontsDirectory();
    
    // Ensure the shared fonts directory exists
    await this.ensureFontsDirectory();
    
    // Update font options dynamically in the settings
    await this.updateFontOptions();
    
    console.log('Date/Time addon initialized successfully');
  }
  
  // Set up the correct path to the shared Fonts directory
  setupFontsDirectory() {
    const path = require('path');
    const { app } = require('electron');
    
    // Get the app directory (same logic as main.js)
    const appDir = app.isPackaged 
      ? path.dirname(process.execPath)  // Production: directory of the executable
      : path.dirname(__dirname);        // Development: parent of Addons directory
    
    // Use the shared Fonts directory (same as main app)
    this.fontsDir = path.join(appDir, 'Fonts');
    
    console.log('Fonts directory set to:', this.fontsDir);
  }
  
  // Ensure the shared Fonts directory exists
  async ensureFontsDirectory() {
    const fs = require('fs').promises;
    
    try {
      await fs.access(this.fontsDir);
      console.log('Fonts directory exists:', this.fontsDir);
    } catch {
      try {
        await fs.mkdir(this.fontsDir, { recursive: true });
        console.log('Created Fonts directory:', this.fontsDir);
        
        // Create a README file
        const readmeContent = `Fonts Directory
================

This directory is for custom font files that can be used by addons.
Place your custom font files here (.ttf, .otf, .woff, .woff2)

The fonts will be available for selection in addon settings.

Supported formats:
- TrueType (.ttf)
- OpenType (.otf)
- Web Open Font Format (.woff, .woff2)

After adding fonts, click "Reload Addons" in the web interface to refresh the font list.
`;
        await fs.writeFile(path.join(this.fontsDir, 'README.txt'), readmeContent);
      } catch (err) {
        console.error('Failed to create Fonts directory:', err);
      }
    }
  }
  
  // Update font options dynamically in the settings object
  async updateFontOptions() {
    try {
      const availableFonts = await this.getAvailableFonts();
      
      const fontSetting = settings.find(s => s.id === 'font');
      if (fontSetting) {
        fontSetting.options = [
          { value: 'default', label: 'Default (Arial)' },
          ...availableFonts.map(font => ({ 
            value: font, 
            label: font.replace(/\.(ttf|otf|woff2?)$/i, '') // Remove extension for cleaner display
          }))
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
  
  // Get available fonts from the shared Fonts directory
  async getAvailableFonts() {
    const fs = require('fs').promises;
    
    try {
      if (!this.fontsDir) {
        this.setupFontsDirectory();
      }
      
      const files = await fs.readdir(this.fontsDir);
      const fontFiles = files.filter(file => 
        /\.(ttf|otf|woff|woff2)$/i.test(file) && 
        !file.startsWith('.') && 
        file !== 'README.txt'
      );
      
      console.log('Found font files in', this.fontsDir, ':', fontFiles);
      return fontFiles;
    } catch (err) {
      console.log('Error reading fonts directory:', err.message);
      return [];
    }
  }
  
  // Get font as base64 data URL (with improved error handling)
  async getFontAsDataUrl(fontName) {
    console.log(`getFontAsDataUrl called with fontName: "${fontName}"`);
    
    // Check cache first
    if (this.fontDataCache.has(fontName)) {
      console.log(`Font ${fontName} found in cache`);
      return this.fontDataCache.get(fontName);
    }
    
    const path = require('path');
    const fs = require('fs').promises;
    
    try {
      // Ensure fonts directory is set up
      if (!this.fontsDir) {
        this.setupFontsDirectory();
      }
      
      console.log(`Looking for font in directory: ${this.fontsDir}`);
      
      // Verify fonts directory exists
      try {
        await fs.access(this.fontsDir);
      } catch (err) {
        console.error('Fonts directory does not exist:', this.fontsDir);
        await this.ensureFontsDirectory(); // Try to create it
        return null;
      }
      
      const fontPath = path.join(this.fontsDir, fontName);
      console.log(`Attempting to read font from path: ${fontPath}`);
      
      // Check if specific font file exists
      try {
        const stats = await fs.stat(fontPath);
        console.log(`Font file ${fontName} exists, size: ${stats.size} bytes`);
      } catch (err) {
        console.error(`Font file ${fontName} does not exist at path: ${fontPath}`);
        
        // List available files for debugging
        try {
          const availableFiles = await fs.readdir(this.fontsDir);
          console.log('Available files in fonts directory:', availableFiles);
        } catch (listErr) {
          console.error('Could not list files in fonts directory:', listErr.message);
        }
        
        return null;
      }
      
      // Read the font file
      const fontData = await fs.readFile(fontPath);
      console.log(`Font file read successfully, size: ${fontData.length} bytes`);
      
      // Convert to base64
      const base64Data = fontData.toString('base64');
      console.log(`Font converted to base64, length: ${base64Data.length} characters`);
      
      // Determine MIME type based on file extension
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
          mimeType = 'font/truetype'; // Default fallback
      }
      
      // Create data URL
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      
      // Cache the result
      this.fontDataCache.set(fontName, dataUrl);
      
      console.log(`Font ${fontName} cached successfully as data URL with MIME type: ${mimeType}`);
      return dataUrl;
      
    } catch (err) {
      console.error(`Failed to read font ${fontName}:`, err);
      console.error('Error details:', {
        message: err.message,
        code: err.code,
        path: err.path,
        stack: err.stack
      });
      return null;
    }
  }
  
  // Generate frontend script
  getFrontendScript() {
    return `
      // Date/Time Display Frontend Script - Generated by DateTime Addon
      window.dateTimeAddon = {
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
                console.log('Could not delete old font:', e.message);
              }
            }
            
            // Get font data URL from backend addon via IPC
            console.log('Requesting font data from backend...');
            const fontDataUrl = await this.getFontDataUrl(this.config.font);
            
            if (!fontDataUrl) {
              throw new Error('Could not get font data from backend');
            }
            
            // Create unique font family name
            const fontFamilyName = 'CustomDateTimeFont_' + 
              this.config.font.replace(/[^a-zA-Z0-9]/g, '') + 
              '_' + Date.now();
            
            console.log('Loading custom font with family name:', fontFamilyName);
            
            // Load custom font using FontFace API
            this.customFont = new FontFace(fontFamilyName, \`url("\${fontDataUrl}")\`);
            
            // Wait for font to load
            await this.customFont.load();
            
            // Add font to document
            document.fonts.add(this.customFont);
            
            // Apply the font
            this.element.style.fontFamily = \`"\${fontFamilyName}", Arial, sans-serif\`;
            
            console.log('Custom font loaded and applied successfully:', fontFamilyName);
            
          } catch (err) {
            console.error('Failed to load custom font:', err);
            console.log('Falling back to default font (Arial)');
            this.element.style.fontFamily = 'Arial, sans-serif';
          }
        },
        
        // Get font data URL from backend via IPC
        async getFontDataUrl(fontName) {
          try {
            // Check if API is available
            if (!window.electronAPI || !window.electronAPI.getAddonFontData) {
              throw new Error('electronAPI.getAddonFontData not available');
            }
            
            console.log(\`Requesting font data for: \${fontName}\`);
            const result = await window.electronAPI.getAddonFontData('datetime', fontName);
            
            if (!result) {
              throw new Error('Backend returned null/undefined for font data');
            }
            
            console.log('Font data received successfully from backend');
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
          
          // Apply text border/shadow
          if (this.config.borderWidth > 0) {
            const shadows = [];
            const bw = this.config.borderWidth;
            const bc = this.config.borderColor || '#000000';
            
            // Create text shadow in all directions for border effect
            for (let x = -bw; x <= bw; x++) {
              for (let y = -bw; y <= bw; y++) {
                if (x !== 0 || y !== 0) {
                  shadows.push(\`\${x}px \${y}px 0 \${bc}\`);
                }
              }
            }
            this.element.style.textShadow = shadows.join(', ');
          } else {
            this.element.style.textShadow = 'none';
          }
        },
        
        setupLayout(dateEl, timeEl) {
          // Reset styles
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
            // Time above date
            this.element.innerHTML = '';
            this.element.appendChild(timeEl);
            this.element.appendChild(dateEl);
            dateEl.style.marginTop = '5px';
          } else if (this.config.layout === 'below') {
            // Time below date (default order)
            this.element.innerHTML = '';
            this.element.appendChild(dateEl);
            this.element.appendChild(timeEl);
            timeEl.style.marginTop = '5px';
          }
        },
        
        startTimeUpdate(dateEl, timeEl) {
          const updateDateTime = () => {
            const now = new Date();
            
            // Format date with custom separator
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            const dateSep = this.config.dateSeparator || '.';
            const dateString = \`\${day}\${dateSep}\${month}\${dateSep}\${year}\`;
            
            // Format time with custom separator
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const timeSep = this.config.timeSeparator || ':';
            const timeString = \`\${hours}\${timeSep}\${minutes}\${timeSep}\${seconds}\`;
            
            dateEl.textContent = dateString;
            timeEl.textContent = timeString;
          };
          
          updateDateTime();
          this.updateInterval = setInterval(updateDateTime, 1000);
          console.log('DateTime update interval started');
        },
        
        applyAnimation() {
          // Clear any existing animations
          this.element.style.animation = 'none';
          this.element.classList.remove('sliding', 'bouncing');
          
          // Reset position
          this.element.style.left = 'auto';
          this.element.style.top = 'auto';
          this.element.style.right = '10px';
          this.element.style.bottom = '10px';
          this.element.style.transform = 'none';
          this.element.style.position = 'absolute';
          
          const style = this.config.style || 'static';
          console.log('Applying animation style:', style);
          
          if (style === 'sliding') {
            this.startSliding();
          } else if (style === 'bouncing') {
            this.startBouncing();
          } else if (style === 'teleporting') {
            this.startTeleporting();
          }
          // static style needs no additional setup
        },
        
        startSliding() {
          this.element.style.top = '20px';
          this.element.style.bottom = 'auto';
          this.element.style.right = 'auto';
          this.element.style.left = '100vw';
          
          const duration = Math.max(5, (window.innerWidth + 400) / (this.config.speed || 50));
          this.element.style.animation = \`datetime-slide \${duration}s linear infinite\`;
          
          // Add keyframes if not already present
          if (!document.getElementById('datetime-slide-keyframes')) {
            const style = document.createElement('style');
            style.id = 'datetime-slide-keyframes';
            style.textContent = \`
              @keyframes datetime-slide {
                from { 
                  left: 100vw;
                  transform: translateX(0);
                }
                to { 
                  left: -100%;
                  transform: translateX(-100%);
                }
              }
            \`;
            document.head.appendChild(style);
          }
        },
        
        startBouncing() {
          let x = Math.random() * (window.innerWidth - 200);
          let y = Math.random() * (window.innerHeight - 100);
          let dx = (this.config.speed || 50) / 30; // Reduced speed divisor for smoother animation
          let dy = (this.config.speed || 50) / 30;
          
          // Ensure minimum speed
          if (Math.abs(dx) < 1) dx = dx < 0 ? -1 : 1;
          if (Math.abs(dy) < 1) dy = dy < 0 ? -1 : 1;
          
          const animate = () => {
            const rect = this.element.getBoundingClientRect();
            
            x += dx;
            y += dy;
            
            // Bounce off walls
            if (x <= 0 || x + rect.width >= window.innerWidth) {
              dx = -dx;
              x = Math.max(0, Math.min(x, window.innerWidth - rect.width));
            }
            if (y <= 0 || y + rect.height >= window.innerHeight) {
              dy = -dy;
              y = Math.max(0, Math.min(y, window.innerHeight - rect.height));
            }
            
            this.element.style.left = \`\${x}px\`;
            this.element.style.top = \`\${y}px\`;
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
          
          teleport(); // Initial teleport
          
          // Calculate interval based on speed (inverse relationship)
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
          console.log('Removing DateTimeAddon display');
          this.clearIntervals();
          
          if (this.element) {
            this.element.remove();
            this.element = null;
          }
          
          // Remove keyframes
          const keyframes = document.getElementById('datetime-slide-keyframes');
          if (keyframes) {
            keyframes.remove();
          }
          
          // Remove custom font
          if (this.customFont) {
            try {
              document.fonts.delete(this.customFont);
              this.customFont = null;
            } catch (e) {
              console.log('Could not delete custom font:', e.message);
            }
          }
        },
        
        cleanup() {
          this.remove();
        },
        
        updateConfig(newConfig) {
          console.log('Frontend received config update:', newConfig);
          this.config = { ...this.config, ...newConfig };
          this.init(); // Restart with new config
        }
      };
      
      // Initialize the addon
      console.log('Initializing DateTimeAddon frontend script');
      window.dateTimeAddon.init();
    `;
  }
}

// Export addon components
module.exports = {
  info,
  settings,
  Addon: DateTimeAddon
};
