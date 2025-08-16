// Global variables
let currentDevice = 'current';
let currentDeviceUrl = '';
let editingDeviceId = null;
let selectedDevices = new Set(['current']);
let authPassword = '';
let config = {};
let peers = [];
let addons = {};

// Helper function to make API calls to the correct device
function getApiUrl(endpoint) {
    return currentDeviceUrl + endpoint;
}

// Initialize
async function init() {
    await loadConfig();
    await loadPeers();
    setupEventListeners();
    updateDevicePanel();
    
    // Load initial tab content
    await loadTabContent('display');
}

// Load tab content dynamically
async function loadTabContent(tabName) {
    const tabContent = document.getElementById(`${tabName}-tab`);
    
    try {
        const response = await fetch(`tabs/${tabName}.html`);
        const html = await response.text();
        tabContent.innerHTML = html;
        
        // Initialize tab-specific functionality
        switch (tabName) {
            case 'display':
                initDisplayTab();
                break;
            case 'media':
                await initMediaTab();
                break;
            case 'addons':
                await initAddonsTab();
                break;
            case 'network':
                initNetworkTab();
                break;
            case 'update':
                initUpdateTab();
                break;
        }
    } catch (err) {
        console.error(`Failed to load ${tabName} tab:`, err);
        tabContent.innerHTML = `<h2>${tabName.charAt(0).toUpperCase() + tabName.slice(1)}</h2><p>Failed to load content.</p>`;
    }
}

// Tab initialization functions
function initDisplayTab() {
    // Set current values
    document.getElementById('rotation').value = config.rotation || 0;
    document.getElementById('image-duration').value = config.imageDuration / 1000;
    document.getElementById('duration-value').textContent = `${config.imageDuration / 1000} seconds`;
    document.getElementById('video-position').value = config.videoPosition;
    
    // Add event listeners
    document.getElementById('image-duration').addEventListener('input', (e) => {
        document.getElementById('duration-value').textContent = `${e.target.value} seconds`;
    });
    
    document.getElementById('save-display').addEventListener('click', saveDisplaySettings);
    
    updateDisplaySettingsUI();
}

async function initMediaTab() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
    
    await loadMediaList();
}

async function initAddonsTab() {
    document.getElementById('reload-addons').addEventListener('click', reloadAddons);
    document.getElementById('open-addons-folder').addEventListener('click', openAddonsFolder);
    
    await loadAddonsList();
}

function initNetworkTab() {
    // Set current values
    document.getElementById('device-name').value = config.displayName || '';
    document.getElementById('static-ip').value = config.staticIp || '';
    document.getElementById('localhost-only').checked = config.localhostOnly || false;
    document.getElementById('app-port').value = config.port || 3000;
    document.getElementById('ws-port').value = config.wsPort || 3001;
    document.getElementById('discovery-port').value = config.discoveryPort || 3002;
    
    // Add event listeners
    document.getElementById('save-network').addEventListener('click', saveNetworkSettings);
    document.getElementById('add-device').addEventListener('click', addDevice);
    
    updatePeerList();
}

function initUpdateTab() {
    document.getElementById('upload-update').addEventListener('click', uploadUpdate);
}

// Device panel functions
function updateDevicePanel() {
    const deviceList = document.getElementById('device-list');
    deviceList.innerHTML = '';
    
    // Add current device
    const currentItem = createDeviceElement({
        id: 'current',
        name: 'Current Device',
        ip: config.staticIp || 'localhost',
        port: config.port,
        online: true,
        isCurrent: true
    });
    deviceList.appendChild(currentItem);
    
    // Add peer devices
    peers.forEach(peer => {
        const item = createDeviceElement(peer);
        deviceList.appendChild(item);
    });
    
    updateSelectedCount();
    updateDisplaySettingsUI();
}

