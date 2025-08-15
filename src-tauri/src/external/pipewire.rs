use anyhow::{Context, Result};
use serde::Serialize;
use cpal::traits::{DeviceTrait, HostTrait};
use std::process::Command;
use tracing::{info, error};

#[derive(Debug, Serialize)]
pub struct PipeWireStatus {
    pub pipewire_available: bool,
    pub virtual_sink_available: bool,
    pub virtual_sink_name: Option<String>,
    pub installation_message: Option<String>,
}

const VIRTUAL_SINK_NAME: &str = "midah-virtual-sink";
const VIRTUAL_SINK_DESCRIPTION: &str = "Midah Virtual Audio Sink";

pub fn check_pipewire_installation() -> Result<bool> {
    let output = Command::new("which")
        .arg("pw-cli")
        .output();
    
    match output {
        Ok(output) => {
            if output.status.success() {
                let status_output = Command::new("pw-cli")
                    .arg("info")
                    .output();
                
                match status_output {
                    Ok(status) => Ok(status.status.success()),
                    Err(_) => Ok(false),
                }
            } else {
                Ok(false)
            }
        }
        Err(_) => Ok(false),
    }
}

pub fn check_virtual_sink_exists() -> Result<bool> {
    let output = Command::new("pw-cli")
        .args(["list-objects", "Node"])
        .output()
        .context("Failed to list PipeWire objects")?;
    
    if !output.status.success() {
        return Ok(false);
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.contains(VIRTUAL_SINK_NAME))
}

pub fn create_virtual_sink() -> Result<String> {
    info!("Creating PipeWire virtual sink: {}", VIRTUAL_SINK_NAME);
    
    let output = Command::new("pw-cli")
        .args([
            "create-node",
            "adapter",
            &format!("{{ factory.name=support.null-audio-sink node.name={} node.description=\"{}\" media.class=Audio/Sink audio.position=[FL,FR] }}", 
                     VIRTUAL_SINK_NAME, VIRTUAL_SINK_DESCRIPTION)
        ])
        .output()
        .context("Failed to create virtual sink")?;
    
    if output.status.success() {
        info!("Successfully created virtual sink: {}", VIRTUAL_SINK_NAME);
        Ok(format!("Virtual sink '{}' created successfully", VIRTUAL_SINK_NAME))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("Failed to create virtual sink: {}", stderr);
        Err(anyhow::anyhow!("Failed to create virtual sink: {}", stderr))
    }
}

pub fn remove_virtual_sink() -> Result<String> {
    info!("Removing PipeWire virtual sink: {}", VIRTUAL_SINK_NAME);
    
    let list_output = Command::new("pw-cli")
        .args(["list-objects", "Node"])
        .output()
        .context("Failed to list PipeWire objects")?;
    
    let stdout = String::from_utf8_lossy(&list_output.stdout);
    let sink_id = stdout
        .lines()
        .find(|line| line.contains(VIRTUAL_SINK_NAME))
        .and_then(|line| {
            line.split_whitespace()
                .find_map(|word| word.parse::<u32>().ok())
        });
    
    if let Some(id) = sink_id {
        let output = Command::new("pw-cli")
            .args(["destroy", &id.to_string()])
            .output()
            .context("Failed to destroy virtual sink")?;
        
        if output.status.success() {
            info!("Successfully removed virtual sink with ID: {}", id);
            Ok(format!("Virtual sink removed successfully"))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            error!("Failed to remove virtual sink: {}", stderr);
            Err(anyhow::anyhow!("Failed to remove virtual sink: {}", stderr))
        }
    } else {
        Ok("Virtual sink not found or already removed".to_string())
    }
}

pub fn get_virtual_sink_device() -> Option<String> {
    let host = cpal::default_host();
    if let Ok(devices) = host.output_devices() {
        for device in devices {
            if let Ok(name) = device.name() {
                if name.contains(VIRTUAL_SINK_NAME) || name.contains(VIRTUAL_SINK_DESCRIPTION) {
                    return Some(name);
                }
            }
        }
    }
    None
}

#[tauri::command]
pub async fn check_pipewire_status() -> Result<PipeWireStatus, String> {
    #[cfg(not(target_os = "linux"))]
    {
        return Ok(PipeWireStatus {
            pipewire_available: false,
            virtual_sink_available: false,
            virtual_sink_name: None,
            installation_message: Some("PipeWire is only supported on Linux".to_string()),
        });
    }
    
    #[cfg(target_os = "linux")]
    {
        let pipewire_available = check_pipewire_installation()
            .map_err(|e| format!("Failed to check PipeWire installation: {}", e))?;
        
        if !pipewire_available {
            return Ok(PipeWireStatus {
                pipewire_available: false,
                virtual_sink_available: false,
                virtual_sink_name: None,
                installation_message: Some(
                    "PipeWire is not installed or not running. Please install PipeWire:\n\n\
                    Ubuntu/Debian: sudo apt install pipewire pipewire-pulse\n\
                    Fedora: sudo dnf install pipewire pipewire-pulseaudio\n\
                    Arch: sudo pacman -S pipewire pipewire-pulse\n\n\
                    After installation, you may need to restart your session.".to_string()
                ),
            });
        }
        
        let virtual_sink_available = check_virtual_sink_exists()
            .map_err(|e| format!("Failed to check virtual sink: {}", e))?;
        
        let virtual_sink_name = if virtual_sink_available {
            get_virtual_sink_device()
        } else {
            None
        };
        
        Ok(PipeWireStatus {
            pipewire_available,
            virtual_sink_available,
            virtual_sink_name,
            installation_message: None,
        })
    }
}

#[tauri::command]
pub async fn setup_pipewire_virtual_sink() -> Result<String, String> {
    #[cfg(not(target_os = "linux"))]
    {
        return Err("PipeWire virtual sink setup is only supported on Linux".to_string());
    }
    
    #[cfg(target_os = "linux")]
    {
        let pipewire_available = check_pipewire_installation()
            .map_err(|e| format!("Failed to check PipeWire: {}", e))?;
        
        if !pipewire_available {
            return Err("PipeWire is not installed or not running. Please install PipeWire first.".to_string());
        }
        
        let sink_exists = check_virtual_sink_exists()
            .map_err(|e| format!("Failed to check existing virtual sink: {}", e))?;
        
        if sink_exists {
            return Ok("Virtual sink already exists".to_string());
        }
        
        // Create the virtual sink
        create_virtual_sink()
            .map_err(|e| format!("Failed to create virtual sink: {}", e))
    }
}

#[tauri::command]
pub async fn remove_pipewire_virtual_sink() -> Result<String, String> {
    #[cfg(not(target_os = "linux"))]
    {
        return Err("PipeWire virtual sink removal is only supported on Linux".to_string());
    }
    
    #[cfg(target_os = "linux")]
    {
        remove_virtual_sink()
            .map_err(|e| format!("Failed to remove virtual sink: {}", e))
    }
}
