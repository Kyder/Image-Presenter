use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::collections::HashMap;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub display_name: String,
    pub image_duration: u64,
    pub video_position: String,
    pub image_scaling: String,
    pub manual_resolution: bool,
    pub manual_width: Option<u32>,
    pub manual_height: Option<u32>,
    pub password: String,
    pub static_ip: String,
    pub localhost_only: bool,
    pub port: u16,
    pub ws_port: u16,
    pub discovery_port: u16,
    pub rotation: i32,
    #[serde(default)]
    pub addons: HashMap<String, HashMap<String, serde_json::Value>>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            display_name: hostname::get()
                .ok()
                .and_then(|h| h.into_string().ok())
                .unwrap_or_else(|| "Digital Signage".to_string()),
            image_duration: 5000,
            video_position: "after".to_string(),
            image_scaling: "contain".to_string(),
            manual_resolution: false,
            manual_width: None,
            manual_height: None,
            password: String::new(),
            static_ip: String::new(),
            localhost_only: false,
            port: 3006,
            ws_port: 3001,
            discovery_port: 3002,
            rotation: 0,
            addons: HashMap::new(),
        }
    }
}

pub fn get_config_path() -> Result<PathBuf, String> {
    crate::paths::get_config_path()
}

pub fn load_config() -> Result<Config, String> {
    let config_path = get_config_path()?;
    
    if !config_path.exists() {
        let default_config = Config::default();
        save_config(&default_config)?;
        return Ok(default_config);
    }
    
    let content = fs::read_to_string(&config_path)
        .map_err(|e| e.to_string())?;
    
    let config: Config = serde_json::from_str(&content)
        .map_err(|e| e.to_string())?;
    
    Ok(config)
}

pub fn save_config(config: &Config) -> Result<(), String> {
    let config_path = get_config_path()?;
    
    println!("Saving config to: {:?}", config_path);
    
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| e.to_string())?;
    
    fs::write(&config_path, content)
        .map_err(|e| e.to_string())?;
    
    println!("Config saved successfully");
    
    Ok(())
}