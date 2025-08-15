use tauri::{AppHandle, Window, Manager};
use crate::database;
use crate::external;
use tracing::info;
use std::sync::Arc;
use std::process::Command;

static DEPENDENCY_MANAGER: std::sync::OnceLock<Arc<external::dependencies::DependencyManager>> = std::sync::OnceLock::new();

fn get_dependency_manager() -> Result<Arc<external::dependencies::DependencyManager>, String> {
    DEPENDENCY_MANAGER.get_or_init(|| {
        external::dependencies::DependencyManager::new()
            .map(Arc::new)
            .expect("Failed to initialize dependency manager")
    });
    Ok(DEPENDENCY_MANAGER.get().unwrap().clone())
}

#[tauri::command]
pub async fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory: {}", e))
}

#[tauri::command]
pub async fn save_setting(key: String, value: String) -> Result<(), String> {
    database::save_setting(&key, &value)
        .map_err(|e| format!("Failed to save setting: {}", e))
}

#[tauri::command]
pub async fn get_setting(key: String) -> Result<Option<String>, String> {
    database::get_setting(&key)
        .map_err(|e| format!("Failed to get setting: {}", e))
}

#[tauri::command]
pub async fn minimize_window(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| format!("Failed to minimize window: {}", e))
}

#[tauri::command]
pub async fn close_window(window: Window) -> Result<(), String> {
    window.close().map_err(|e| format!("Failed to close window: {}", e))
}

#[tauri::command]
pub async fn toggle_maximize(window: Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| format!("Failed to unmaximize window: {}", e))
    } else {
        window.maximize().map_err(|e| format!("Failed to maximize window: {}", e))
    }
}

#[tauri::command]
pub async fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

#[tauri::command]
pub async fn register_global_shortcut(_app: AppHandle, hotkey: String) -> Result<(), String> {
    info!("Global shortcut registration requested: {}", hotkey);
    Ok(())
}

#[tauri::command]
pub async fn test_hotkey(_app: AppHandle, hotkey: String) -> Result<(), String> {
    info!("Testing hotkey: {}", hotkey);
    Ok(())
}

async fn process_dependency<F, Fut>(
    app_handle: AppHandle,
    dep_manager: Arc<external::dependencies::DependencyManager>,
    dep_type: external::dependencies::DependencyType, 
    operation: F,
    result: &mut serde_json::Map<String, serde_json::Value>
) 
where
    F: FnOnce(AppHandle, Arc<external::dependencies::DependencyManager>, external::dependencies::DependencyType) -> Fut + 'static,
    Fut: std::future::Future<Output = Result<std::path::PathBuf, String>> + 'static,
{
    match operation(app_handle, dep_manager, dep_type).await {
        Ok(path) => {
            result.insert(dep_type.name().to_string(), serde_json::json!({
                "available": true,
                "path": path.to_string_lossy().to_string()
            }));
        }
        Err(e) => {
            result.insert(dep_type.name().to_string(), serde_json::json!({
                "available": false,
                "error": e.to_string()
            }));
        }
    }
}

#[tauri::command]
pub async fn check_dependencies(app: AppHandle) -> Result<serde_json::Value, String> {
    use crate::external::dependencies::DependencyType;
    println!("Starting dependency check...");
    let dep_manager = get_dependency_manager()?;
    let mut result = serde_json::Map::new();
    for dep_type in [DependencyType::YtDlp, DependencyType::Ffmpeg] {
        println!("Checking dependency: {}", dep_type.name());
        process_dependency(app.clone(), dep_manager.clone(), dep_type, |app_handle, dm, dep_type| async move {
            dm.find_dependency(&app_handle, dep_type).await
                .map_err(|e| e.to_string())
        }, &mut result).await;
    }
    println!("Dependency check result: {:?}", result);
    Ok(serde_json::Value::Object(result))
}

#[tauri::command]
pub async fn download_dependencies(app: AppHandle) -> Result<serde_json::Value, String> {
    use crate::external::dependencies::DependencyType;
    let dep_manager = get_dependency_manager()?;
    let mut result = serde_json::Map::new();
    process_dependency(app.clone(), dep_manager.clone(), DependencyType::YtDlp, |app_handle, dm, dep_type| async move { 
        dm.ensure_dependency(&app_handle, dep_type).await.map_err(|e| e.to_string()) 
    }, &mut result).await;
    process_dependency(app.clone(), dep_manager.clone(), DependencyType::Ffmpeg, |app_handle, dm, dep_type| async move { 
        dm.ensure_dependency(&app_handle, dep_type).await.map_err(|e| e.to_string()) 
    }, &mut result).await;
    Ok(serde_json::Value::Object(result))
}

#[tauri::command]
pub async fn update_yt_dlp(app: AppHandle) -> Result<String, String> {
    use crate::external::dependencies::{DependencyManager, DependencyType, call_shell_process};
    
    let dep_manager = DependencyManager::new().map_err(|e| e.to_string())?;
    
    match dep_manager.find_dependency(&app, DependencyType::YtDlp).await {
        Ok(yt_dlp_path) => {
            let result = call_shell_process(
                &app,
                &yt_dlp_path.to_string_lossy(),
                &["--update"],
                None,
                60,
            ).await.map_err(|e| format!("Failed to update yt-dlp: {}", e))?;
            
            if result.exit_code == Some(0) {
                Ok(format!("yt-dlp updated successfully: {}", result.stdout))
            } else {
                Err(format!("yt-dlp update failed: {}", result.stderr))
            }
        }
        Err(_) => {
            Err("yt-dlp not found. Please install it first.".to_string())
        }
    }
}

#[tauri::command]
pub async fn open_browser(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(&["/C", "start", &url])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }
    
    Ok(())
} 