function createDeviceElement(device) {
    const item = document.createElement('div');
    item.className = 'device-item';
    if (!device.online && !device.isCurrent) {
        item.className += ' offline';
    }
    if (selectedDevices.has(device.id)) {
        item.className += ' selected';
    }
    if (editingDeviceId === device.id) {
        item.className += ' editing';
    }
    
    item.innerHTML = `
        <input type="checkbox" 
               class="device-checkbox" 
               data-device-id="${device.id}" 
               ${selectedDevices.has(device.id) ? 'checked' : ''}
               ${!device.online && !device.isCurrent ? 'disabled' : ''}>
        <div class="device-info" data-device-id="${device.id}">
            <div class="device-name">
                ${device.name}
                <span class="device-status ${device.online || device.isCurrent ? 'online' : ''}"></span>
                <span class="device-edit-icon">✏️ Editing</span>
            </div>
            <div class="device-ip">${device.ip}:${device.port}</div>
        </div>
    `;
    
    return item;
}

function updateSelectedCount() {
    const count = selectedDevices.size;
    document.getElementById('selected-count').textContent = 
        `${count} device${count !== 1 ? 's' : ''} selected`;
}

function updateDisplaySettingsUI() {
    const saveButton = document.getElementById('save-display');
    if (!saveButton) return; // Not loaded yet
    
    const isEditing = editingDeviceId !== null;
    const selectedCount = selectedDevices.size;
    
    if (isEditing) {
        saveButton.textContent = `Save to ${getDeviceName(editingDeviceId)} Only`;
        saveButton.className = 'btn-success btn-editing';
        saveButton.disabled = false;
    } else if (selectedCount === 1) {
        const deviceId = Array.from(selectedDevices)[0];
        saveButton.textContent = `Save to ${getDeviceName(deviceId)}`;
        saveButton.className = 'btn-success';
        saveButton.disabled = false;
    } else if (selectedCount > 1) {
        saveButton.textContent = `Save to ${selectedCount} Selected Devices`;
        saveButton.className = 'btn-success btn-multi-device';
        saveButton.disabled = false;
    } else {
        saveButton.textContent = 'Save Display Settings';
        saveButton.className = 'btn-success';
        saveButton.disabled = true;
    }
    
    // Add info text
    let infoText = document.getElementById('display-settings-info');
    if (!infoText) {
        infoText = document.createElement('div');
        infoText.id = 'display-settings-info';
        saveButton.parentNode.insertBefore(infoText, saveButton.nextSibling);
    }
    
    if (isEditing) {
        infoText.textContent = `You are editing ${getDeviceName(editingDeviceId)}. Settings will only be saved to this device.`;
        infoText.className = 'editing';
    } else if (selectedCount > 1) {
        infoText.textContent = `Settings will be applied to all ${selectedCount} selected devices.`;
        infoText.className = 'multi-device';
    } else if (selectedCount === 1) {
        const deviceId = Array.from(selectedDevices)[0];
        infoText.textContent = `Settings will be saved to ${getDeviceName(deviceId)}.`;
        infoText.className = 'multi-device';
    } else {
        infoText.textContent = 'Please select at least one device to save settings.';
        infoText.className = 'no-selection';
    }
}

function getDeviceName(deviceId) {
    if (deviceId === 'current') {
        return 'Current Device';
    }
    const peer = peers.find(p => p.id === deviceId);
    return peer ? peer.name : 'Unknown Device';
}

// Configuration functions
async function loadConfig() {
    try {
        const response = await fetch(getApiUrl('/api/config'));
        config = await response.json();
        
        // Update version display
        if (config.version) {
            document.getElementById('version-display').textContent = `Version: ${config.version}`;
        }
        
        if (config.hasPassword && !authPassword) {
            showAuthModal();
        }
    } catch (err) {
        showMessage('Failed to load configuration', 'error');
    }
}

async function loadPeers() {
    try {
        const response = await fetch('/api/peers');
        peers = await response.json();
        updateDevicePanel();
    } catch (err) {
        console.error('Failed to load peers:', err);
    }
}

