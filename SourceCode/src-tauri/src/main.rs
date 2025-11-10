#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod media;
mod addon;
mod fonts;
mod paths;

use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tauri::{State, AppHandle, Emitter};
use axum::{
    extract::{Multipart, Path as AxumPath, DefaultBodyLimit},
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use tower_http::{services::ServeDir, cors::CorsLayer};
use std::net::SocketAddr;

#[allow(dead_code)]
struct AppState {
    config: Arc<Mutex<config::Config>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
}

#[tauri::command]
fn log_message(message: String) {
    println!("[FRONTEND] {}", message);
}

#[tauri::command]
fn get_config(state: State<AppState>) -> Result<config::Config, String> {
    let config = state.config.lock().unwrap();
    Ok(config.clone())
}

#[tauri::command]
fn save_config_command(state: State<AppState>, new_config: config::Config) -> Result<(), String> {
    let mut config = state.config.lock().unwrap();
    *config = new_config.clone();
    config::save_config(&new_config)?;
    Ok(())
}

#[tauri::command]
async fn get_media_files() -> Result<Vec<media::MediaFile>, String> {
    media::get_files().await
}

#[tauri::command]
async fn delete_media_file(filename: String) -> Result<(), String> {
    media::delete_file(&filename).await
}

#[tauri::command]
async fn get_addon_frontend_script(addon_id: String) -> Result<String, String> {
    // Load addons and get the config for this addon
    let mut addons = addon::scan_addons().await?;
    let config = config::load_config()?;
    
    // Find the addon
    let addon_item = addons.iter_mut()
        .find(|a| a.id == addon_id)
        .ok_or("Addon not found")?;
    
    // Merge config
    let saved_config = config.addons.get(&addon_item.id);
    addon::merge_addon_config(addon_item, saved_config);
    
    // Get frontend script with injected config
    addon::get_frontend_script_with_config(&addon_id, &addon_item.config).await
}

#[tauri::command]
async fn save_addon_config(addon_id: String, new_config: HashMap<String, serde_json::Value>) -> Result<(), String> {
    let mut config = config::load_config()?;
    
    // Update addon config in main config
    config.addons.insert(addon_id, new_config);
    
    config::save_config(&config)?;
    
    Ok(())
}

#[tauri::command]
async fn reload_addons() -> Result<(), String> {
    // Just a placeholder for now - actual reload will happen when frontend calls get_addons again
    Ok(())
}

#[tauri::command]
async fn get_font_data(font_name: String) -> Result<String, String> {
    println!("=== get_font_data called ===");
    println!("Font name requested: {}", font_name);
    
    match fonts::get_font_as_base64(&font_name).await {
        Ok(data) => {
            println!("Font loaded successfully, data length: {}", data.len());
            Ok(data)
        }
        Err(e) => {
            println!("Failed to load font: {}", e);
            Err(e)
        }
    }
}

#[tauri::command]
async fn list_fonts() -> Result<Vec<String>, String> {
    fonts::list_fonts().await
}

#[tauri::command]
async fn get_addons() -> Result<serde_json::Value, String> {
    let mut addons = addon::scan_addons().await?;
    
    // Load saved configs from main config
    let config = config::load_config()?;
    
    for mut addon_item in &mut addons {
        let saved_config = config.addons.get(&addon_item.id);
        addon::merge_addon_config(&mut addon_item, saved_config);
    }
    
    // Convert to JSON object with addon IDs as keys
    let mut addons_map = serde_json::Map::new();
    for addon_item in addons {
        addons_map.insert(addon_item.id.clone(), serde_json::json!({
            "id": addon_item.id,
            "info": {
                "name": addon_item.info.name,
                "version": addon_item.info.version,
                "author": addon_item.info.author,
                "description": addon_item.info.description,
                "category": addon_item.info.category,
            },
            "enabled": addon_item.enabled,
            "config": addon_item.config,
            "settings": addon_item.settings,
        }));
    }
    
    Ok(serde_json::Value::Object(addons_map))
}

#[tauri::command]
fn get_addons_dir() -> Result<String, String> {
    let path = addon::get_addons_dir()?;
    Ok(path.to_string_lossy().to_string())
}

#[tokio::main]
async fn main() {
    let config = config::load_config().unwrap_or_default();
    let config_arc = Arc::new(Mutex::new(config.clone()));
    let app_handle_arc = Arc::new(Mutex::new(None));
    
    // Ensure Fonts directory exists
    if let Err(e) = fonts::ensure_fonts_dir().await {
        eprintln!("Failed to create Fonts directory: {}", e);
    }
    
    // Start Axum web server in background
    let config_for_server = config_arc.clone();
    let app_handle_for_server = app_handle_arc.clone();
    tokio::spawn(async move {
        start_web_server(config_for_server, app_handle_for_server).await;
    });
    
    let app = tauri::Builder::default()
        .manage(AppState {
            config: config_arc,
            app_handle: app_handle_arc.clone(),
        })
        .invoke_handler(tauri::generate_handler![
            log_message,
            get_config,
            save_config_command,
            get_media_files,
            delete_media_file,
            get_addons,
            get_addons_dir,
            get_addon_frontend_script,
            save_addon_config,
            reload_addons,
            get_font_data,
            list_fonts,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");
    
    // Store app handle - Tauri v2 returns &AppHandle so we need to clone it
    {
        let mut handle = app_handle_arc.lock().unwrap();
        *handle = Some(app.handle().clone());
    }
    
    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            api.prevent_exit();
        }
    });
}

