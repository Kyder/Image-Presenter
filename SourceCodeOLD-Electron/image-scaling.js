// image-scaling.js
// Dedicated image scaling logic for digital signage

class ImageScaler {
    constructor() {
        this.currentScalingMode = 'contain'; // Default mode
        this.debugMode = false; // Disable debug logging
    }

    log(message, ...args) {
        if (this.debugMode) {
            console.log(`[ImageScaler] ${message}`, ...args);
        }
    }

    // Set the scaling mode for future elements
    setScalingMode(mode) {
        const validModes = ['contain', 'fill', 'cover'];
        if (!validModes.includes(mode)) {
            mode = 'contain';
        }
        
        this.currentScalingMode = mode;
    }

    // Apply scaling to a media element
    applyScaling(element, scalingMode = null) {
        const mode = scalingMode || this.currentScalingMode;
        
        // Remove all existing scaling classes
        element.classList.remove('scaling-contain', 'scaling-fill', 'scaling-cover');
        
        // Add the appropriate scaling class
        element.classList.add(`scaling-${mode}`);
        
        // Apply styles directly via JavaScript to bypass CSS conflicts
        if (element.tagName === 'IMG') {
            switch (mode) {
                case 'contain':
                    // Do not resize - fit within screen maintaining aspect ratio
                    element.style.maxWidth = '100%';
                    element.style.maxHeight = '100%';
                    element.style.width = 'auto';
                    element.style.height = 'auto';
                    element.style.objectFit = 'contain';
                    break;
                    
                case 'fill':
                    // Stretch to fill whole screen
                    element.style.width = '100%';
                    element.style.height = '100%';
                    element.style.maxWidth = 'none';
                    element.style.maxHeight = 'none';
                    element.style.objectFit = 'fill';
                    break;
                    
                case 'cover':
                    // Zoom and crop to fill whole screen
                    element.style.width = '100%';
                    element.style.height = '100%';
                    element.style.maxWidth = 'none';
                    element.style.maxHeight = 'none';
                    element.style.objectFit = 'cover';
                    break;
            }
        } else if (element.tagName === 'VIDEO') {
            // Apply same logic to videos
            switch (mode) {
                case 'contain':
                    element.style.objectFit = 'contain';
                    break;
                case 'fill':
                    element.style.objectFit = 'fill';
                    break;
                case 'cover':
                    element.style.objectFit = 'cover';
                    break;
            }
        }
    }

    // Update scaling on existing active media
    updateActiveMedia(newMode = null) {
        const activeElement = document.querySelector('.media-item.active');
        if (activeElement) {
            this.applyScaling(activeElement, newMode);
        }
    }

    // Get current scaling mode
    getCurrentMode() {
        return this.currentScalingMode;
    }

    // Enable debug mode (for troubleshooting)
    enableDebug() {
        this.debugMode = true;
    }

    // Disable debug mode
    disableDebug() {
        this.debugMode = false;
    }
}

// Create global instance
window.imageScaler = new ImageScaler();

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageScaler;
}