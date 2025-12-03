use serde::{Deserialize, Serialize};
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFile {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub file_type: String,
    pub size: u64,
    pub modified: String,
}

pub fn get_media_dir() -> Result<std::path::PathBuf, String> {
    crate::paths::get_media_dir()
}

pub async fn get_files() -> Result<Vec<MediaFile>, String> {
    let media_dir = get_media_dir()?;
    
    if !media_dir.exists() {
        println!("DEBUG: Creating Media directory...");
        fs::create_dir_all(&media_dir).await
            .map_err(|e| format!("Failed to create Media directory: {}", e))?;
        println!("DEBUG: Media directory created");
        return Ok(Vec::new());
    }
    
    let mut entries = fs::read_dir(&media_dir).await
        .map_err(|e| format!("Failed to read Media directory: {}", e))?;
    let mut files = Vec::new();
    
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        
        if path.is_dir() {
            continue;
        }
        
        if let Some(ext) = path.extension() {
            let ext_str = ext.to_string_lossy().to_lowercase();
            
            let file_type = match ext_str.as_str() {
                "svg" | "png" | "jpg" | "jpeg" => "image",
                "mp4" => "video",
                _ => continue,
            };
            
            let metadata = entry.metadata().await.map_err(|e| e.to_string())?;
            let modified = metadata.modified().map_err(|e| e.to_string())?;
            
            files.push(MediaFile {
                name: entry.file_name().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                file_type: file_type.to_string(),
                size: metadata.len(),
                modified: format!("{:?}", modified),
            });
        }
    }
    
    files.sort_by(|a, b| a.name.cmp(&b.name));
    
    println!("DEBUG: Found {} media files", files.len());
    
    Ok(files)
}

pub async fn delete_file(filename: &str) -> Result<(), String> {
    let media_dir = get_media_dir()?;
    let file_path = media_dir.join(filename);
    
    if !file_path.starts_with(&media_dir) {
        return Err("Invalid file path".to_string());
    }
    
    if !file_path.exists() {
        return Err("File not found".to_string());
    }
    
    fs::remove_file(&file_path).await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

pub async fn save_file(filename: &str, data: &[u8]) -> Result<(), String> {
    let media_dir = get_media_dir()?;
    let file_path = media_dir.join(filename);
    
    if !file_path.starts_with(&media_dir) {
        return Err("Invalid file path".to_string());
    }
    
    if !media_dir.exists() {
        fs::create_dir_all(&media_dir).await
            .map_err(|e| e.to_string())?;
    }
    
    fs::write(&file_path, data).await
        .map_err(|e| e.to_string())?;
    
    Ok(())
}