async function loadAddonsList() {
    try {
        const response = await fetch('/api/addons');
        addons = await response.json();
        updateAddonsList();
    } catch (err) {
        console.error('Failed to load addons:', err);
        showMessage('Failed to load addons', 'error');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
            
            // Load tab content
            await loadTabContent(tab.dataset.tab);
        });
    });
    
    // Device panel events
    document.getElementById('select-all-devices').addEventListener('click', () => {
        selectedDevices.clear();
        selectedDevices.add('current');
        peers.forEach(peer => {
            if (peer.online) {
                selectedDevices.add(peer.id);
            }
        });
        updateDevicePanel();
    });
    
    document.getElementById('select-none-devices').addEventListener('click', () => {
        selectedDevices.clear();
        updateDevicePanel();
    });
    
    document.getElementById('refresh-devices').addEventListener('click', () => {
        loadPeers();
    });
    
    // Device selection and editing
    document.addEventListener('click', async (e) => {
        // Handle checkbox clicks
        if (e.target.classList.contains('device-checkbox')) {
            const deviceId = e.target.dataset.deviceId;
            if (e.target.checked) {
                selectedDevices.add(deviceId);
            } else {
                selectedDevices.delete(deviceId);
            }
            updateSelectedCount();
            updateDisplaySettingsUI();
        }
        
        // Handle device info clicks for editing
        if (e.target.closest('.device-info')) {
            const deviceId = e.target.closest('.device-info').dataset.deviceId;
            
            // Toggle editing mode
            if (editingDeviceId === deviceId) {
                editingDeviceId = null;
                currentDeviceUrl = '';
            } else {
                editingDeviceId = deviceId;
                
                // Set the URL for the device we're editing
                if (deviceId === 'current') {
                    currentDeviceUrl = '';
                } else {
                    const peer = peers.find(p => p.id === deviceId);
                    if (peer) {
                        currentDeviceUrl = `http://${peer.ip}:${peer.port}`;
                    }
                }
                
                // Reload current tab content for the selected device
                const activeTab = document.querySelector('.tab.active');
                if (activeTab) {
                    await loadTabContent(activeTab.dataset.tab);
                }
            }
            
            updateDevicePanel();
        }
    });
    
    // Auth modal
    document.getElementById('auth-submit').addEventListener('click', submitAuth);
    document.getElementById('auth-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitAuth();
    });
}

// Save functions
async function saveDisplaySettings() {
    const data = {
        rotation: parseInt(document.getElementById('rotation').value),
        imageDuration: parseInt(document.getElementById('image-duration').value) * 1000,
        videoPosition: document.getElementById('video-position').value,
        password: authPassword
    };
    
    await saveToDevices('/api/config', data, 'Display settings');
}

async function saveNetworkSettings() {
    const data = {
        displayName: document.getElementById('device-name').value,
        staticIp: document.getElementById('static-ip').value,
        localhostOnly: document.getElementById('localhost-only').checked,
        port: parseInt(document.getElementById('app-port').value) || 3000,
        wsPort: parseInt(document.getElementById('ws-port').value) || 3001,
        discoveryPort: parseInt(document.getElementById('discovery-port').value) || 3002,
        password: authPassword
    };
    
    try {
        const response = await fetch(getApiUrl('/api/config'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            // Handle password change
            const newPassword = document.getElementById('password').value;
            if (newPassword !== '') {
                await fetch(getApiUrl('/api/password'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: authPassword, newPassword })
                });
                authPassword = newPassword;
            }
            
            showMessage('Network settings saved successfully. Restart the app to apply port changes.', 'success');
            await loadConfig();
        } else {
            throw new Error('Failed to save settings');
        }
    } catch (err) {
        showMessage('Failed to save network settings', 'error');
    }
}

async function reloadAddons() {
    try {
        const response = await fetch('/api/addons/reload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: authPassword })
        });
        
        if (response.ok) {
            showMessage('Addons reloaded successfully', 'success');
            await loadAddonsList();
        } else {
            throw new Error('Failed to reload addons');
        }
    } catch (err) {
        showMessage('Failed to reload addons', 'error');
        console.error('Addon reload error:', err);
    }
}

function openAddonsFolder() {
    showMessage('Addons folder: [App Directory]/Addons', 'success');
}

