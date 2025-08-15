use serde::Serialize;

#[cfg(target_os = "linux")]
use crate::external::pipewire;
#[cfg(target_os = "windows")]
use crate::external::vbcable;

#[derive(Debug, Serialize)]
pub struct VirtualAudioStatus {
    pub platform: String,
    pub available: bool,
    pub device_name: Option<String>,
    pub is_special_device: bool,
    pub message: Option<String>,
    pub installation_required: bool,
}

#[tauri::command]
pub async fn check_virtual_audio_status() -> Result<VirtualAudioStatus, String> {
    let platform = std::env::consts::OS.to_string();
    
    match std::env::consts::OS {
        "windows" => {
            #[cfg(target_os = "windows")]
            {
                let vb_status = vbcable::check_virtual_cable().await
                    .map_err(|e| format!("Failed to check VB-Cable: {}", e))?;
                
                Ok(VirtualAudioStatus {
                    platform,
                    available: vb_status.found,
                    device_name: vb_status.device_name,
                    is_special_device: vb_status.is_voicemod,
                    message: vb_status.message,
                    installation_required: !vb_status.found,
                })
            }
            #[cfg(not(target_os = "windows"))]
            {
                Ok(VirtualAudioStatus {
                    platform,
                    available: false,
                    device_name: None,
                    is_special_device: false,
                    message: Some("VB-Cable is only supported on Windows".to_string()),
                    installation_required: false,
                })
            }
        }
        "linux" => {
            #[cfg(target_os = "linux")]
            {
                let pw_status = pipewire::check_pipewire_status().await
                    .map_err(|e| format!("Failed to check PipeWire: {}", e))?;
                
                Ok(VirtualAudioStatus {
                    platform,
                    available: pw_status.virtual_sink_available,
                    device_name: pw_status.virtual_sink_name,
                    is_special_device: false,
                    message: pw_status.installation_message,
                    installation_required: !pw_status.pipewire_available || !pw_status.virtual_sink_available,
                })
            }
            #[cfg(not(target_os = "linux"))]
            {
                Ok(VirtualAudioStatus {
                    platform,
                    available: false,
                    device_name: None,
                    is_special_device: false,
                    message: Some("PipeWire is only supported on Linux".to_string()),
                    installation_required: false,
                })
            }
        }
        "macos" => {
            Ok(VirtualAudioStatus {
                platform,
                available: false,
                device_name: None,
                is_special_device: false,
                message: Some("Virtual audio setup for macOS is not yet implemented. You can use applications like BlackHole manually.".to_string()),
                installation_required: false,
            })
        }
        _ => {
                            Ok(VirtualAudioStatus {
                    platform: platform.clone(),
                    available: false,
                    device_name: None,
                    is_special_device: false,
                    message: Some(format!("Virtual audio is not supported on {}", platform)),
                    installation_required: false,
                })
        }
    }
}

#[tauri::command]
pub async fn setup_virtual_audio() -> Result<String, String> {
    match std::env::consts::OS {
        "windows" => {
            #[cfg(target_os = "windows")]
            {
                vbcable::install_virtual_cable().await
            }
            #[cfg(not(target_os = "windows"))]
            {
                Err("VB-Cable installation is only supported on Windows".to_string())
            }
        }
        "linux" => {
            #[cfg(target_os = "linux")]
            {
                pipewire::setup_pipewire_virtual_sink().await
            }
            #[cfg(not(target_os = "linux"))]
            {
                Err("PipeWire virtual sink setup is only supported on Linux".to_string())
            }
        }
        _ => {
            Err(format!("Virtual audio setup is not supported on {}", std::env::consts::OS))
        }
    }
}

pub fn is_virtual_audio_device(device_name: &str) -> bool {
    let name_lower = device_name.to_lowercase();
    
    if name_lower.contains("vb-cable") 
        || name_lower.contains("vb audio") 
        || name_lower.contains("virtual cable") 
        || name_lower.contains("vb-audio")
        || name_lower.contains("voicemod") {
        return true;
    }
    
    if name_lower.contains("midah-virtual-sink") 
        || name_lower.contains("virtual") && name_lower.contains("sink") {
        return true;
    }
    
    name_lower.contains("virtual") && (
        name_lower.contains("audio") 
        || name_lower.contains("cable") 
        || name_lower.contains("sink")
        || name_lower.contains("loopback")
    )
}