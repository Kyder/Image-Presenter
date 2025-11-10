use std::path::PathBuf;

/// Get the base application directory
/// In dev mode: project root (parent of src-tauri)
/// In production: directory containing the executable (for portable deployment)
pub fn get_app_dir() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        // Development mode
        let current = std::env::current_dir().map_err(|e| e.to_string())?;
        
        // If we're in src-tauri, go up one level to project root
        if current.ends_with("src-tauri") {
            let parent = current.parent()
                .ok_or("No parent directory")?
                .to_path_buf();
            println!("DEBUG Dev: App dir = {:?}", parent);
            Ok(parent)
        } else {
            println!("DEBUG Dev: App dir = {:?}", current);
            Ok(current)
        }
    } else {
        // Production mode - use directory containing the executable
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_dir = exe_path.parent()
            .ok_or("Failed to get parent directory")?
            .to_path_buf();
        
        // Remove the \\?\ prefix if present (Windows UNC path)
        let clean_path = if let Ok(canonical) = exe_dir.canonicalize() {
            let path_str = canonical.to_string_lossy();
            if path_str.starts_with(r"\\?\") {
                PathBuf::from(&path_str[4..])
            } else {
                canonical
            }
        } else {
            exe_dir
        };
        
        println!("DEBUG Prod: Exe path = {:?}", exe_path);
        println!("DEBUG Prod: App dir = {:?}", clean_path);
        Ok(clean_path)
    }
}

/// Get the Media directory path
pub fn get_media_dir() -> Result<PathBuf, String> {
    let base = get_app_dir()?;
    let media = base.join("Media");
    println!("DEBUG: Media dir = {:?}", media);
    Ok(media)
}

/// Get the Addons directory path
pub fn get_addons_dir() -> Result<PathBuf, String> {
    let base = get_app_dir()?;
    let addons = base.join("Addons");
    println!("DEBUG: Addons dir = {:?}", addons);
    Ok(addons)
}

/// Get the Fonts directory path
pub fn get_fonts_dir() -> Result<PathBuf, String> {
    let base = get_app_dir()?;
    let fonts = base.join("Fonts");
    println!("DEBUG: Fonts dir = {:?}", fonts);
    Ok(fonts)
}

/// Get the config file path
pub fn get_config_path() -> Result<PathBuf, String> {
    let base = get_app_dir()?;
    let config = base.join("config.json");
    println!("DEBUG: Config path = {:?}", config);
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_paths() {
        println!("App dir: {:?}", get_app_dir());
        println!("Media dir: {:?}", get_media_dir());
        println!("Addons dir: {:?}", get_addons_dir());
        println!("Fonts dir: {:?}", get_fonts_dir());
        println!("Config path: {:?}", get_config_path());
    }
}