// Network functions (called from network tab)
function updatePeerList() {
    const peerList = document.getElementById('peer-list');
    peerList.innerHTML = '';
    
    peers.forEach(peer => {
        const item = document.createElement('div');
        item.className = 'peer-item';
        item.innerHTML = `
            <div class="peer-info">
                <div class="peer-name">${peer.name}</div>
                <div class="peer-ip">${peer.ip}:${peer.port}</div>
            </div>
            <div class="peer-actions">
                <span class="peer-status ${peer.online ? 'online' : ''}" title="${peer.online ? 'Online' : 'Offline'}"></span>
                ${peer.manual ? `<button class="btn-danger btn-small" onclick="deletePeer('${peer.id}')">Delete</button>` : ''}
            </div>
        `;
        peerList.appendChild(item);
    });
}

async function addDevice() {
    const ip = document.getElementById('manual-ip').value;
    const port = document.getElementById('manual-port').value || '3000';
    const name = document.getElementById('manual-name').value;
    
    if (!ip || !name) {
        showMessage('Please enter IP address and device name', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/peers/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip, port: parseInt(port), name, password: authPassword })
        });
        
        if (response.ok) {
            showMessage('Device added successfully', 'success');
            document.getElementById('manual-ip').value = '';
            document.getElementById('manual-port').value = '3000';
            document.getElementById('manual-name').value = '';
            await loadPeers();
        } else {
            throw new Error('Failed to add device');
        }
    } catch (err) {
        showMessage('Failed to add device', 'error');
    }
}

async function deletePeer(peerId) {
    if (!confirm('Are you sure you want to remove this device?')) return;
    
    try {
        const response = await fetch(`/api/peers/${encodeURIComponent(peerId)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: authPassword })
        });
        
        if (response.ok) {
            showMessage('Device removed successfully', 'success');
            await loadPeers();
        } else {
            throw new Error('Failed to remove device');
        }
    } catch (err) {
        showMessage('Failed to remove device', 'error');
    }
}

// Update functions (called from update tab)
async function uploadUpdate() {
    const fileInput = document.getElementById('update-file');
    const file = fileInput.files[0];
    
    if (!file) {
        showMessage('Please select an update file', 'error');
        return;
    }
    
    if (selectedDevices.size === 0) {
        showMessage('Please select at least one device', 'error');
        return;
    }
    
    if (!confirm(`The application will restart on ${selectedDevices.size} device(s). Continue?`)) return;
    
    const restartPC = document.getElementById('restart-pc').checked;
    
    let successCount = 0;
    let failCount = 0;
    
    showMessage('Uploading update... Please wait', 'success');
    
    // Upload to each selected device
    for (const deviceId of selectedDevices) {
        let uploadUrl = '/api/update';
        
        if (deviceId !== 'current') {
            const peer = peers.find(p => p.id === deviceId);
            if (!peer || !peer.online) {
                failCount++;
                continue;
            }
            uploadUrl = `http://${peer.ip}:${peer.port}/api/update`;
        }
        
        const formData = new FormData();
        formData.append('update', file);
        formData.append('target', 'local');
        formData.append('password', authPassword);
        formData.append('restartPC', restartPC);
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (err) {
            console.error(`Update error for device ${deviceId}:`, err);
            failCount++;
        }
    }
    
    // Clear file input
    fileInput.value = '';
    
    if (successCount > 0 && failCount === 0) {
        showMessage(`Update uploaded to ${successCount} device(s). Devices will restart...`, 'success');
    } else if (successCount > 0 && failCount > 0) {
        showMessage(`Update sent to ${successCount} device(s), failed on ${failCount}`, 'error');
    } else {
        showMessage('Failed to upload update to all devices', 'error');
    }
}

