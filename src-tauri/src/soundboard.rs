use crate::database;
use crate::hotkeys::Hotkey;
use crate::audio;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tracing::info;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct AddSoundRequest {
    pub name: String,
    pub file_path: String,
    pub category: Option<String>,
    pub hotkey: Option<Hotkey>,
    pub volume: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct SoundResponse {
    pub id: String,
    pub name: String,
    pub display_name: Option<String>,
    pub file_path: String,
    pub category: Option<String>,
    pub hotkey: Option<Hotkey>,
    pub volume: f32,
    pub start_position: Option<f32>,
    pub duration: Option<f32>,
    pub created_at: String,
    pub updated_at: String,
    pub categories: Vec<String>,
}

impl From<database::Sound> for SoundResponse {
    fn from(sound: database::Sound) -> Self {
        let categories = database::get_sound_categories(&sound.id).unwrap_or_default();
        Self {
            id: sound.id,
            name: sound.name,
            display_name: sound.display_name,
            file_path: sound.file_path,
            category: sound.category,
            hotkey: sound.hotkey,
            volume: sound.volume,
            start_position: sound.start_position,
            duration: sound.duration,
            created_at: sound.created_at.to_rfc3339(),
            updated_at: sound.updated_at.to_rfc3339(),
            categories,
        }
    }
}

#[tauri::command]
pub async fn get_sounds() -> Result<Vec<SoundResponse>, String> {
    let sounds = database::get_sounds().map_err(|e| e.to_string())?;
    Ok(sounds.into_iter().map(SoundResponse::from).collect())
}

#[tauri::command]
pub async fn add_sound(request: AddSoundRequest) -> Result<SoundResponse, String> {
    info!("Adding new sound: {:?}", request);
    
    let duration = crate::audio::get_audio_duration(&request.file_path)
        .map_err(|e| format!("Failed to get audio duration: {}", e))?;

    let now = chrono::Utc::now();
    let sound = database::Sound {
        id: Uuid::new_v4().to_string(),
        name: request.name,
        display_name: None,
        file_path: request.file_path,
        category: request.category,
        hotkey: request.hotkey,
        volume: request.volume.unwrap_or(1.0).clamp(0.0, 1.0),
        start_position: None,
        duration: Some(duration),
        created_at: now,
        updated_at: now,
    };

    database::add_sound(&sound).map_err(|e| e.to_string())?;
    if let Some(cat) = &sound.category {
        let _ = database::set_sound_categories(&sound.id, &vec![cat.clone()]);
    }
    info!("Added new sound: {} (duration: {:.2}s)", sound.name, duration);

    Ok(SoundResponse::from(sound))
}

#[tauri::command]
pub async fn remove_sound(id: String, delete_file: Option<bool>) -> Result<(), String> {
    let _ = crate::audio::stop_sound_command(id.clone()).await;
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    let delete_file = delete_file.unwrap_or(false);
    if delete_file {
        if let Some(sound) = database::get_sound_by_id(&id).map_err(|e| e.to_string())? {
            if let Err(e) = std::fs::remove_file(&sound.file_path) {
                let kind = e.kind();
                if kind != std::io::ErrorKind::NotFound {
                    tracing::warn!("Failed to delete file '{}' (continuing with DB removal): {}", sound.file_path, e);
                }
            }
        }
    }
    database::remove_sound(&id).map_err(|e| e.to_string())?;
    info!("Removed sound with id: {} (delete_file: {})", id, delete_file);
    Ok(())
}

#[tauri::command]
pub async fn play_sound(id: String, state: tauri::State<'_, std::sync::Mutex<audio::AudioManager>>) -> Result<(), String> {
    let sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;

    let _ = crate::audio::stop_sound_command(id.clone()).await;

    crate::audio::play_audio_file_command(sound.file_path.clone(), id.clone(), sound.start_position, sound.volume, Some(false))
        .await
        .map_err(|e| e.to_string())?;

    let start_position = sound.start_position.unwrap_or(0.0);
    state.lock().unwrap().set_playback_position(&id, start_position);

    info!("Playing sound: {} (start: {:?}, volume: {})", sound.name, sound.start_position, sound.volume);
    Ok(())
}

#[tauri::command]
pub async fn stop_sound(id: String, state: tauri::State<'_, std::sync::Mutex<audio::AudioManager>>) -> Result<(), String> {
    let id_clone = id.clone();
    crate::audio::stop_sound_command(id.clone()).await?;
    state.lock().unwrap().clear_playback_position(&id);
    info!("Stopped sound with id: {}", id_clone);
    Ok(())
}

#[tauri::command]
pub async fn stop_all_sounds() -> Result<(), String> {
    crate::audio::stop_all_sounds_command().await?;
    info!("Stopped all sounds");
    Ok(())
}


#[tauri::command]
pub async fn get_categories() -> Result<Vec<database::Category>, String> {
    database::get_categories().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_category(name: String, color: Option<String>) -> Result<database::Category, String> {
    let now = chrono::Utc::now();
    let category = database::Category {
        id: Uuid::new_v4().to_string(),
        name,
        color,
        created_at: now,
    };

    database::add_category(&category).map_err(|e| e.to_string())?;
    info!("Added new category: {}", category.name);

    Ok(category)
}

#[tauri::command]
pub async fn remove_category(id: String) -> Result<(), String> {
    database::remove_category(&id).map_err(|e| e.to_string())?;
    info!("Removed category with id: {}", id);
    Ok(())
}
//end todo

#[tauri::command]
pub async fn import_audio_file(file_path: String) -> Result<SoundResponse, String> {
    info!("Importing audio file: {}", file_path);
    
    let path = std::path::Path::new(&file_path);
    
    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    let name = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Unknown")
        .to_string();

    info!("Extracted name: {}", name);

    let request = AddSoundRequest {
        name,
        file_path,
        category: None,
        hotkey: None,
        volume: Some(1.0),
    };

    info!("Calling add_sound with request: {:?}", request);
    add_sound(request).await
}

#[tauri::command]
pub async fn update_sound_volume(id: String, volume: f32) -> Result<(), String> {
    info!("Received volume update request for sound {}: {}", id, volume);
    
    let mut sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;

    sound.volume = volume.clamp(0.0, 1.0);
    sound.updated_at = chrono::Utc::now();

    database::add_sound(&sound).map_err(|e| e.to_string())?;
    
    let _ = crate::audio::update_sound_volume_command(id.clone(), sound.volume).await;
    
    info!("Updated volume for sound: {}", sound.name);
    Ok(())
}

//todo add hotkeys and category
#[tauri::command]
pub async fn update_sound_hotkey(_app: tauri::AppHandle, id: String, new_hotkey: Option<Hotkey>) -> Result<(), String> {
    info!("[backend] update_sound_hotkey called: sound_id={} new_hotkey={:?}", id, new_hotkey);
    let sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;
    let mut updated_sound = sound.clone();
    updated_sound.hotkey = new_hotkey.clone();
    updated_sound.updated_at = chrono::Utc::now();
    info!("[backend] Updating sound in database: id={}, hotkey={:?}", id, new_hotkey);
    database::add_sound(&updated_sound).map_err(|e| e.to_string())?;
    info!("[backend] Sound updated in database successfully");
    if let Some(controller) = crate::hotkeys::HOTKEY_MANAGER.get() {
        let binding_id = format!("sound_{}", id);
        let _ = controller.remove_binding(&binding_id);
        if let Some(hotkey) = new_hotkey {
            let _ = controller.add_binding(hotkey.key, hotkey.modifiers, crate::hotkeys::HotkeyAction::PlaySound { sound_id: id.clone() }, Some(id));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn update_sound_display_name(id: String, display_name: Option<String>) -> Result<(), String> {
    database::update_sound_display_name(&id, display_name.as_deref())
        .map_err(|e| e.to_string())?;
    info!("Updated display name for sound: {}", id);
    Ok(())
}

#[tauri::command]
pub async fn update_sound_category(id: String, category: Option<String>) -> Result<(), String> {
    let mut sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;

    sound.category = category;
    sound.updated_at = chrono::Utc::now();

    database::add_sound(&sound).map_err(|e| e.to_string())?;
    info!("Updated category for sound: {}", sound.name);
    Ok(())
}

#[tauri::command]
pub async fn update_sound_categories(id: String, categories: Vec<String>) -> Result<(), String> {
    let mut sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;
    // keep legacy single category (legacy)
    sound.category = categories.get(0).cloned();
    sound.updated_at = chrono::Utc::now();
    database::add_sound(&sound).map_err(|e| e.to_string())?;

    database::set_sound_categories(&id, &categories).map_err(|e| e.to_string())?;
    info!("Updated categories for sound: {} -> {:?}", sound.name, categories);
    Ok(())
}
//end todo

#[tauri::command]
pub async fn play_sound_local(id: String) -> Result<(), String> {
    let sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;

    let _ = crate::audio::stop_sound_command(id.clone()).await;

    crate::audio::play_audio_file_command(sound.file_path, id, sound.start_position, sound.volume, Some(true))
        .await
        .map_err(|e| e.to_string())?;

    info!("Playing sound locally: {} (start: {:?}, volume: {})", sound.name, sound.start_position, sound.volume);
    Ok(())
}

#[tauri::command]
pub async fn update_sound_start_position(id: String, start_position: f32) -> Result<(), String> {
    info!("Received start position update request for sound {}: {}", id, start_position);
    
    let mut sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;

    sound.start_position = Some(start_position.max(0.0));
    sound.updated_at = chrono::Utc::now();

    database::add_sound(&sound).map_err(|e| e.to_string())?;
    info!("Updated start position for sound: {}", sound.name);
    Ok(())
}

#[tauri::command]
pub async fn get_playing_sounds() -> Result<Vec<String>, String> {
    let playing_sounds = crate::audio::get_playing_sounds_command().await?;
    Ok(playing_sounds)
}

#[tauri::command]
pub async fn seek_sound(id: String, position: f32, local_only: bool) -> Result<(), String> {
    let sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;

    crate::audio::restart_sound_from_position(id, sound.file_path, position, sound.volume, local_only)
        .await
        .map_err(|e| e.to_string())?;

    info!("Seeking sound {} to position {} (local_only: {})", sound.name, position, local_only);
    Ok(())
}

#[tauri::command]
pub async fn remove_all_sounds() -> Result<(), String> {
    let _ = crate::audio::stop_all_sounds_command().await;
    crate::database::remove_all_sounds().map_err(|e| e.to_string())?;
    tracing::info!("Removed all sounds from database");
    Ok(())
}