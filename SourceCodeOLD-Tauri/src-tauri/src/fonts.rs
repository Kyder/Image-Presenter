use tokio::fs;

pub fn get_fonts_dir() -> Result<std::path::PathBuf, String> {
    crate::paths::get_fonts_dir()
}

pub async fn ensure_fonts_dir() -> Result<(), String> {
    let fonts_dir = get_fonts_dir()?;
    
    if !fonts_dir.exists() {
        fs::create_dir_all(&fonts_dir).await
            .map_err(|e| e.to_string())?;
        println!("Created Fonts directory: {:?}", fonts_dir);
    }
    
    Ok(())
}

pub async fn get_font_as_base64(font_name: &str) -> Result<String, String> {
    let fonts_dir = get_fonts_dir()?;
    let font_path = fonts_dir.join(font_name);
    
    if !font_path.exists() {
        return Err(format!("Font not found: {}", font_name));
    }
    
    let font_data = fs::read(&font_path).await
        .map_err(|e| e.to_string())?;
    
    let base64 = base64_encode(&font_data);
    
    // Determine MIME type based on extension
    let mime_type = if font_name.ends_with(".ttf") {
        "font/ttf"
    } else if font_name.ends_with(".otf") {
        "font/otf"
    } else if font_name.ends_with(".woff") {
        "font/woff"
    } else if font_name.ends_with(".woff2") {
        "font/woff2"
    } else {
        "application/octet-stream"
    };
    
    Ok(format!("data:{};base64,{}", mime_type, base64))
}

fn base64_encode(data: &[u8]) -> String {
    use std::fmt::Write;
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    
    let mut result = String::new();
    let mut i = 0;
    
    while i < data.len() {
        let b1 = data[i];
        let b2 = if i + 1 < data.len() { data[i + 1] } else { 0 };
        let b3 = if i + 2 < data.len() { data[i + 2] } else { 0 };
        
        let enc1 = (b1 >> 2) as usize;
        let enc2 = (((b1 & 0x3) << 4) | (b2 >> 4)) as usize;
        let enc3 = (((b2 & 0xf) << 2) | (b3 >> 6)) as usize;
        let enc4 = (b3 & 0x3f) as usize;
        
        write!(&mut result, "{}", CHARSET[enc1] as char).unwrap();
        write!(&mut result, "{}", CHARSET[enc2] as char).unwrap();
        
        if i + 1 < data.len() {
            write!(&mut result, "{}", CHARSET[enc3] as char).unwrap();
        } else {
            write!(&mut result, "=").unwrap();
        }
        
        if i + 2 < data.len() {
            write!(&mut result, "{}", CHARSET[enc4] as char).unwrap();
        } else {
            write!(&mut result, "=").unwrap();
        }
        
        i += 3;
    }
    
    result
}

pub async fn list_fonts() -> Result<Vec<String>, String> {
    let fonts_dir = get_fonts_dir()?;
    
    if !fonts_dir.exists() {
        return Ok(Vec::new());
    }
    
    let mut entries = fs::read_dir(&fonts_dir).await
        .map_err(|e| e.to_string())?;
    let mut fonts = Vec::new();
    
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        
        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_string_lossy().to_lowercase();
                if matches!(ext_str.as_str(), "ttf" | "otf" | "woff" | "woff2") {
                    if let Some(name) = path.file_name() {
                        fonts.push(name.to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    
    fonts.sort();
    Ok(fonts)
}