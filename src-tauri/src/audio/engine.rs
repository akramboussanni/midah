use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    sync::mpsc::{self, Sender, Receiver},
    thread,
    time::Instant,
};
use tracing::info;
use once_cell::sync::OnceCell;
use rodio::Source;
use crate::audio::{AudioManager, get_audio_manager};

//ik this looks dumb. but i had an old implementation
fn combine_volume(volume1: f32, volume2: f32) -> f32 {
    volume1.max(0.0) * volume2.max(0.0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub name: String,
    pub is_default: bool,
    pub device_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioSettings {
    pub volume: f32,
    pub output_device: Option<String>,
}

pub enum AudioCommand {
    Play {
        file_path: String,
        sound_id: String,
        start_position: Option<f32>,
        sound_volume: f32,
        local_only: bool,
    },
    Stop {
        sound_id: String,
    },
    StopAll,
    UpdateSoundVolume {
        sound_id: String,
        sound_volume: f32,
    },
    UpdateDeviceVolumes,
    Shutdown,
}

struct SoundInstance {
    sinks: Vec<rodio::Sink>,
    _streams: Vec<(rodio::OutputStream, rodio::OutputStreamHandle)>,//for keep alive
    device_volumes: Vec<f32>,
    sound_volume: f32,
}

impl SoundInstance {
    fn new(
        sinks: Vec<rodio::Sink>,
        streams: Vec<(rodio::OutputStream, rodio::OutputStreamHandle)>,
        device_volumes: Vec<f32>,
        sound_volume: f32,
    ) -> Self {
        Self {
            sinks,
            _streams: streams,
            device_volumes,
            sound_volume,
        }
    }

    fn apply_volume_updates(&mut self) {
        for (i, sink) in self.sinks.iter_mut().enumerate() {
            let device_volume = self.device_volumes.get(i).unwrap_or(&1.0);
            let combined_volume = combine_volume(*device_volume, self.sound_volume);
            sink.set_volume(combined_volume);
        }
    }

    fn update_sound_volume(&mut self, new_volume: f32) {
        self.sound_volume = new_volume;
        self.apply_volume_updates();
    }

    fn update_device_volumes(&mut self, virtual_volume: f32, output_volume: f32) {
        let device_count = self.device_volumes.len();
        for (i, device_volume) in self.device_volumes.iter_mut().enumerate() {
            if i == 0 && device_count > 1 {
                *device_volume = virtual_volume;
            } else if i == 1 || device_count == 1 {
                *device_volume = output_volume;
            }
        }
        self.apply_volume_updates();
    }

    fn is_finished(&self) -> bool {
        self.sinks.iter().all(|sink| sink.empty())
    }

    fn stop(&self) {
        for sink in &self.sinks {
            sink.stop();
        }
    }
}

fn create_stream_and_sink(device: Option<&cpal::Device>, sound_id: &str) -> Result<(rodio::OutputStream, rodio::OutputStreamHandle, rodio::Sink), String> {
    let (stream, handle) = if let Some(device) = device {
        rodio::OutputStream::try_from_device(device)
            .map_err(|e| format!("Failed to create output stream from device: {}", e))?
    } else {
        rodio::OutputStream::try_default()
            .map_err(|e| format!("Failed to create default output stream: {}", e))?
    };
    let sink = rodio::Sink::try_new(&handle)
        .map_err(|e| format!("Failed to create sink for {}: {}", sound_id, e))?;
    Ok((stream, handle, sink))
}

fn try_add_device_stream(
    device: Option<&cpal::Device>,
    sound_id: &str,
    new_streams: &mut Vec<(rodio::OutputStream, rodio::OutputStreamHandle)>,
    new_sinks: &mut Vec<rodio::Sink>,
    device_name: &str,
    _device_volume: f32
) {
    if let Ok((stream, handle, sink)) = create_stream_and_sink(device, sound_id) {
        new_streams.push((stream, handle));
        new_sinks.push(sink);
    } else {
        tracing::error!("Failed to create {} device stream for {}", device_name, sound_id);
    }
}

fn setup_devices_for_playback(
    manager: &AudioManager, 
    sound_id: &str, 
    local_only: bool
) -> (Vec<rodio::Sink>, Vec<(rodio::OutputStream, rodio::OutputStreamHandle)>, Vec<f32>) {
    let mut new_sinks = Vec::new();
    let mut new_streams = Vec::new();
    let mut device_volumes = Vec::new();
    
    if local_only {
        try_add_device_stream(None, sound_id, &mut new_streams, &mut new_sinks, "default", 1.0);
        device_volumes.push(1.0);
    } else {
        let virtual_device = manager.get_virtual_device();
        let output_device = manager.get_output_device();
        let virtual_volume = manager.get_virtual_volume();
        let output_volume = manager.get_output_volume();
        
        if let Some(device) = virtual_device {
            try_add_device_stream(Some(&device), sound_id, &mut new_streams, &mut new_sinks, "virtual", virtual_volume);
            device_volumes.push(virtual_volume);
        }
        
        if let Some(device) = output_device {
            try_add_device_stream(Some(&device), sound_id, &mut new_streams, &mut new_sinks, "output", output_volume);
            device_volumes.push(output_volume);
        }
        
        if new_sinks.is_empty() {
            try_add_device_stream(None, sound_id, &mut new_streams, &mut new_sinks, "default fallback", 1.0);
            device_volumes.push(1.0);
        }
    }
    
    (new_sinks, new_streams, device_volumes)
}

fn handle_play_command(
    file_path: &str,
    sound_id: &str,
    start_position: Option<f32>,
    sound_volume: f32,
    local_only: bool,
    sound_instances: &mut HashMap<String, SoundInstance>,
    playing_thread: &Arc<Mutex<HashMap<String, (Instant, f32, f32)>>>,
) {
    if let Some(existing_instance) = sound_instances.remove(sound_id) {
        existing_instance.stop();
    }
    
    let manager = get_audio_manager();
    let (mut new_sinks, new_streams, new_device_volumes) = setup_devices_for_playback(&manager, sound_id, local_only);
    
    let source_result = crate::audio::SymphoniaAudioSource::new(file_path, start_position.unwrap_or(0.0));
    let duration = if let Ok(ref src) = source_result {
        src.total_duration().map(|d| d.as_secs_f32()).unwrap_or(0.0)
    } else { 0.0 };
    let used_start_position = start_position.unwrap_or(0.0);
    info!("Sound {} duration calculation: total={:.2}s, start_pos={:.2}s, effective_duration={:.2}s", 
          sound_id, duration, used_start_position, duration - used_start_position);
    
    let buffered_source = match source_result {
        Ok(src) => src.buffered(),
        Err(e) => {
            tracing::error!("Failed to create audio source for {}: {}", sound_id, e);
            return;
        }
    };
    
    for (i, sink) in new_sinks.iter_mut().enumerate() {
        let device_volume = new_device_volumes.get(i).unwrap_or(&1.0);
        let combined_volume = combine_volume(*device_volume, sound_volume);
        sink.set_volume(combined_volume);
        sink.append(buffered_source.clone());
    }
    
    let instance = SoundInstance::new(
        new_sinks,
        new_streams,
        new_device_volumes,
        sound_volume,
    );
    
    sound_instances.insert(sound_id.to_string(), instance);
    playing_thread.lock().expect("Lock poisoned").insert(sound_id.to_string(), (Instant::now(), duration, used_start_position));
    info!("Started playing sound: {} with volume: {} (local_only: {})", sound_id, sound_volume, local_only);
}

fn cleanup_finished_sounds(
    sound_instances: &mut HashMap<String, SoundInstance>,
    playing_thread: &Arc<Mutex<HashMap<String, (Instant, f32, f32)>>>,
) {
    let mut to_remove = vec![];
    for (id, instance) in sound_instances.iter() {
        if instance.is_finished() {
            info!("Sound {} finished playing on all {} devices, removing from active sounds", id, instance.sinks.len());
            to_remove.push(id.clone());
        }
    }
    for id in to_remove {
        sound_instances.remove(&id);
        playing_thread.lock().expect("Lock poisoned").remove(&id);
        info!("Removed sound {} from all tracking structures", id);
    }
}

fn audio_thread_worker(
    command_rx: Receiver<AudioCommand>,
    playing_thread: Arc<Mutex<HashMap<String, (Instant, f32, f32)>>>,
) {
    
    let mut sound_instances: HashMap<String, SoundInstance> = HashMap::new();
    
    loop {
        match command_rx.recv() {
            Ok(cmd) => {
                match cmd {
                    AudioCommand::Play { file_path, sound_id, start_position, sound_volume, local_only } => {
                        handle_play_command(
                            &file_path,
                            &sound_id,
                            start_position,
                            sound_volume,
                            local_only,
                            &mut sound_instances,
                            &playing_thread,
                        );
                    }
                    AudioCommand::Stop { sound_id } => {
                        if let Some(instance) = sound_instances.remove(&sound_id) {
                            instance.stop();
                        }
                        playing_thread.lock().expect("Lock poisoned").remove(&sound_id);
                    }
                    AudioCommand::StopAll => {
                        for (_id, instance) in sound_instances.drain() {
                            instance.stop();
                        }
                        playing_thread.lock().expect("Lock poisoned").clear();
                    }
                    AudioCommand::UpdateSoundVolume { sound_id, sound_volume } => {
                        if let Some(instance) = sound_instances.get_mut(&sound_id) {
                            instance.update_sound_volume(sound_volume);
                        }
                    }
                    AudioCommand::UpdateDeviceVolumes => {
                        let manager = get_audio_manager();
                        let virtual_volume = manager.get_virtual_volume();
                        let output_volume = manager.get_output_volume();
                        for instance in sound_instances.values_mut() {
                            instance.update_device_volumes(virtual_volume, output_volume);
                        }
                        info!("Updated device volumes for all playing sounds (virtual: {}, output: {})", virtual_volume, output_volume);
                    }
                    AudioCommand::Shutdown => {
                        info!("Audio thread received shutdown signal");
                        for (_id, instance) in sound_instances.drain() {
                            instance.stop();
                        }
                        playing_thread.lock().expect("Lock poisoned").clear();
                        break;
                    }
                }
            }
            Err(_) => {
                info!("Audio thread channel closed, shutting down");
                break;
            }
        }
        cleanup_finished_sounds(&mut sound_instances, &playing_thread);
    }
}

pub struct AudioEngine {
    command_tx: Sender<AudioCommand>,
    playing: Arc<Mutex<HashMap<String, (Instant, f32, f32)>>>,
}

impl AudioEngine {
    pub fn new() -> Self {
        let (command_tx, command_rx): (Sender<AudioCommand>, Receiver<AudioCommand>) = mpsc::channel();
        let playing = Arc::new(Mutex::new(HashMap::new()));
        let playing_thread = playing.clone();
        
        thread::spawn(move || {
            audio_thread_worker(command_rx, playing_thread);
        });
        
        Self { command_tx, playing }
    }

    pub fn send_command(&self, cmd: AudioCommand) {
        let _ = self.command_tx.send(cmd);
    }

    pub fn get_playing_sounds(&self) -> Vec<String> {
        self.playing.lock().expect("Lock poisoned").keys().cloned().collect()
    }

    pub fn get_playback_position(&self, sound_id: &str) -> Option<f32> {
        let playing = self.playing.lock().expect("Lock poisoned");
        if let Some((start_time, duration, start_position)) = playing.get(sound_id) {
            let elapsed = start_time.elapsed().as_secs_f32();
            if elapsed < *duration || *duration == 0.0 {
                Some(*start_position + elapsed)
            } else {
                None
            }
        } else {
            None
        }
    }
}

impl Drop for AudioEngine {
    fn drop(&mut self) {
        let _ = self.command_tx.send(AudioCommand::Shutdown);
    }
}

static AUDIO_ENGINE: OnceCell<AudioEngine> = OnceCell::new();

pub fn get_audio_engine() -> &'static AudioEngine {
    AUDIO_ENGINE.get_or_init(|| AudioEngine::new())
} 