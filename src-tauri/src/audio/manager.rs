use anyhow::{Context, Result};
use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    Device, Host, SupportedStreamConfigRange, Sample, SampleFormat, StreamConfig,
};
use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}},
};
use tracing::{info, warn};
use once_cell::sync::OnceCell;

pub struct AudioManager {
    host: Host,
    virtual_device: Arc<Mutex<Option<Device>>>,
    output_device: Arc<Mutex<Option<Device>>>,
    input_device: Arc<Mutex<Option<Device>>>,
    virtual_volume: Arc<Mutex<f32>>,
    output_volume: Arc<Mutex<f32>>,
    input_volume: Arc<Mutex<f32>>,
    input_capture: Arc<Mutex<Option<InputCaptureControl>>>,
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
            input_device: Arc::new(Mutex::new(None)),
            virtual_volume: Arc::new(Mutex::new(1.0)),
            output_volume: Arc::new(Mutex::new(1.0)),
            input_volume: Arc::new(Mutex::new(1.0)),
            input_capture: Arc::new(Mutex::new(None)),
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

        if let Some(default_input) = manager.host.default_input_device() {
            let device_name = default_input.name().unwrap_or_default();
            manager.set_input_device(&device_name)?;
            info!("Set default input device: {}", device_name);
        } else {
            warn!("No default input device found");
        }

        info!("Audio system initialization complete");
        info!("Virtual device configured: {}", manager.virtual_device.lock().unwrap().is_some());
        info!("Output device configured: {}", manager.output_device.lock().unwrap().is_some());
        info!("Input device configured: {}", manager.input_device.lock().unwrap().is_some());

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

