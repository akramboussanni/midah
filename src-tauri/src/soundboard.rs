use anyhow::Result;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::info;
use uuid::Uuid;
use crate::database;
use crate::audio;

#[derive(Debug, Deserialize)]
pub struct AddSoundRequest {
    pub name: String,
    pub file_path: String,
    pub category: Option<String>,
    pub hotkey: Option<String>,
    pub volume: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct SoundResponse {
    pub id: String,
    pub name: String,
    pub file_path: String,
    pub category: Option<String>,
    pub hotkey: Option<String>,
    pub volume: f32,
    pub start_position: Option<f32>,
    pub duration: Option<f32>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<database::Sound> for SoundResponse {
    fn from(sound: database::Sound) -> Self {
        Self {
            id: sound.id,
            name: sound.name,
            file_path: sound.file_path,
            category: sound.category,
            hotkey: sound.hotkey,
            volume: sound.volume,
            start_position: sound.start_position,
            duration: sound.duration,
            created_at: sound.created_at.to_rfc3339(),
            updated_at: sound.updated_at.to_rfc3339(),
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
    
    let duration = audio::get_audio_duration(&request.file_path)
        .map_err(|e| format!("Failed to get audio duration: {}", e))?;

    let now = Utc::now();
    let sound = database::Sound {
        id: Uuid::new_v4().to_string(),
        name: request.name,
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
    info!("Added new sound: {} (duration: {:.2}s)", sound.name, duration);

    Ok(SoundResponse::from(sound))
}

#[tauri::command]
pub async fn remove_sound(id: String) -> Result<(), String> {
    let _ = audio::stop_sound_command(id.clone()).await;
    
    database::remove_sound(&id).map_err(|e| e.to_string())?;
    info!("Removed sound with id: {}", id);
    Ok(())
}

#[tauri::command]
pub async fn play_sound(id: String, state: tauri::State<'_, std::sync::Mutex<audio::AudioManager>>) -> Result<(), String> {
    let sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;

    let _ = audio::stop_sound_command(id.clone()).await;

    audio::play_audio_file_command(sound.file_path.clone(), id.clone(), sound.start_position, sound.volume, Some(false))
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
    audio::stop_sound_command(id.clone()).await?;
    // Clear playback position
    state.lock().unwrap().clear_playback_position(&id);
    info!("Stopped sound with id: {}", id_clone);
    Ok(())
}

#[tauri::command]
pub async fn stop_all_sounds() -> Result<(), String> {
    audio::stop_all_sounds_command().await?;
    info!("Stopped all sounds");
    Ok(())
}

//todo finish categories
#[tauri::command]
pub async fn get_categories() -> Result<Vec<database::Category>, String> {
    database::get_categories().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_category(name: String, color: Option<String>) -> Result<database::Category, String> {
    let now = Utc::now();
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
    
    let path = Path::new(&file_path);
    
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
    sound.updated_at = Utc::now();

    database::add_sound(&sound).map_err(|e| e.to_string())?;
    
    // Update the volume of the sound if it's currently playing
    let _ = audio::update_sound_volume_command(id.clone(), sound.volume).await;
    
    info!("Updated volume for sound: {}", sound.name);
    Ok(())
}

//todo add hotkeys and category
#[tauri::command]
pub async fn update_sound_hotkey(id: String, hotkey: Option<String>) -> Result<(), String> {
    let mut sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;

    sound.hotkey = hotkey;
    sound.updated_at = Utc::now();

    database::add_sound(&sound).map_err(|e| e.to_string())?;
    info!("Updated hotkey for sound: {}", sound.name);
    Ok(())
}

#[tauri::command]
pub async fn update_sound_category(id: String, category: Option<String>) -> Result<(), String> {
    let mut sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;

    sound.category = category;
    sound.updated_at = Utc::now();

    database::add_sound(&sound).map_err(|e| e.to_string())?;
    info!("Updated category for sound: {}", sound.name);
    Ok(())
}
//end todo

#[tauri::command]
pub async fn play_sound_local(id: String) -> Result<(), String> {
    let sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;

    let _ = audio::stop_sound_command(id.clone()).await;

    audio::play_audio_file_command(sound.file_path, id, sound.start_position, sound.volume, Some(true))
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
    sound.updated_at = Utc::now();

    database::add_sound(&sound).map_err(|e| e.to_string())?;
    info!("Updated start position for sound: {}", sound.name);
    Ok(())
}

#[tauri::command]
pub async fn get_playing_sounds() -> Result<Vec<String>, String> {
    let playing_sounds = audio::get_playing_sounds_command().await?;
    Ok(playing_sounds)
}

#[tauri::command]
pub async fn seek_sound(id: String, position: f32, local_only: bool) -> Result<(), String> {
    let sound = database::get_sound_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or("Sound not found")?;

    audio::restart_sound_from_position(id, sound.file_path, position, sound.volume, local_only)
        .await
        .map_err(|e| e.to_string())?;

    info!("Seeking sound {} to position {} (local_only: {})", sound.name, position, local_only);
    Ok(())
}

#[tauri::command]
pub async fn remove_all_sounds() -> Result<(), String> {
    // Stop all currently playing sounds
    let _ = crate::audio::stop_all_sounds_command().await;
    // Remove all sounds from the database
    crate::database::remove_all_sounds().map_err(|e| e.to_string())?;
    tracing::info!("Removed all sounds from database");
    Ok(())
}

//todo hotkeys
pub fn register_hotkeys() -> Result<()> {
    info!("Hotkey registration not yet implemented");
    Ok(())
}

pub fn unregister_hotkeys() -> Result<()> {
    info!("Hotkey unregistration not yet implemented");
    Ok(())
} 
//end todo