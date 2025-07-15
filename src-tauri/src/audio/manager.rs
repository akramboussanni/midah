use anyhow::{Context, Result};
use cpal::{
    traits::{DeviceTrait, HostTrait},
    Device, Host,
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tracing::{info, warn};
use once_cell::sync::OnceCell;

pub struct AudioManager {
    host: Host,
    virtual_device: Arc<Mutex<Option<Device>>>,
    output_device: Arc<Mutex<Option<Device>>>,
    virtual_volume: Arc<Mutex<f32>>,
    output_volume: Arc<Mutex<f32>>,
    playback_positions: Arc<Mutex<HashMap<String, f32>>>,
    playback_start_times: Arc<Mutex<HashMap<String, std::time::Instant>>>,
}

impl AudioManager {
    pub fn new() -> Result<Self> {
        let host = cpal::default_host();
        let manager = Self {
            host,
            virtual_device: Arc::new(Mutex::new(None)),
            output_device: Arc::new(Mutex::new(None)),
            virtual_volume: Arc::new(Mutex::new(1.0)),
            output_volume: Arc::new(Mutex::new(1.0)),
            playback_positions: Arc::new(Mutex::new(HashMap::new())),
            playback_start_times: Arc::new(Mutex::new(HashMap::new())),
        };

        info!("Initializing audio system...");

        if let Some(vb_device) = manager.find_vb_cable_device() {
            let device_name = vb_device.name().unwrap_or_default();
            manager.set_virtual_device(&device_name)?;
            info!("Found and set VB-Cable as virtual device: {}", device_name);
        } else {
            warn!("VB-Cable device not found for virtual device");
        }

        if let Some(default_device) = manager.host.default_output_device() {
            let device_name = default_device.name().unwrap_or_default();
            manager.set_output_device(&device_name)?;
            info!("Set default output device: {}", device_name);
        } else {
            warn!("No default output device found");
        }

        info!("Audio system initialization complete");
        info!("Virtual device configured: {}", manager.virtual_device.lock().unwrap().is_some());
        info!("Output device configured: {}", manager.output_device.lock().unwrap().is_some());

        Ok(manager)
    }

    pub fn find_vb_cable_device(&self) -> Option<Device> {
        if let Ok(output_devices) = self.host.output_devices() {
            for device in output_devices {
                let name = device.name().unwrap_or_default().to_lowercase();
                info!("Checking output device: {}", name);
                if name.contains("cable") || name.contains("vb-audio") || name.contains("virtual") || name.contains("vb-cable") {
                    info!("Found virtual device in output devices: {}", name);
                    return Some(device);
                }
            }
        }
        
        info!("No virtual device found");
        None
    }
    
    pub fn set_virtual_device(&self, device_name: &str) -> Result<()> {
        if let Ok(mut output_devices) = self.host.output_devices() {
            if let Some(device) = output_devices.find(|d| d.name().unwrap_or_default() == device_name) {
                *self.virtual_device.lock().unwrap() = Some(device);
                info!("Set virtual device to: {} (output device)", device_name);
                return Ok(());
            }
        }
        
        Err(anyhow::anyhow!("Device not found: {}", device_name))
    }

    pub fn set_output_device(&self, device_name: &str) -> Result<()> {
        let device = self
            .host
            .output_devices()?
            .find(|d| d.name().unwrap_or_default() == device_name)
            .context("Device not found")?;
        *self.output_device.lock().unwrap() = Some(device);
        info!("Set output device to: {}", device_name);
        Ok(())
    }

    pub fn get_virtual_volume(&self) -> f32 {
        *self.virtual_volume.lock().unwrap()
    }

    pub fn set_virtual_volume(&self, volume: f32) -> Result<()> {
        let volume = volume.clamp(0.0, 1.0);
        *self.virtual_volume.lock().unwrap() = volume;
        Ok(())
    }

    pub fn get_output_volume(&self) -> f32 {
        *self.output_volume.lock().unwrap()
    }

    pub fn set_output_volume(&self, volume: f32) -> Result<()> {
        let volume = volume.clamp(0.0, 1.0);
        *self.output_volume.lock().unwrap() = volume;
        Ok(())
    }

    pub fn get_virtual_device(&self) -> Option<cpal::Device> {
        self.virtual_device.lock().unwrap().clone()
    }

    pub fn get_output_device(&self) -> Option<cpal::Device> {
        self.output_device.lock().unwrap().clone()
    }

    pub fn set_playback_position(&self, sound_id: &str, position: f32) {
        self.playback_positions.lock().unwrap().insert(sound_id.to_string(), position);
        self.playback_start_times.lock().unwrap().insert(sound_id.to_string(), std::time::Instant::now());
    }

    pub fn clear_playback_position(&self, sound_id: &str) {
        self.playback_positions.lock().unwrap().remove(sound_id);
        self.playback_start_times.lock().unwrap().remove(sound_id);
    }
}

static AUDIO_MANAGER: OnceCell<AudioManager> = OnceCell::new();

pub fn get_audio_manager() -> &'static AudioManager {
    AUDIO_MANAGER.get_or_init(|| AudioManager::new().expect("Failed to initialize audio manager"))
} 