// Generic save to devices function
async function saveToDevices(endpoint, data, settingName) {
    let successCount = 0;
    let failCount = 0;
    
    // If editing a specific device, only save to that device
    if (editingDeviceId) {
        try {
            const response = await fetch(getApiUrl(endpoint), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                showMessage(`${settingName} saved to ${getDeviceName(editingDeviceId)}`, 'success');
                await loadConfig();
            } else {
                throw new Error('Failed to save settings');
            }
        } catch (err) {
            showMessage(`Failed to save ${settingName.toLowerCase()} to ${getDeviceName(editingDeviceId)}`, 'error');
        }
        return;
    }
    
    // If no device is being edited, save to all selected devices
    if (selectedDevices.size === 0) {
        showMessage('Please select at least one device', 'error');
        return;
    }
    
    // Save to each selected device
    for (const deviceId of selectedDevices) {
        let apiUrl = endpoint;
        
        if (deviceId !== 'current') {
            const peer = peers.find(p => p.id === deviceId);
            if (!peer || !peer.online) {
                failCount++;
                continue;
            }
            apiUrl = `http://${peer.ip}:${peer.port}${endpoint}`;
        }
        
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (err) {
            console.error(`Failed to save to device ${deviceId}:`, err);
            failCount++;
        }
    }
    
    // Show result message
    if (successCount > 0 && failCount === 0) {
        showMessage(`${settingName} saved to ${successCount} device(s)`, 'success');
    } else if (successCount > 0 && failCount > 0) {
        showMessage(`${settingName} saved to ${successCount} device(s), failed on ${failCount}`, 'error');
    } else {
        showMessage(`Failed to save ${settingName.toLowerCase()} to all devices`, 'error');
    }
    
    // Reload config if current device was updated
    if (selectedDevices.has('current') || editingDeviceId === 'current') {
        await loadConfig();
    }
}

// Media functions (called from media tab)
async function loadMediaList() {
    try {
        const response = await fetch(getApiUrl('/api/media'));
        const files = await response.json();
        
        const mediaList = document.getElementById('media-list');
        mediaList.innerHTML = '';
        
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'media-item';
            item.innerHTML = `
                <div class="filename">${file.name}</div>
                <div class="info">
                    ${file.type === 'video' ? '🎥' : '🖼️'} 
                    ${formatFileSize(file.size)}
                </div>
                <button class="delete-btn" onclick="deleteMedia('${file.name}')">Delete</button>
            `;
            mediaList.appendChild(item);
        });
    } catch (err) {
        showMessage('Failed to load media list', 'error');
    }
}

async function handleFiles(files) {
    if (selectedDevices.size === 0) {
        showMessage('Please select at least one device', 'error');
        return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    // Upload to each selected device
    for (const deviceId of selectedDevices) {
        let uploadUrl = '/api/media/upload';
        
        if (deviceId !== 'current') {
            const peer = peers.find(p => p.id === deviceId);
            if (!peer || !peer.online) {
                failCount++;
                continue;
            }
            uploadUrl = `http://${peer.ip}:${peer.port}/api/media/upload`;
        }
        
        // Create FormData for each request
        const deviceFormData = new FormData();
        for (const file of files) {
            deviceFormData.append('files', file);
        }
        deviceFormData.append('target', 'local');
        deviceFormData.append('password', authPassword);
        
        try {
            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: deviceFormData
            });
            
            if (response.ok) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (err) {
            console.error(`Failed to upload to device ${deviceId}:`, err);
            failCount++;
        }
    }
    
    if (successCount > 0 && failCount === 0) {
        showMessage(`Files uploaded successfully to ${successCount} device(s)`, 'success');
    } else if (successCount > 0 && failCount > 0) {
        showMessage(`Files uploaded to ${successCount} device(s), failed on ${failCount}`, 'error');
    } else {
        showMessage('Failed to upload files to all devices', 'error');
    }
    
    // Reload media list if current device is being edited
    if (editingDeviceId === 'current' || !editingDeviceId) {
        await loadMediaList();
    }
}

async function deleteMedia(filename) {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;
    
    try {
        const response = await fetch(getApiUrl(`/api/media/${encodeURIComponent(filename)}`), {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: authPassword })
        });
        
        if (response.ok) {
            showMessage('File deleted successfully', 'success');
            await loadMediaList();
        } else {
            throw new Error('Failed to delete file');
        }
    } catch (err) {
        showMessage('Failed to delete file', 'error');
    }
}