    pub fn set_input_device(&self, device_name: &str) -> Result<()> {
        let device = self
            .host
            .input_devices()?
            .find(|d| d.name().unwrap_or_default() == device_name)
            .context("Device not found")?;
        *self.input_device.lock().unwrap() = Some(device);
        info!("Set input device to: {}", device_name);
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

    pub fn get_input_volume(&self) -> f32 {
        *self.input_volume.lock().unwrap()
    }

    pub fn set_input_volume(&self, volume: f32) -> Result<()> {
        let volume = volume.clamp(0.0, 1.0);
        *self.input_volume.lock().unwrap() = volume;
        Ok(())
    }

    pub fn get_virtual_device(&self) -> Option<cpal::Device> {
        self.virtual_device.lock().unwrap().clone()
    }

    pub fn get_output_device(&self) -> Option<cpal::Device> {
        self.output_device.lock().unwrap().clone()
    }

    pub fn get_input_device(&self) -> Option<cpal::Device> {
        self.input_device.lock().unwrap().clone()
    }

    pub fn set_playback_position(&self, sound_id: &str, position: f32) {
        self.playback_positions.lock().unwrap().insert(sound_id.to_string(), position);
        self.playback_start_times.lock().unwrap().insert(sound_id.to_string(), std::time::Instant::now());
    }

    pub fn clear_playback_position(&self, sound_id: &str) {
        self.playback_positions.lock().unwrap().remove(sound_id);
        self.playback_start_times.lock().unwrap().remove(sound_id);
    }

    pub fn start_input_capture(&self) -> Result<()> {
        // Stop any existing capture first
        let _ = self.stop_input_capture();

        let input_name = self.get_input_device().and_then(|d| d.name().ok()).context("No input device set")?;
        let output_name = self.get_virtual_device().and_then(|d| d.name().ok()).context("No virtual output device set")?;

        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_flag_clone = stop_flag.clone();
        let input_volume_ref = self.input_volume.clone();
        let virtual_volume_ref = self.virtual_volume.clone();

        let handle = std::thread::spawn(move || {
            let host = cpal::default_host();
            let input_device = match host.input_devices().ok().and_then(|mut it| it.find(|d| d.name().ok().as_deref() == Some(&input_name))) {
                Some(d) => d,
                None => {
                    tracing::error!("Input device not found at runtime: {}", input_name);
                    return;
                }
            };
            let output_device = match host.output_devices().ok().and_then(|mut it| it.find(|d| d.name().ok().as_deref() == Some(&output_name))) {
                Some(d) => d,
                None => {
                    tracing::error!("Output device not found at runtime: {}", output_name);
                    return;
                }
            };

            let input_config = match input_device.default_input_config() { Ok(c) => c, Err(e) => { tracing::error!("default_input_config failed: {}", e); return; } };
            let input_sample_rate = input_config.sample_rate().0;
            let input_channels = input_config.channels() as usize;

            let output_config = match output_device.supported_output_configs() {
                Ok(ranges) => {
                    let mut chosen: Option<SupportedStreamConfigRange> = None;
                    for r in ranges { if r.min_sample_rate().0 <= input_sample_rate && r.max_sample_rate().0 >= input_sample_rate { chosen = Some(r); break; } }
                    chosen.map(|r| r.with_sample_rate(cpal::SampleRate(input_sample_rate))).unwrap_or_else(|| output_device.default_output_config().expect("default_output_config"))
                }
                Err(_) => match output_device.default_output_config() { Ok(c) => c, Err(e) => { tracing::error!("default_output_config failed: {}", e); return; } },
            };
            let output_channels = output_config.channels() as usize;

            let buffer: Arc<Mutex<VecDeque<f32>>> = Arc::new(Mutex::new(VecDeque::with_capacity((input_sample_rate as usize) * input_channels * 2)));

            // Input stream
            let buffer_in = buffer.clone();
            let input_stream = match input_config.sample_format() {
                SampleFormat::F32 => {
                    let cfg: StreamConfig = input_config.clone().into();
                    input_device.build_input_stream(&cfg, move |data: &[f32], _| {
                        let mut buf = buffer_in.lock().unwrap();
                        if buf.len() > buf.capacity().saturating_sub(data.len()) { let drain = data.len().min(1024); buf.drain(..drain); }
                        for &sample in data { buf.push_back(sample); }
                    }, move |err| { tracing::error!("Input stream error: {:?}", err); }, None)
                }
                SampleFormat::I16 => {
                    let cfg: StreamConfig = input_config.clone().into();
                    input_device.build_input_stream(&cfg, move |data: &[i16], _| {
                        let mut buf = buffer_in.lock().unwrap();
                        if buf.len() > buf.capacity().saturating_sub(data.len()) { let drain = data.len().min(1024); buf.drain(..drain); }
                        for &sample in data { buf.push_back(sample as f32 / i16::MAX as f32); }
                    }, move |err| { tracing::error!("Input stream error: {:?}", err); }, None)
                }
                SampleFormat::U16 => {
                    let cfg: StreamConfig = input_config.clone().into();
                    input_device.build_input_stream(&cfg, move |data: &[u16], _| {
                        let mut buf = buffer_in.lock().unwrap();
                        if buf.len() > buf.capacity().saturating_sub(data.len()) { let drain = data.len().min(1024); buf.drain(..drain); }
                        for &sample in data { buf.push_back((sample as f32 - 32768.0) / 32768.0); }
                    }, move |err| { tracing::error!("Input stream error: {:?}", err); }, None)
                }
                SampleFormat::I8 => {
                    let cfg: StreamConfig = input_config.clone().into();
                    input_device.build_input_stream(&cfg, move |data: &[i8], _| {
                        let mut buf = buffer_in.lock().unwrap();
                        if buf.len() > buf.capacity().saturating_sub(data.len()) { let drain = data.len().min(1024); buf.drain(..drain); }
                        for &sample in data { buf.push_back(sample as f32 / i8::MAX as f32); }
                    }, move |err| { tracing::error!("Input stream error: {:?}", err); }, None)
                }
                SampleFormat::U8 => {
                    let cfg: StreamConfig = input_config.clone().into();
                    input_device.build_input_stream(&cfg, move |data: &[u8], _| {
                        let mut buf = buffer_in.lock().unwrap();
                        if buf.len() > buf.capacity().saturating_sub(data.len()) { let drain = data.len().min(1024); buf.drain(..drain); }
                        for &sample in data { buf.push_back((sample as f32 - 128.0) / 128.0); }
                    }, move |err| { tracing::error!("Input stream error: {:?}", err); }, None)
                }
                SampleFormat::I32 => {
                    let cfg: StreamConfig = input_config.clone().into();
                    input_device.build_input_stream(&cfg, move |data: &[i32], _| {
                        let mut buf = buffer_in.lock().unwrap();
                        if buf.len() > buf.capacity().saturating_sub(data.len()) { let drain = data.len().min(1024); buf.drain(..drain); }
                        for &sample in data { buf.push_back(sample as f32 / i32::MAX as f32); }
                    }, move |err| { tracing::error!("Input stream error: {:?}", err); }, None)
                }
                SampleFormat::U32 => {
                    let cfg: StreamConfig = input_config.clone().into();
                    input_device.build_input_stream(&cfg, move |data: &[u32], _| {
                        let mut buf = buffer_in.lock().unwrap();
                        if buf.len() > buf.capacity().saturating_sub(data.len()) { let drain = data.len().min(1024); buf.drain(..drain); }
                        for &sample in data { buf.push_back((sample as f32 - 2147483648.0) / 2147483648.0); }
                    }, move |err| { tracing::error!("Input stream error: {:?}", err); }, None)
                }
                SampleFormat::F64 => {
                    let cfg: StreamConfig = input_config.clone().into();
                    input_device.build_input_stream(&cfg, move |data: &[f64], _| {
                        let mut buf = buffer_in.lock().unwrap();
                        if buf.len() > buf.capacity().saturating_sub(data.len()) { let drain = data.len().min(1024); buf.drain(..drain); }
                        for &sample in data { buf.push_back(sample as f32); }
                    }, move |err| { tracing::error!("Input stream error: {:?}", err); }, None)
                }
                _ => { tracing::error!("Unsupported input sample format"); return; }
            };

            // Output stream
            let buffer_out = buffer.clone();
            let output_stream = match output_config.sample_format() {
                SampleFormat::F32 => {
                    let cfg: StreamConfig = output_config.clone().into();
                    output_device.build_output_stream(&cfg, move |data: &mut [f32], _| {
                        let input_vol = *input_volume_ref.lock().unwrap();
                        let virt_vol = *virtual_volume_ref.lock().unwrap();
                        let vol = (input_vol * virt_vol).clamp(0.0, 1.0);
                        let mut buf = buffer_out.lock().unwrap();
                        fill_output_from_buffer(data, &mut buf, input_channels, output_channels, vol);
                    }, move |err| { tracing::error!("Output stream error: {:?}", err); }, None)
                }
                SampleFormat::I8 => {
                    let cfg: StreamConfig = output_config.clone().into();
                    output_device.build_output_stream(&cfg, move |data: &mut [i8], _| {
                        let input_vol = *input_volume_ref.lock().unwrap();
                        let virt_vol = *virtual_volume_ref.lock().unwrap();
                        let vol = (input_vol * virt_vol).clamp(0.0, 1.0);
                        let mut fbuf = vec![0.0f32; data.len()];
                        {
                            let mut buf = buffer_out.lock().unwrap();
                            fill_output_from_buffer(&mut fbuf[..], &mut buf, input_channels, output_channels, vol);
                        }
                        for (d, s) in data.iter_mut().zip(fbuf.iter()) { *d = i8::from_sample(*s); }
                    }, move |err| { tracing::error!("Output stream error: {:?}", err); }, None)
                }
                SampleFormat::U8 => {
                    let cfg: StreamConfig = output_config.clone().into();
                    output_device.build_output_stream(&cfg, move |data: &mut [u8], _| {
                        let input_vol = *input_volume_ref.lock().unwrap();
                        let virt_vol = *virtual_volume_ref.lock().unwrap();
                        let vol = (input_vol * virt_vol).clamp(0.0, 1.0);
                        let mut fbuf = vec![0.0f32; data.len()];
                        {
                            let mut buf = buffer_out.lock().unwrap();
                            fill_output_from_buffer(&mut fbuf[..], &mut buf, input_channels, output_channels, vol);
                        }
                        for (d, s) in data.iter_mut().zip(fbuf.iter()) { *d = u8::from_sample(*s); }
                    }, move |err| { tracing::error!("Output stream error: {:?}", err); }, None)
                }
                SampleFormat::I16 => {
                    let cfg: StreamConfig = output_config.clone().into();
                    output_device.build_output_stream(&cfg, move |data: &mut [i16], _| {
                        let input_vol = *input_volume_ref.lock().unwrap();
                        let virt_vol = *virtual_volume_ref.lock().unwrap();
                        let vol = (input_vol * virt_vol).clamp(0.0, 1.0);
                        let mut fbuf = vec![0.0f32; data.len()];
                        {
                            let mut buf = buffer_out.lock().unwrap();
                            fill_output_from_buffer(&mut fbuf[..], &mut buf, input_channels, output_channels, vol);
                        }
                        for (d, s) in data.iter_mut().zip(fbuf.iter()) { *d = i16::from_sample(*s); }
                    }, move |err| { tracing::error!("Output stream error: {:?}", err); }, None)
                }
                SampleFormat::U16 => {
                    let cfg: StreamConfig = output_config.clone().into();
                    output_device.build_output_stream(&cfg, move |data: &mut [u16], _| {
                        let input_vol = *input_volume_ref.lock().unwrap();
                        let virt_vol = *virtual_volume_ref.lock().unwrap();
                        let vol = (input_vol * virt_vol).clamp(0.0, 1.0);
                        let mut fbuf = vec![0.0f32; data.len()];
                        {
                            let mut buf = buffer_out.lock().unwrap();
                            fill_output_from_buffer(&mut fbuf[..], &mut buf, input_channels, output_channels, vol);
                        }
                        for (d, s) in data.iter_mut().zip(fbuf.iter()) { *d = u16::from_sample(*s); }
                    }, move |err| { tracing::error!("Output stream error: {:?}", err); }, None)
                }
                SampleFormat::I32 => {
                    let cfg: StreamConfig = output_config.clone().into();
                    output_device.build_output_stream(&cfg, move |data: &mut [i32], _| {
                        let input_vol = *input_volume_ref.lock().unwrap();
                        let virt_vol = *virtual_volume_ref.lock().unwrap();
                        let vol = (input_vol * virt_vol).clamp(0.0, 1.0);
                        let mut fbuf = vec![0.0f32; data.len()];
                        {
                            let mut buf = buffer_out.lock().unwrap();
                            fill_output_from_buffer(&mut fbuf[..], &mut buf, input_channels, output_channels, vol);
                        }
                        for (d, s) in data.iter_mut().zip(fbuf.iter()) { *d = i32::from_sample(*s); }
                    }, move |err| { tracing::error!("Output stream error: {:?}", err); }, None)
                }
                SampleFormat::U32 => {
                    let cfg: StreamConfig = output_config.clone().into();
                    output_device.build_output_stream(&cfg, move |data: &mut [u32], _| {
                        let input_vol = *input_volume_ref.lock().unwrap();
                        let virt_vol = *virtual_volume_ref.lock().unwrap();
                        let vol = (input_vol * virt_vol).clamp(0.0, 1.0);
                        let mut fbuf = vec![0.0f32; data.len()];
                        {
                            let mut buf = buffer_out.lock().unwrap();
                            fill_output_from_buffer(&mut fbuf[..], &mut buf, input_channels, output_channels, vol);
                        }
                        for (d, s) in data.iter_mut().zip(fbuf.iter()) { *d = u32::from_sample(*s); }
                    }, move |err| { tracing::error!("Output stream error: {:?}", err); }, None)
                }
                SampleFormat::F64 => {
                    let cfg: StreamConfig = output_config.clone().into();
                    output_device.build_output_stream(&cfg, move |data: &mut [f64], _| {
                        let input_vol = *input_volume_ref.lock().unwrap();
                        let virt_vol = *virtual_volume_ref.lock().unwrap();
                        let vol = (input_vol * virt_vol).clamp(0.0, 1.0);
                        let mut fbuf = vec![0.0f32; data.len()];
                        {
                            let mut buf = buffer_out.lock().unwrap();
                            fill_output_from_buffer(&mut fbuf[..], &mut buf, input_channels, output_channels, vol);
                        }
                        for (d, s) in data.iter_mut().zip(fbuf.iter()) { *d = f64::from_sample(*s); }
                    }, move |err| { tracing::error!("Output stream error: {:?}", err); }, None)
                }
                _ => { tracing::error!("Unsupported output sample format"); return; }
            };

            let input_stream = match input_stream { Ok(s) => s, Err(e) => { tracing::error!("Failed to build input stream: {}", e); return; } };
            let output_stream = match output_stream { Ok(s) => s, Err(e) => { tracing::error!("Failed to build output stream: {}", e); return; } };
            if let Err(e) = input_stream.play() { tracing::error!("Failed to start input stream: {}", e); return; }
            if let Err(e) = output_stream.play() { tracing::error!("Failed to start output stream: {}", e); return; }

            info!("Started input capture: {} ch @ {} Hz -> {} ch", input_channels, input_sample_rate, output_channels);
            while !stop_flag_clone.load(Ordering::SeqCst) { std::thread::sleep(std::time::Duration::from_millis(50)); }
            info!("Input capture thread exiting");
        });

        *self.input_capture.lock().unwrap() = Some(InputCaptureControl { stop_flag, join_handle: Some(handle) });
        Ok(())
    }

    pub fn stop_input_capture(&self) -> Result<()> {
        let mut guard = self.input_capture.lock().unwrap();
        if let Some(control) = guard.as_mut() {
            control.stop_flag.store(true, Ordering::SeqCst);
            if let Some(handle) = control.join_handle.take() { let _ = handle.join(); }
        }
        *guard = None;
        info!("Stopped input capture");
        Ok(())
    }
}

static AUDIO_MANAGER: OnceCell<AudioManager> = OnceCell::new();

pub fn get_audio_manager() -> &'static AudioManager {
    AUDIO_MANAGER.get_or_init(|| AudioManager::new().expect("Failed to initialize audio manager"))
} 

struct InputCaptureControl {
    stop_flag: Arc<AtomicBool>,
    join_handle: Option<std::thread::JoinHandle<()>>,
}

fn fill_output_from_buffer(data: &mut [f32], buffer: &mut VecDeque<f32>, in_ch: usize, out_ch: usize, vol: f32) {
    let frames = data.len() / out_ch;
    for frame_idx in 0..frames {
        // Gather one input frame
        let mut inputs: Vec<f32> = vec![0.0; in_ch];
        for c in 0..in_ch {
            if let Some(s) = buffer.pop_front() { inputs[c] = s; } else { inputs[c] = 0.0; }
        }
        // Map to output channels
        for c in 0..out_ch {
            let sample = if in_ch == 0 { 0.0 } else if in_ch == out_ch { inputs[c] } else if in_ch == 1 { inputs[0] } else if out_ch == 1 { inputs.iter().sum::<f32>() / in_ch as f32 } else { // basic stereo from multi-channel
                // use first two channels or average
                if c < in_ch { inputs[c] } else { inputs.iter().take(2).sum::<f32>() / 2.0f32 }
            };
            data[frame_idx * out_ch + c] = (sample * vol).clamp(-1.0, 1.0);
        }
    }
}