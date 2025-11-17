-- Scheduled Restart Addon Backend (Lua)
-- Handles dynamic font list generation and PC restart command

-- Helper function to scan directory for files
local function scan_directory(path, extensions)
local files = addon.list_directory(path)
    
    if handle then
        for file in handle:lines() do
            local ext = file:match("%.([^%.]+)$")
            if ext then
                ext = ext:lower()
                for _, valid_ext in ipairs(extensions) do
                    if ext == valid_ext then
                        table.insert(files, file)
                        break
                    end
                end
            end
        end
        handle:close()
    end
    
    return files
end

-- Helper function to create font label from filename
local function create_font_label(filename)
    local label = filename
    label = label:gsub("%.ttf$", "")
    label = label:gsub("%.otf$", "")
    label = label:gsub("%.woff2$", "")
    label = label:gsub("%.woff$", "")
    label = label:gsub("%-", " ")
    label = label:gsub("_", " ")
    return label
end

-- Function to restart PC (cross-platform)
function restart_pc()
    addon.print("Restarting PC...")
    
    -- Detect OS and execute appropriate command
    local is_windows = package.config:sub(1,1) == '\\'
    
    if is_windows then
        -- Windows restart command
        addon.print("Executing Windows restart: shutdown /r /t 0")
        local success, stdout, stderr = addon.execute_command("shutdown", {"/r", "/t", "0"})
        
        if success then
            addon.print("Restart command executed successfully")
            return true
        else
            addon.print("Failed to restart: " .. stderr)
            return false
        end
    else
        -- Linux/Unix restart command
        addon.print("Executing Linux/Unix restart: shutdown -r now")
        local success, stdout, stderr = addon.execute_command("shutdown", {"-r", "now"})
        
        if success then
            addon.print("Restart command executed successfully")
            return true
        else
            addon.print("Failed to restart: " .. stderr)
            return false
        end
    end
end

-- Initialize function called by Rust during addon scanning
function init(settings)
    addon.print("Scheduled Restart backend initializing...")
    
    -- Get fonts directory
    local fonts_dir = addon.get_fonts_dir()
    addon.print("Fonts directory: " .. fonts_dir)
    
    -- Scan for font files
    local font_extensions = {"ttf", "otf", "woff", "woff2"}
    local font_files = scan_directory(fonts_dir, font_extensions)
    
    addon.print("Found " .. #font_files .. " font files")
    
    -- Create options list
    local font_options = {}
    
    -- Add default option
    table.insert(font_options, '{"value":"default","label":"Default (Arial)"}')
    
    -- Add found fonts
    for _, font_file in ipairs(font_files) do
        local label = create_font_label(font_file)
        local option_json = string.format('{"value":"%s","label":"%s"}', font_file, label)
        table.insert(font_options, option_json)
        addon.print("  - " .. label .. " (" .. font_file .. ")")
    end
    
    -- Find and update the font setting
    for i = 1, #settings do
        local setting = settings[i]
        if setting.id == "font" then
            addon.print("Updating font setting with " .. #font_options .. " options")
            
            -- Create options table
            local options_table = {}
            for j, opt in ipairs(font_options) do
                options_table[j] = opt
            end
            
            setting.options = options_table
            break
        end
    end
    
    addon.print("Scheduled Restart backend initialization complete")
    return settings
end