// Addon functions (called from addons tab)
function updateAddonsList() {
    const addonsList = document.getElementById('addons-list');
    
    if (Object.keys(addons).length === 0) {
        addonsList.innerHTML = `
            <div class="addon-install-info">
                <h3>How to Install Addons</h3>
                <ol>
                    <li>Create JavaScript (.js) files in the <code>Addons</code> folder</li>
                    <li>Each addon should export <code>info</code>, <code>settings</code>, and <code>Addon</code> class</li>
                    <li>Use the Date/Time addon as a template for creating new addons</li>
                    <li>Click "Reload Addons" after adding new addon files</li>
                </ol>
            </div>
            <div class="no-addons">
                <h3>No addons found</h3>
                <p>Add addon files to the Addons folder to get started</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div class="addon-install-info">
            <h3>Addon Management</h3>
            <p>Configure your installed addons below. Changes are applied immediately to all selected devices.</p>
        </div>
    `;
    
    for (const [id, addon] of Object.entries(addons)) {
        html += createAddonElement(id, addon);
    }
    
    addonsList.innerHTML = html;
    setupAddonEventListeners();
}

function createAddonElement(id, addon) {
    const statusClass = addon.enabled ? 'enabled' : 'disabled';
    const statusText = addon.enabled ? 'enabled' : 'disabled';
    
    let settingsHtml = '';
    if (addon.settings && addon.settings.length > 0) {
        settingsHtml = `
            <div class="addon-settings" id="settings-${id}">
                <h4>Settings</h4>
                ${addon.settings.map(setting => createSettingElement(id, setting, addon.config[setting.id])).join('')}
                <button class="btn-success" onclick="saveAddonSettings('${id}')">Save Settings</button>
            </div>
        `;
    }
    
    return `
        <div class="addon-item ${addon.enabled ? '' : 'disabled'}">
            <div class="addon-header">
                <div class="addon-info">
                    <div class="addon-title">${addon.info.name}</div>
                    <div class="addon-meta">
                        Version ${addon.info.version} 
                        ${addon.info.author ? `• by ${addon.info.author}` : ''}
                        ${addon.info.category ? `• ${addon.info.category}` : ''}
                    </div>
                    ${addon.info.description ? `<div class="addon-description">${addon.info.description}</div>` : ''}
                </div>
                <div class="addon-controls">
                    <span class="addon-status ${statusClass}">${statusText}</span>
                    <div class="addon-toggle-wrapper">
                        <input type="checkbox" 
                               class="addon-toggle" 
                               data-addon-id="${id}" 
                               ${addon.enabled ? 'checked' : ''}>
                        <label>Enable</label>
                    </div>
                    ${addon.settings && addon.settings.length > 0 ? 
                        `<button class="btn-small" onclick="toggleAddonSettings('${id}')">Settings</button>` : 
                        ''}
                </div>
            </div>
            ${settingsHtml}
        </div>
    `;
}

function createSettingElement(addonId, setting, value) {
    const currentValue = value !== undefined ? value : setting.default;
    let inputHtml = '';
    
    switch (setting.type) {
        case 'boolean':
            inputHtml = `
                <input type="checkbox" 
                       id="${addonId}-${setting.id}" 
                       ${currentValue ? 'checked' : ''}>
            `;
            break;
            
        case 'text':
            inputHtml = `
                <input type="text" 
                       id="${addonId}-${setting.id}" 
                       value="${currentValue || ''}" 
                       placeholder="${setting.placeholder || ''}">
            `;
            break;
            
        case 'color':
            inputHtml = `
                <input type="color" 
                       id="${addonId}-${setting.id}" 
                       value="${currentValue || setting.default}">
            `;
            break;
            
        case 'range':
            inputHtml = `
                <input type="range" 
                       id="${addonId}-${setting.id}" 
                       min="${setting.min || 0}" 
                       max="${setting.max || 100}" 
                       value="${currentValue || setting.default}"
                       oninput="updateRangeDisplay('${addonId}-${setting.id}', this.value, '${setting.unit || ''}')">
                <span class="range-display" id="${addonId}-${setting.id}-display">
                    ${currentValue || setting.default}${setting.unit || ''}
                </span>
            `;
            break;
            
        case 'select':
            const options = setting.options || [];
            inputHtml = `
                <select id="${addonId}-${setting.id}">
                    ${options.map(opt => {
                        const optValue = typeof opt === 'string' ? opt : opt.value;
                        const optLabel = typeof opt === 'string' ? opt : opt.label;
                        return `<option value="${optValue}" ${currentValue === optValue ? 'selected' : ''}>${optLabel}</option>`;
                    }).join('')}
                </select>
            `;
            break;
            
        default:
            inputHtml = `<input type="text" id="${addonId}-${setting.id}" value="${currentValue || ''}">`;
    }
    
    return `
        <div class="addon-setting">
            <label for="${addonId}-${setting.id}">${setting.name}</label>
            ${inputHtml}
            ${setting.description ? `<small>${setting.description}</small>` : ''}
        </div>
    `;
}

function toggleAddonSettings(addonId) {
    const settings = document.getElementById(`settings-${addonId}`);
    if (settings) {
        settings.classList.toggle('show');
    }
}

function updateRangeDisplay(elementId, value, unit) {
    const display = document.getElementById(`${elementId}-display`);
    if (display) {
        display.textContent = `${value}${unit}`;
    }
}

async function saveAddonSettings(addonId) {
    const addon = addons[addonId];
    if (!addon || !addon.settings) return;
    
    const config = {};
    
    // Collect setting values
    for (const setting of addon.settings) {
        const element = document.getElementById(`${addonId}-${setting.id}`);
        if (!element) continue;
        
        switch (setting.type) {
            case 'boolean':
                config[setting.id] = element.checked;
                break;
            case 'range':
                config[setting.id] = parseInt(element.value);
                break;
            default:
                config[setting.id] = element.value;
        }
    }
    
    await saveToDevices(`/api/addons/${addonId}/config`, { ...config, password: authPassword }, 'Addon settings');
    
    // Reload addons list if current device was updated
    if (selectedDevices.has('current') || editingDeviceId === 'current') {
        await loadAddonsList();
    }
}

function setupAddonEventListeners() {
    // Addon toggle switches
    document.querySelectorAll('.addon-toggle').forEach(toggle => {
        toggle.addEventListener('change', async (e) => {
            const addonId = e.target.dataset.addonId;
            const enabled = e.target.checked;
            
            try {
                const config = { enabled: enabled };
                await saveToDevices(`/api/addons/${addonId}/config`, { ...config, password: authPassword }, 'Addon toggle');
                
                // Update local state
                if (addons[addonId]) {
                    addons[addonId].enabled = enabled;
                    addons[addonId].config.enabled = enabled;
                }
                
                // Update UI
                const addonItem = e.target.closest('.addon-item');
                if (enabled) {
                    addonItem.classList.remove('disabled');
                } else {
                    addonItem.classList.add('disabled');
                }
                
                const statusElement = addonItem.querySelector('.addon-status');
                statusElement.textContent = enabled ? 'enabled' : 'disabled';
                statusElement.className = `addon-status ${enabled ? 'enabled' : 'disabled'}`;
                
            } catch (err) {
                console.error('Failed to toggle addon:', err);
                // Revert toggle state
                e.target.checked = !enabled;
                showMessage('Failed to toggle addon', 'error');
            }
        });
    });
}

// Utility functions
function showAuthModal() {
    document.getElementById('auth-modal').classList.add('show');
    document.getElementById('auth-password').focus();
}

function submitAuth() {
    authPassword = document.getElementById('auth-password').value;
    document.getElementById('auth-modal').classList.remove('show');
    loadConfig();
}

function showMessage(text, type) {
    const message = document.getElementById('message');
    message.textContent = text;
    message.className = `message ${type} show`;
    
    setTimeout(() => {
        message.classList.remove('show');
    }, 3000);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Initialize on load
window.addEventListener('DOMContentLoaded', init);