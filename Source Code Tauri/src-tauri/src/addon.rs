use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::fs;
use mlua::prelude::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddonInfo {
    pub name: String,
    pub version: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddonSetting {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub setting_type: String,
    pub default: serde_json::Value,
    pub description: Option<String>,
    pub placeholder: Option<String>,
    pub min: Option<i64>,
    pub max: Option<i64>,
    pub unit: Option<String>,
    pub options: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddonManifest {
    pub info: AddonInfo,
    pub settings: Vec<AddonSetting>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Addon {
    pub id: String,
    pub folder: String,
    pub info: AddonInfo,
    pub settings: Vec<AddonSetting>,
    pub enabled: bool,
    pub config: HashMap<String, serde_json::Value>,
    pub has_backend: bool,
    pub has_frontend: bool,
}

pub fn get_addons_dir() -> Result<PathBuf, String> {
    crate::paths::get_addons_dir()
}

pub async fn scan_addons() -> Result<Vec<Addon>, String> {
    let addons_dir = get_addons_dir()?;
    
    if !addons_dir.exists() {
        fs::create_dir_all(&addons_dir).await
            .map_err(|e| e.to_string())?;
        return Ok(Vec::new());
    }
    
    let mut entries = fs::read_dir(&addons_dir).await
        .map_err(|e| e.to_string())?;
    let mut addons = Vec::new();
    
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        
        if !path.is_dir() {
            continue;
        }
        
        let folder_name = path.file_name()
            .and_then(|n| n.to_str())
            .ok_or("Invalid folder name")?
            .to_string();
        
        // Check for addon.toml
        let manifest_path = path.join("addon.toml");
        if !manifest_path.exists() {
            println!("Skipping {}: no addon.toml found", folder_name);
            continue;
        }
        
        // Read manifest
        let manifest_content = fs::read_to_string(&manifest_path).await
            .map_err(|e| format!("Failed to read manifest for {}: {}", folder_name, e))?;
        
        let mut manifest: AddonManifest = toml::from_str(&manifest_content)
            .map_err(|e| format!("Failed to parse manifest for {}: {}", folder_name, e))?;
        
        // Check for backend.lua
        let backend_path = path.join("backend.lua");
        let has_backend = backend_path.exists();
        
        // If backend exists, run its init function to modify settings
        if has_backend {
            if let Err(e) = execute_lua_backend_init(&backend_path, &mut manifest.settings, &folder_name).await {
                println!("Warning: Failed to execute backend init for {}: {}", folder_name, e);
            }
        }
        
        // Check for frontend.js
        let has_frontend = path.join("frontend.js").exists();
        
        // Use folder name as ID
        let addon = Addon {
            id: folder_name.clone(),
            folder: folder_name,
            info: manifest.info,
            settings: manifest.settings,
            enabled: false, // Will be loaded from config
            config: HashMap::new(), // Will be loaded from config
            has_backend,
            has_frontend,
        };
        
        addons.push(addon);
    }
    
    Ok(addons)
}

/// Execute Lua backend initialization to modify settings dynamically
async fn execute_lua_backend_init(
    backend_path: &PathBuf,
    settings: &mut Vec<AddonSetting>,
    addon_id: &str,
) -> Result<(), String> {
    println!("=== EXECUTING LUA BACKEND FOR {} ===", addon_id);
    
    // Read the Lua script
    let lua_script = fs::read_to_string(backend_path).await
        .map_err(|e| format!("Failed to read backend.lua: {}", e))?;
    
    // Create Lua instance
    let lua = Lua::new();
    
    // Setup Lua API for addon to use
    setup_lua_api(&lua, addon_id)?;
    
    // Execute the Lua script
    lua.load(&lua_script).exec()
        .map_err(|e| format!("Failed to execute Lua script: {}", e))?;
    
    // Call the init function if it exists
    let globals = lua.globals();
    if let Ok(init_fn) = globals.get::<_, LuaFunction>("init") {
        // Convert settings to Lua table
        let settings_table = lua.create_table()
            .map_err(|e| format!("Failed to create settings table: {}", e))?;
        
        for (i, setting) in settings.iter().enumerate() {
            let setting_table = lua.create_table()
                .map_err(|e| format!("Failed to create setting table: {}", e))?;
            
            setting_table.set("id", setting.id.clone())
                .map_err(|e| format!("Failed to set id: {}", e))?;
            setting_table.set("name", setting.name.clone())
                .map_err(|e| format!("Failed to set name: {}", e))?;
            setting_table.set("type", setting.setting_type.clone())
                .map_err(|e| format!("Failed to set type: {}", e))?;
            
            if let Some(options) = &setting.options {
                let options_table = lua.create_table()
                    .map_err(|e| format!("Failed to create options table: {}", e))?;
                
                for (j, opt) in options.iter().enumerate() {
                    options_table.set(j + 1, serde_json::to_string(opt).unwrap_or_default())
                        .map_err(|e| format!("Failed to set option: {}", e))?;
                }
                
                setting_table.set("options", options_table)
                    .map_err(|e| format!("Failed to set options: {}", e))?;
            }
            
            settings_table.set(i + 1, setting_table)
                .map_err(|e| format!("Failed to set setting: {}", e))?;
        }
        
        // Call init with settings
        let result: LuaTable = init_fn.call(settings_table)
            .map_err(|e| format!("Failed to call init function: {}", e))?;
        
        // Convert result back to settings
        for i in 1..=result.len().unwrap_or(0) {
            if let Ok(setting_table) = result.get::<_, LuaTable>(i) {
                if let Ok(id) = setting_table.get::<_, String>("id") {
                    // Find the setting in our settings vec
                    if let Some(setting) = settings.iter_mut().find(|s| s.id == id) {
                        // Update options if provided
                        if let Ok(options_table) = setting_table.get::<_, LuaTable>("options") {
                            let mut new_options = Vec::new();
                            
                            for j in 1..=options_table.len().unwrap_or(0) {
                                if let Ok(opt_str) = options_table.get::<_, String>(j) {
                                    if let Ok(opt_val) = serde_json::from_str(&opt_str) {
                                        new_options.push(opt_val);
                                    }
                                }
                            }
                            
                            if !new_options.is_empty() {
                                let count = new_options.len();
                                setting.options = Some(new_options);
                                println!("Updated {} options for setting '{}'", count, id);
                            }
                        }
                    }
                }
            }
        }
    }
    
    println!("=== LUA BACKEND EXECUTION COMPLETE ===");
    Ok(())
}

/// Setup Lua API functions that addons can use
fn setup_lua_api(lua: &Lua, addon_id: &str) -> Result<(), String> {
    let globals = lua.globals();
    
    // Create addon API table
    let addon_api = lua.create_table()
        .map_err(|e| format!("Failed to create addon API: {}", e))?;
    
    // Add get_fonts_dir function
    let fonts_dir_path = crate::paths::get_fonts_dir()
        .map_err(|e| format!("Failed to get fonts dir: {}", e))?;
    let fonts_dir_str = fonts_dir_path.to_string_lossy().to_string();
    
    let get_fonts_dir_fn = lua.create_function(move |_, ()| {
        Ok(fonts_dir_str.clone())
    }).map_err(|e| format!("Failed to create get_fonts_dir function: {}", e))?;
    
    addon_api.set("get_fonts_dir", get_fonts_dir_fn)
        .map_err(|e| format!("Failed to set get_fonts_dir: {}", e))?;
    
    // Add get_addon_dir function
    let addon_dir_path = get_addons_dir()
        .map_err(|e| format!("Failed to get addons dir: {}", e))?
        .join(addon_id);
    let addon_dir_str = addon_dir_path.to_string_lossy().to_string();
    
    let get_addon_dir_fn = lua.create_function(move |_, ()| {
        Ok(addon_dir_str.clone())
    }).map_err(|e| format!("Failed to create get_addon_dir function: {}", e))?;
    
    addon_api.set("get_addon_dir", get_addon_dir_fn)
        .map_err(|e| format!("Failed to set get_addon_dir: {}", e))?;
    
    // Add list_directory function for cross-platform directory listing
    let list_directory_fn = lua.create_function(|_, path: String| {
        use std::fs;
        use std::path::Path;
        
        let path = Path::new(&path);
        
        // Check if path exists and is a directory
        if !path.exists() {
            return Err(mlua::Error::RuntimeError(
                format!("Path does not exist: {}", path.display())
            ));
        }
        
        if !path.is_dir() {
            return Err(mlua::Error::RuntimeError(
                format!("Path is not a directory: {}", path.display())
            ));
        }
        
        // Read directory entries
        match fs::read_dir(path) {
            Ok(entries) => {
                let mut files = Vec::new();
                
                for entry in entries {
                    match entry {
                        Ok(entry) => {
                            let file_name = entry.file_name();
                            files.push(file_name.to_string_lossy().to_string());
                        }
                        Err(e) => {
                            eprintln!("Error reading directory entry: {}", e);
                        }
                    }
                }
                
                Ok(files)
            }
            Err(e) => Err(mlua::Error::RuntimeError(
                format!("Failed to read directory: {}", e)
            ))
        }
    }).map_err(|e| format!("Failed to create list_directory function: {}", e))?;
    
    addon_api.set("list_directory", list_directory_fn)
        .map_err(|e| format!("Failed to set list_directory: {}", e))?;
    
    // Add print function that logs to console
    let addon_id_for_print = addon_id.to_string();
    let print_fn = lua.create_function(move |_, msg: String| {
        println!("[Addon: {}] {}", addon_id_for_print, msg);
        Ok(())
    }).map_err(|e| format!("Failed to create print function: {}", e))?;
    
    addon_api.set("print", print_fn)
        .map_err(|e| format!("Failed to set print: {}", e))?;
    
    // Set the API in globals
    globals.set("addon", addon_api)
        .map_err(|e| format!("Failed to set addon API: {}", e))?;
    
    Ok(())
}

pub async fn get_frontend_script_with_config(
    addon_id: &str,
    addon_config: &HashMap<String, serde_json::Value>,
) -> Result<String, String> {
    let addons_dir = get_addons_dir()?;
    let frontend_path = addons_dir.join(addon_id).join("frontend.js");
    
    if !frontend_path.exists() {
        return Err("Frontend script not found".to_string());
    }
    
    let script = fs::read_to_string(&frontend_path).await
        .map_err(|e| e.to_string())?;
    
    // Inject config before the script
    let config_json = serde_json::to_string(addon_config)
        .map_err(|e| e.to_string())?;
    
    let wrapped_script = format!(
        "window.addonConfig = {};\n{}",
        config_json,
        script
    );
    
    Ok(wrapped_script)
}

pub async fn get_frontend_script(addon_id: &str) -> Result<String, String> {
    let addons_dir = get_addons_dir()?;
    let frontend_path = addons_dir.join(addon_id).join("frontend.js");
    
    if !frontend_path.exists() {
        return Err("Frontend script not found".to_string());
    }
    
    let script = fs::read_to_string(&frontend_path).await
        .map_err(|e| e.to_string())?;
    
    Ok(script)
}

pub fn merge_addon_config(
    addon: &mut Addon,
    saved_config: Option<&HashMap<String, serde_json::Value>>,
) {
    if let Some(saved) = saved_config {
        addon.enabled = saved.get("enabled")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        
        // Merge saved settings with defaults
        for setting in &addon.settings {
            if let Some(value) = saved.get(&setting.id) {
                addon.config.insert(setting.id.clone(), value.clone());
            } else {
                addon.config.insert(setting.id.clone(), setting.default.clone());
            }
        }
    } else {
        // Use defaults
        addon.enabled = false;
        for setting in &addon.settings {
            addon.config.insert(setting.id.clone(), setting.default.clone());
        }
    }
}