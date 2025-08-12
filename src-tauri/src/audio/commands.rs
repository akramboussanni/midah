use crate::audio::{AudioDevice, get_audio_manager, get_audio_engine, AudioCommand};
use cpal::traits::{HostTrait, DeviceTrait};

#[tauri::command]
pub async fn get_audio_devices() -> Result<Vec<AudioDevice>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let host = cpal::default_host();
        let mut audio_devices = Vec::new();
        
        if let Ok(output_devices) = host.output_devices() {
            let default_output_device = host.default_output_device();
            for device in output_devices {
                let name = device.name().unwrap_or_default();
                let is_default = default_output_device
                    .as_ref()
                    .map(|d| d.name().unwrap_or_default() == name)
                    .unwrap_or(false);
                
                let device_type = if name.to_lowercase().contains("cable") || 
                                    name.to_lowercase().contains("vb-audio") || 
                                    name.to_lowercase().contains("virtual") || 
                                    name.to_lowercase().contains("vb-cable") {
                    "virtual".to_string()
                } else {
                    "output".to_string()
                };
                
                audio_devices.push(AudioDevice { 
                    name, 
                    is_default, 
                    device_type
                });
            }
        }

        if let Ok(input_devices) = host.input_devices() {
            let default_input_device = host.default_input_device();
            for device in input_devices {
                let name = device.name().unwrap_or_default();
                let is_default = default_input_device
                    .as_ref()
                    .map(|d| d.name().unwrap_or_default() == name)
                    .unwrap_or(false);
                audio_devices.push(AudioDevice { name, is_default, device_type: "input".to_string() });
            }
        }
        Ok(audio_devices)
    }).await.unwrap()
}

#[tauri::command]
pub async fn set_virtual_device(device_name: String) -> Result<(), String> {
    let manager = get_audio_manager();
    manager
        .set_virtual_device(&device_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_output_device(device_name: String) -> Result<(), String> {
    let manager = get_audio_manager();
    manager
        .set_output_device(&device_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_input_device(device_name: String) -> Result<(), String> {
    let manager = get_audio_manager();
    manager
        .set_input_device(&device_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_virtual_volume() -> Result<f32, String> {
    let manager = get_audio_manager();
    Ok(manager.get_virtual_volume())
}

#[tauri::command]
pub async fn set_virtual_volume(volume: f32) -> Result<(), String> {
    let manager = get_audio_manager();
    manager
        .set_virtual_volume(volume)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_output_volume() -> Result<f32, String> {
    let manager = get_audio_manager();
    Ok(manager.get_output_volume())
}

#[tauri::command]
pub async fn set_output_volume(volume: f32) -> Result<(), String> {
    let manager = get_audio_manager();
    manager
        .set_output_volume(volume)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_input_volume() -> Result<f32, String> {
    let manager = get_audio_manager();
    Ok(manager.get_input_volume())
}

#[tauri::command]
pub async fn set_input_volume(volume: f32) -> Result<(), String> {
    let manager = get_audio_manager();
    manager
        .set_input_volume(volume)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_input_capture() -> Result<(), String> {
    let manager = get_audio_manager();
    manager.start_input_capture().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_input_capture() -> Result<(), String> {
    let manager = get_audio_manager();
    manager.stop_input_capture().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_all_devices() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let host = cpal::default_host();
        let mut device_list = String::new();
        
        device_list.push_str("=== OUTPUT DEVICES ===\n");
        if let Ok(output_devices) = host.output_devices() {
            for device in output_devices {
                let name = device.name().unwrap_or_default();
                device_list.push_str(&format!("- {}\n", name));
            }
        } else {
            device_list.push_str("Failed to get output devices\n");
        }
        
        Ok(device_list)
    }).await.unwrap()
}

#[tauri::command]
pub async fn get_audio_status() -> Result<String, String> {
    let manager = get_audio_manager();
    
    let virtual_device = manager.get_virtual_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_else(|| "None".to_string());
    let output_device = manager.get_output_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_else(|| "None".to_string());
    
    let virtual_volume = manager.get_virtual_volume();
    let output_volume = manager.get_output_volume();
    
    let status = format!(
        "Virtual Device: {} (Volume: {:.2})\nOutput Device: {} (Volume: {:.2})",
        virtual_device, virtual_volume, output_device, output_volume
    );
    
    Ok(status)
}

#[tauri::command]
pub async fn play_audio_file_command(file_path: String, sound_id: String, start_position: Option<f32>, sound_volume: f32, local_only: Option<bool>) -> Result<(), String> {
    get_audio_engine().send_command(AudioCommand::Play {
        file_path,
        sound_id,
        start_position,
        sound_volume,
        local_only: local_only.unwrap_or(false),
    });
    Ok(())
}

#[tauri::command]
pub async fn stop_sound_command(sound_id: String) -> Result<(), String> {
    get_audio_engine().send_command(AudioCommand::Stop { sound_id });
    Ok(())
}

#[tauri::command]
pub async fn stop_all_sounds_command() -> Result<(), String> {
    get_audio_engine().send_command(AudioCommand::StopAll);
    Ok(())
}

#[tauri::command]
pub async fn update_sound_volume_command(sound_id: String, sound_volume: f32) -> Result<(), String> {
    get_audio_engine().send_command(AudioCommand::UpdateSoundVolume { sound_id, sound_volume });
    Ok(())
}

#[tauri::command]
pub async fn update_device_volumes_command() -> Result<(), String> {
    get_audio_engine().send_command(AudioCommand::UpdateDeviceVolumes);
    Ok(())
}

#[tauri::command]
pub async fn get_playing_sounds_command() -> Result<Vec<String>, String> {
    Ok(get_audio_engine().get_playing_sounds())
}

#[tauri::command]
pub async fn get_playback_position(sound_id: String) -> Result<Option<f32>, String> {
    Ok(get_audio_engine().get_playback_position(&sound_id))
}

#[tauri::command]
pub async fn restart_sound_from_position(sound_id: String, file_path: String, position: f32, sound_volume: f32, local_only: bool) -> Result<(), String> {
    get_audio_engine().send_command(AudioCommand::Play {
        file_path,
        sound_id,
        start_position: Some(position),
        sound_volume,
        local_only,
    });
    Ok(())
} 