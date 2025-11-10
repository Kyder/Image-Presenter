use axum::{
    extract::{State, Path, Multipart},
    response::{IntoResponse, Response},
    routing::{get, post, delete},
    Router, Json,
    http::{StatusCode, header},
};
use tower_http::{
    services::ServeDir,
    cors::{CorsLayer, Any},
    trace::TraceLayer,
};
use serde_json::json;
use std::sync::Arc;
use tokio::sync::Mutex;
use anyhow::Result;

type SharedConfig = Arc<Mutex<crate::config::Config>>;

#[derive(Clone)]
struct AppState {
    config: SharedConfig,
    app_handle: tauri::AppHandle,
}

/// Start the web server
pub async fn start_server(
    config: SharedConfig,
    app_handle: tauri::AppHandle,
) -> Result<()> {
    let cfg = config.lock().await;
    let port = cfg.port;
    let static_ip = cfg.static_ip.clone();
    let localhost_only = cfg.localhost_only;
    drop(cfg);
    
    let state = AppState {
        config: config.clone(),
        app_handle: app_handle.clone(),
    };
    
    // Build the web server routes
    let app = Router::new()
        // API routes
        .route("/api/config", get(get_config).post(save_config))
        .route("/api/password", post(change_password))
        .route("/api/media", get(get_media_list))
        .route("/api/media/upload", post(upload_media))
        .route("/api/media/:filename", delete(delete_media))
        .route("/api/addons", get(get_addons))
        .route("/api/addons/:id/config", post(update_addon))
        .route("/api/addons/reload", post(reload_addons))
        .route("/api/peers", get(get_peers))
        .route("/api/peers/add", post(add_peer))
        .route("/api/peers/:id", delete(remove_peer))
        .route("/api/update", post(upload_update))
        // Serve static files from web directory
        .nest_service("/", ServeDir::new("web"))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any)
        )
        .layer(TraceLayer::new_for_http())
        .with_state(state);
    
    // Determine bind address
    let bind_addr = if localhost_only {
        format!("127.0.0.1:{}", port)
    } else if !static_ip.is_empty() {
        format!("{}:{}", static_ip, port)
    } else {
        format!("0.0.0.0:{}", port)
    };
    
    println!("Starting web server on {}", bind_addr);
    
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    axum::serve(listener, app).await?;
    
    Ok(())
}

// API Handlers

async fn get_config(State(state): State<AppState>) -> Json<serde_json::Value> {
    let config = state.config.lock().await;
    Json(json!({
        "displayName": config.display_name,
        "imageDuration": config.image_duration,
        "videoPosition": config.video_position,
        "imageScaling": config.image_scaling,
        "manualResolution": config.manual_resolution,
        "manualWidth": config.manual_width,
        "manualHeight": config.manual_height,
        "hasPassword": !config.password.is_empty(),
        "staticIp": config.static_ip,
        "localhostOnly": config.localhost_only,
        "port": config.port,
        "wsPort": config.ws_port,
        "discoveryPort": config.discovery_port,
        "peers": config.peers,
        "rotation": config.rotation,
        "version": env!("CARGO_PKG_VERSION"),
    }))
}

async fn save_config(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // TODO: Implement authentication check
    
    let mut config = state.config.lock().await;
    
    // Update config fields from payload
    if let Some(display_name) = payload.get("displayName").and_then(|v| v.as_str()) {
        config.display_name = display_name.to_string();
    }
    if let Some(image_duration) = payload.get("imageDuration").and_then(|v| v.as_u64()) {
        config.image_duration = image_duration;
    }
    // ... update other fields
    
    crate::config::save_to_file(&config).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // Notify display window of config change
    state.app_handle.emit_all("config-update", &*config)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(json!({ "success": true })))
}

async fn change_password(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // TODO: Implement authentication check
    
    let new_password = payload.get("newPassword")
        .and_then(|v| v.as_str())
        .ok_or(StatusCode::BAD_REQUEST)?;
    
    let mut config = state.config.lock().await;
    config.password = new_password.to_string();
    
    crate::config::save_to_file(&config).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(json!({ "success": true })))
}

async fn get_media_list() -> Result<Json<Vec<crate::media::MediaFile>>, StatusCode> {
    let files = crate::media::get_files().await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(files))
}

async fn upload_media(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // TODO: Implement authentication check
    
    let mut uploaded_count = 0;
    
    while let Some(field) = multipart.next_field().await
        .map_err(|_| StatusCode::BAD_REQUEST)? 
    {
        if let Some(filename) = field.file_name() {
            let filename = filename.to_string();
            let data = field.bytes().await
                .map_err(|_| StatusCode::BAD_REQUEST)?;
            
            crate::media::save_file(&filename, &data).await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            
            uploaded_count += 1;
        }
    }
    
    // Notify display window of media update
    state.app_handle.emit_all("media-update", ())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(json!({
        "success": true,
        "files": uploaded_count
    })))
}

async fn delete_media(
    State(state): State<AppState>,
    Path(filename): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // TODO: Implement authentication check
    
    crate::media::delete_file(&filename).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    // Notify display window
    state.app_handle.emit_all("media-update", ())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(json!({ "success": true })))
}

async fn get_addons() -> Json<serde_json::Value> {
    // TODO: Implement addons loading
    Json(json!({}))
}

async fn update_addon(
    Path(id): Path<String>,
    Json(config): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // TODO: Implement addon config update
    Ok(Json(json!({ "success": true })))
}

async fn reload_addons() -> Json<serde_json::Value> {
    // TODO: Implement addons reloading
    Json(json!({ "success": true }))
}

async fn get_peers(State(state): State<AppState>) -> Json<Vec<crate::network::Peer>> {
    let config = state.config.lock().await;
    Json(config.peers.clone())
}

async fn add_peer(
    State(state): State<AppState>,
    Json(peer): Json<crate::network::Peer>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut config = state.config.lock().await;
    config.peers.push(peer);
    
    crate::config::save_to_file(&config).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(json!({ "success": true })))
}

async fn remove_peer(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut config = state.config.lock().await;
    config.peers.retain(|p| p.id != id);
    
    crate::config::save_to_file(&config).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    
    Ok(Json(json!({ "success": true })))
}

async fn upload_update(
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // TODO: Implement update upload and processing
    Ok(Json(json!({ "success": true })))
}