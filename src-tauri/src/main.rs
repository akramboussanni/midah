// rm console win
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod external;
mod database;
mod soundboard;

use external::*;

use tauri::Manager;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use std::sync::Arc;
use external::dependencies::DependencyManager;

static DEPENDENCY_MANAGER: std::sync::OnceLock<Arc<DependencyManager>> = std::sync::OnceLock::new();

fn get_dependency_manager() -> Result<Arc<DependencyManager>, String> {
    DEPENDENCY_MANAGER.get_or_init(|| {
        DependencyManager::new()
            .map(Arc::new)
            .expect("Failed to initialize dependency manager")
    });
    Ok(DEPENDENCY_MANAGER.get().unwrap().clone())
}

#[tauri::command]
async fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data_dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn create_directory(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory: {}", e))
}

#[tauri::command]
async fn save_setting(key: String, value: String) -> Result<(), String> {
    database::save_setting(&key, &value)
        .map_err(|e| format!("Failed to save setting: {}", e))
}

#[tauri::command]
async fn get_setting(key: String) -> Result<Option<String>, String> {
    database::get_setting(&key)
        .map_err(|e| format!("Failed to get setting: {}", e))
}

#[tauri::command]
async fn minimize_window(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| format!("Failed to minimize window: {}", e))
}

#[tauri::command]
async fn close_window(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| format!("Failed to close window: {}", e))
}

#[tauri::command]
async fn toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| format!("Failed to unmaximize window: {}", e))
    } else {
        window.maximize().map_err(|e| format!("Failed to maximize window: {}", e))
    }
}

#[tauri::command]
async fn get_app_version() -> Result<String, String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}

async fn process_dependency<F, Fut>(
    app_handle: tauri::AppHandle,
    dep_manager: Arc<external::dependencies::DependencyManager>,
    dep_type: external::dependencies::DependencyType, 
    operation: F,
    result: &mut serde_json::Map<String, serde_json::Value>
) 
where
    F: FnOnce(tauri::AppHandle, Arc<external::dependencies::DependencyManager>, external::dependencies::DependencyType) -> Fut + 'static,
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
async fn check_dependencies(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use external::dependencies::DependencyType;
    
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
async fn download_dependencies(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    use external::dependencies::DependencyType;
    
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

fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    std::thread::spawn(|| { audio::get_audio_manager(); });
    audio::get_audio_engine();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(std::sync::Mutex::new(audio::AudioManager::new().expect("Failed to initialize AudioManager")))
        .setup(|app| {
            let db_path = app.path().app_data_dir().unwrap().join("soundboard.db");
            database::init_database(&db_path)?;

            let youtube_api_key = database::get_setting("youtube_api_key")
                .unwrap_or_else(|_| None)
                .unwrap_or_else(|| String::new());
            external::youtube::init_youtube_service(youtube_api_key)?;

            println!("Tauri app initialized successfully!");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            audio::get_audio_devices,
            audio::set_virtual_device,
            audio::set_output_device,
            audio::get_virtual_volume,
            audio::set_virtual_volume,
            audio::get_output_volume,
            audio::set_output_volume,
            audio::list_all_devices,
            audio::get_audio_status,
            audio::play_audio_file_command,
            audio::stop_sound_command,
            audio::stop_all_sounds_command,
            audio::update_sound_volume_command,
            audio::update_device_volumes_command,
            audio::get_playing_sounds_command,
            audio::get_playback_position,
            audio::restart_sound_from_position,
            soundboard::get_sounds,
            soundboard::add_sound,
            soundboard::remove_sound,
            soundboard::remove_all_sounds,
            soundboard::play_sound,
            soundboard::stop_sound,
            soundboard::stop_all_sounds,
            soundboard::get_categories,
            soundboard::add_category,
            soundboard::remove_category,
            soundboard::import_audio_file,
            soundboard::update_sound_volume,
            soundboard::update_sound_hotkey,
            soundboard::update_sound_category,
            soundboard::play_sound_local,
            soundboard::update_sound_start_position,
            soundboard::get_playing_sounds,
            soundboard::seek_sound,
            get_app_data_dir,
            create_directory,
            save_setting,
            get_setting,
            minimize_window,
            close_window,
            toggle_maximize,
            get_app_version,
            check_dependencies,
            download_dependencies,
            external::vbcable::check_virtual_cable,
            external::vbcable::install_virtual_cable,
            external::youtube::search_videos,
            external::youtube::get_video_info,
            external::youtube::get_video_info_by_url,
            external::youtube::download_video,
            external::youtube::update_youtube_api_key,
            external::youtube::get_youtube_api_key,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri app")
        .run(|_app_handle, _event| {
        });
}
