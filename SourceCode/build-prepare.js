const fs = require('fs');
const path = require('path');

// Create dist folder if it doesn't exist
if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
}

// Create Media folder if it doesn't exist
if (!fs.existsSync('Media')) {
    fs.mkdirSync('Media');
    console.log('Created Media folder');
}

// Create Addons folder if it doesn't exist
if (!fs.existsSync('Addons')) {
    fs.mkdirSync('Addons');
    console.log('Created Addons folder');
}

// Create Fonts folder if it doesn't exist
if (!fs.existsSync('Fonts')) {
    fs.mkdirSync('Fonts');
    console.log('Created Fonts folder');
}

// Create example datetime addon folder structure
const datetimeAddonDir = path.join('Addons', 'datetime');
if (!fs.existsSync(datetimeAddonDir)) {
    fs.mkdirSync(datetimeAddonDir, { recursive: true });
    console.log('Created Addons/datetime folder');
}

// Files to copy
const files = ['index.html', 'mainapp.css', 'image-scaling.js'];

// Copy each file
files.forEach(file => {
    const src = path.join(__dirname, file);
    const dest = path.join(__dirname, 'dist', file);
    
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`Copied ${file} to dist/`);
    } else {
        console.warn(`Warning: ${file} not found`);
    }
});

console.log('Build preparation complete!');