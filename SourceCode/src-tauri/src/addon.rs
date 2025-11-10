use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::fs;

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
        
        // Special handling for datetime addon - inject dynamic font list
        if folder_name == "datetime" {
            if let Err(e) = inject_dynamic_fonts(&mut manifest.settings).await {
                println!("Warning: Failed to inject fonts for datetime addon: {}", e);
            }
        }
        
        // Check for backend.rs and frontend.js
        let has_backend = path.join("backend.rs").exists();
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

/// Inject dynamic font options into datetime addon settings
async fn inject_dynamic_fonts(settings: &mut Vec<AddonSetting>) -> Result<(), String> {
    println!("=== INJECTING FONTS ===");
    
    // Find the font setting
    if let Some(font_setting) = settings.iter_mut().find(|s| s.id == "font") {
        println!("Found font setting in datetime addon");
        
        // Get available fonts
        let fonts = get_available_fonts().await?;
        println!("Found {} fonts total", fonts.len());
        
        for font in &fonts {
            println!("  - {} ({})", font.label, font.value);
        }
        
        // Convert to setting options format
        let options: Vec<serde_json::Value> = fonts.into_iter().map(|font| {
            serde_json::json!({
                "value": font.value,
                "label": font.label
            })
        }).collect();
        
        font_setting.options = Some(options);
        println!("Successfully injected {} font options into datetime addon", font_setting.options.as_ref().unwrap().len());
    } else {
        println!("WARNING: Could not find font setting in datetime addon!");
    }
    
    Ok(())
}

/// Get list of available fonts from Fonts directory
async fn get_available_fonts() -> Result<Vec<FontOption>, String> {
    let fonts_dir = get_fonts_dir_for_addon()?;
    
    println!("=== SCANNING FONTS ===");
    println!("Fonts directory: {:?}", fonts_dir);
    println!("Fonts directory exists: {}", fonts_dir.exists());
    
    let mut fonts = vec![
        FontOption {
            value: "default".to_string(),
            label: "Default (Arial)".to_string(),
        }
    ];
    
    if !fonts_dir.exists() {
        println!("Fonts directory does not exist!");
        return Ok(fonts);
    }
    
    let mut entries = fs::read_dir(&fonts_dir).await
        .map_err(|e| format!("Failed to read Fonts dir: {}", e))?;
    
    let mut font_count = 0;
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        
        println!("  Checking file: {:?}", path);
        
        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                println!("    Extension: {}", ext_str);
                
                if matches!(ext_str.as_str(), "ttf" | "otf" | "woff" | "woff2") {
                    if let Some(filename) = path.file_name() {
                        let filename_str = filename.to_string_lossy().to_string();
                        
                        // Create a nice label from filename
                        let label = filename_str
                            .replace(".ttf", "")
                            .replace(".otf", "")
                            .replace(".woff2", "")
                            .replace(".woff", "")
                            .replace("-", " ")
                            .replace("_", " ");
                        
                        println!("    ✓ Added font: {} -> {}", filename_str, label);
                        
                        fonts.push(FontOption {
                            value: filename_str,
                            label,
                        });
                        font_count += 1;
                    }
                } else {
                    println!("    ✗ Skipped (unsupported extension)");
                }
            }
        } else {
            println!("    ✗ Skipped (not a file)");
        }
    }
    
    fonts.sort_by(|a, b| a.label.cmp(&b.label));
    
    println!("=== FONTS SCAN COMPLETE ===");
    println!("Total fonts found: {} (+ 1 default)", font_count);
    
    Ok(fonts)
}

#[derive(Debug, Clone)]
struct FontOption {
    value: String,
    label: String,
}

fn get_fonts_dir_for_addon() -> Result<PathBuf, String> {
    crate::paths::get_fonts_dir()
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