async fn start_web_server(config: Arc<Mutex<config::Config>>, app_handle: Arc<Mutex<Option<AppHandle>>>) {
    let port = {
        let cfg = config.lock().unwrap();
        cfg.port
    };
    
    // Determine web directory path
    let web_dir = if cfg!(debug_assertions) {
        // Dev mode: look in parent of src-tauri
        std::env::current_dir().unwrap().parent().unwrap().join("web")
    } else {
        // Production: Tauri bundles resources differently on Windows
        // Try multiple locations
        let exe_path = std::env::current_exe().unwrap();
        let exe_dir = exe_path.parent().unwrap();
        
        // Try next to exe first
        let web_next_to_exe = exe_dir.join("web");
        if web_next_to_exe.exists() {
            web_next_to_exe
        } else {
            // Try in parent directory (common for MSI installs)
            let web_in_parent = exe_dir.parent().unwrap().join("web");
            if web_in_parent.exists() {
                web_in_parent
            } else {
                // Fallback to next to exe
                web_next_to_exe
            }
        }
    };
    
    println!("Web directory: {:?}", web_dir);
    println!("Web directory exists: {}", web_dir.exists());
    
    let app = Router::new()
        .route("/api/config", get({
            let config = config.clone();
            move || get_config_handler(config)
        }))
        .route("/api/config", post({
            let config = config.clone();
            let app_handle = app_handle.clone();
            move |body| post_config_handler(config, app_handle, body)
        }))
        .route("/api/media", get(get_media_handler))
        .route("/api/media/upload", post({
            let app_handle = app_handle.clone();
            move |multipart| upload_media_handler(app_handle, multipart)
        }))
        .layer(DefaultBodyLimit::max(100 * 1024 * 1024)) // 100MB limit
        .route("/api/media/:filename", axum::routing::delete({
            let app_handle = app_handle.clone();
            move |path| delete_media_handler(app_handle, path)
        }))
        .route("/api/peers", get(get_peers_handler))
        .route("/api/addons", get(get_addons_handler))
        .route("/api/addons/reload", post(reload_addons_handler))
        .route("/api/addons/:id/config", post({
            let app_handle = app_handle.clone();
            move |path, body| update_addon_config_handler(app_handle, path, body)
        }))
        .nest_service("/", ServeDir::new(web_dir))
        .layer(CorsLayer::permissive());
    
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Web server started on http://0.0.0.0:{}", port);
    
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn get_config_handler(config: Arc<Mutex<config::Config>>) -> impl IntoResponse {
    let cfg = config.lock().unwrap();
    Json(serde_json::json!({
        "displayName": cfg.display_name,
        "imageDuration": cfg.image_duration,
        "videoPosition": cfg.video_position,
        "imageScaling": cfg.image_scaling,
        "port": cfg.port,
        "rotation": cfg.rotation,
        "hasPassword": !cfg.password.is_empty(),
        "staticIp": cfg.static_ip,
        "localhostOnly": cfg.localhost_only,
        "wsPort": cfg.ws_port,
        "discoveryPort": cfg.discovery_port,
        "version": env!("CARGO_PKG_VERSION"),
        "peers": [],
    }))
}

async fn post_config_handler(
    config: Arc<Mutex<config::Config>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    Json(updates): Json<serde_json::Value>,
) -> impl IntoResponse {
    let mut cfg = config.lock().unwrap();
    
    if let Some(val) = updates.get("displayName").and_then(|v| v.as_str()) {
        cfg.display_name = val.to_string();
    }
    if let Some(val) = updates.get("imageDuration").and_then(|v| v.as_u64()) {
        cfg.image_duration = val;
    }
    if let Some(val) = updates.get("videoPosition").and_then(|v| v.as_str()) {
        cfg.video_position = val.to_string();
    }
    if let Some(val) = updates.get("imageScaling").and_then(|v| v.as_str()) {
        cfg.image_scaling = val.to_string();
    }
    if let Some(val) = updates.get("rotation").and_then(|v| v.as_i64()) {
        cfg.rotation = val as i32;
    }
    
    if let Err(e) = config::save_config(&cfg) {
        return Json(serde_json::json!({
            "error": e
        }));
    }
    
    // Emit config update event - Tauri v2 uses emit() not emit_all()
    if let Some(handle) = app_handle.lock().unwrap().as_ref() {
        let _ = handle.emit("config-update", cfg.clone());
        println!("Emitted config-update event");
    }
    
    Json(serde_json::json!({
        "success": true
    }))
}

async fn get_media_handler() -> impl IntoResponse {
    match media::get_files().await {
        Ok(files) => Json(serde_json::json!(files)),
        Err(e) => Json(serde_json::json!({
            "error": e
        })),
    }
}

async fn upload_media_handler(app_handle: Arc<Mutex<Option<AppHandle>>>, mut multipart: Multipart) -> impl IntoResponse {
    let mut uploaded_count = 0;
    
    while let Ok(Some(field)) = multipart.next_field().await {
        if let Some(filename) = field.file_name() {
            let filename = filename.to_string();
            
            if let Ok(data) = field.bytes().await {
                if let Ok(_) = media::save_file(&filename, &data).await {
                    uploaded_count += 1;
                    println!("Uploaded: {}", filename);
                }
            }
        }
    }
    
    // Emit media update event - Tauri v2 uses emit() not emit_all()
    if let Some(handle) = app_handle.lock().unwrap().as_ref() {
        let _ = handle.emit("media-update", ());
        println!("Emitted media-update event");
    }
    
    Json(serde_json::json!({
        "success": true,
        "files": uploaded_count
    }))
}

async fn delete_media_handler(app_handle: Arc<Mutex<Option<AppHandle>>>, AxumPath(filename): AxumPath<String>) -> impl IntoResponse {
    match media::delete_file(&filename).await {
        Ok(_) => {
            // Emit media update event - Tauri v2 uses emit() not emit_all()
            if let Some(handle) = app_handle.lock().unwrap().as_ref() {
                let _ = handle.emit("media-update", ());
                println!("Emitted media-update event");
            }
            
            Json(serde_json::json!({
                "success": true
            }))
        },
        Err(e) => Json(serde_json::json!({
            "error": e
        })),
    }
}

async fn get_peers_handler() -> impl IntoResponse {
    // For now, return empty array
    // Network discovery will be implemented later
    Json(serde_json::json!([]))
}

async fn get_addons_handler() -> impl IntoResponse {
    match get_addons_internal().await {
        Ok(addons) => Json(addons),
        Err(e) => Json(serde_json::json!({
            "error": e
        })),
    }
}

async fn get_addons_internal() -> Result<serde_json::Value, String> {
    let mut addons = addon::scan_addons().await?;
    
    // Load saved configs from main config
    let config = config::load_config()?;
    
    for mut addon_item in &mut addons {
        let saved_config = config.addons.get(&addon_item.id);
        addon::merge_addon_config(&mut addon_item, saved_config);
    }
    
    // Convert to JSON object with addon IDs as keys
    let mut addons_map = serde_json::Map::new();
    for addon_item in addons {
        addons_map.insert(addon_item.id.clone(), serde_json::json!({
            "id": addon_item.id,
            "info": {
                "name": addon_item.info.name,
                "version": addon_item.info.version,
                "author": addon_item.info.author,
                "description": addon_item.info.description,
                "category": addon_item.info.category,
            },
            "enabled": addon_item.enabled,
            "config": addon_item.config,
            "settings": addon_item.settings,
        }));
    }
    
    Ok(serde_json::Value::Object(addons_map))
}

async fn reload_addons_handler() -> impl IntoResponse {
    Json(serde_json::json!({
        "success": true,
        "message": "Addons reloaded successfully"
    }))
}

async fn update_addon_config_handler(
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    AxumPath(addon_id): AxumPath<String>,
    Json(updates): Json<serde_json::Value>,
) -> impl IntoResponse {
    // Load config
    let mut main_config = match config::load_config() {
        Ok(c) => c,
        Err(e) => return Json(serde_json::json!({
            "error": e
        })),
    };
    
    // Get or create addon config
    let addon_config = main_config.addons
        .entry(addon_id.clone())
        .or_insert_with(HashMap::new);
    
    // Update config values
    if let Some(obj) = updates.as_object() {
        for (key, value) in obj {
            if key != "password" {
                addon_config.insert(key.clone(), value.clone());
            }
        }
    }
    
    // Save config
    if let Err(e) = config::save_config(&main_config) {
        return Json(serde_json::json!({
            "error": e
        }));
    }
    
    // Emit addons update event - Tauri v2 uses emit() not emit_all()
    if let Some(handle) = app_handle.lock().unwrap().as_ref() {
        let _ = handle.emit("addons-update", ());
        println!("Emitted addons-update event");
    }
    
    Json(serde_json::json!({
        "success": true
    }))
}