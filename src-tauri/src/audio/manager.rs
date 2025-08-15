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

        if let Some(virtual_device) = manager.find_virtual_audio_device() {
            let device_name = virtual_device.name().unwrap_or_default();
            manager.set_virtual_device(&device_name)?;
            info!("Found and set virtual audio device: {}", device_name);
        } else {
            warn!("Virtual audio device not found");
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

    pub fn find_virtual_audio_device(&self) -> Option<Device> {
        if let Ok(output_devices) = self.host.output_devices() {
            for device in output_devices {
                let name = device.name().unwrap_or_default();
                info!("Checking output device: {}", name);
                if crate::external::virtual_audio::is_virtual_audio_device(&name) {
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

    fn set_device_from_iterator<I>(&self, device_ref: &Arc<Mutex<Option<Device>>>, devices: I, device_name: &str, device_type: &str) -> Result<()>
    where
        I: IntoIterator<Item = Device>,
    {
        let device = devices
            .into_iter()
            .find(|d| d.name().unwrap_or_default() == device_name)
            .context("Device not found")?;
        *device_ref.lock().unwrap() = Some(device);
        info!("Set {} device to: {}", device_type, device_name);
        Ok(())
    }

    pub fn set_output_device(&self, device_name: &str) -> Result<()> {
        let devices = self.host.output_devices()?;
        self.set_device_from_iterator(&self.output_device, devices, device_name, "output")
    }

    pub fn set_input_device(&self, device_name: &str) -> Result<()> {
        let devices = self.host.input_devices()?;
        self.set_device_from_iterator(&self.input_device, devices, device_name, "input")
    }

    fn get_volume(&self, volume_ref: &Arc<Mutex<f32>>) -> f32 {
        *volume_ref.lock().unwrap()
    }

    fn set_volume(&self, volume_ref: &Arc<Mutex<f32>>, volume: f32) -> Result<()> {
        let volume = volume.clamp(0.0, 1.0);
        *volume_ref.lock().unwrap() = volume;
        Ok(())
    }

    pub fn get_virtual_volume(&self) -> f32 {
        self.get_volume(&self.virtual_volume)
    }

    pub fn set_virtual_volume(&self, volume: f32) -> Result<()> {
        self.set_volume(&self.virtual_volume, volume)
    }

    pub fn get_output_volume(&self) -> f32 {
        self.get_volume(&self.output_volume)
    }

    pub fn set_output_volume(&self, volume: f32) -> Result<()> {
        self.set_volume(&self.output_volume, volume)
    }

    pub fn get_input_volume(&self) -> f32 {
        self.get_volume(&self.input_volume)
    }

    pub fn set_input_volume(&self, volume: f32) -> Result<()> {
        self.set_volume(&self.input_volume, volume)
    }

    fn get_device(&self, device_ref: &Arc<Mutex<Option<Device>>>) -> Option<Device> {
        device_ref.lock().unwrap().clone()
    }

    pub fn get_virtual_device(&self) -> Option<cpal::Device> {
        self.get_device(&self.virtual_device)
    }

    pub fn get_output_device(&self) -> Option<cpal::Device> {
        self.get_device(&self.output_device)
    }

    pub fn get_input_device(&self) -> Option<cpal::Device> {
        self.get_device(&self.input_device)
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

            let buffer_in = buffer.clone();
            let input_stream = {
                    let cfg: StreamConfig = input_config.clone().into();
                let error_fn = move |err| { tracing::error!("Input stream error: {:?}", err); };
                
                match input_config.sample_format() {
                    SampleFormat::F32 => input_device.build_input_stream(&cfg, create_input_stream_callback(buffer_in, |x: f32| x), error_fn, None),
                    SampleFormat::I16 => input_device.build_input_stream(&cfg, create_input_stream_callback(buffer_in, |x: i16| x as f32 / i16::MAX as f32), error_fn, None),
                    SampleFormat::U16 => input_device.build_input_stream(&cfg, create_input_stream_callback(buffer_in, |x: u16| (x as f32 - 32768.0) / 32768.0), error_fn, None),
                    SampleFormat::I8 => input_device.build_input_stream(&cfg, create_input_stream_callback(buffer_in, |x: i8| x as f32 / i8::MAX as f32), error_fn, None),
                    SampleFormat::U8 => input_device.build_input_stream(&cfg, create_input_stream_callback(buffer_in, |x: u8| (x as f32 - 128.0) / 128.0), error_fn, None),
                    SampleFormat::I32 => input_device.build_input_stream(&cfg, create_input_stream_callback(buffer_in, |x: i32| x as f32 / i32::MAX as f32), error_fn, None),
                    SampleFormat::U32 => input_device.build_input_stream(&cfg, create_input_stream_callback(buffer_in, |x: u32| (x as f32 - 2147483648.0) / 2147483648.0), error_fn, None),
                    SampleFormat::F64 => input_device.build_input_stream(&cfg, create_input_stream_callback(buffer_in, |x: f64| x as f32), error_fn, None),
                    _ => { tracing::error!("Unsupported input sample format"); return; }
                }
            };

            let buffer_out = buffer.clone();
            let output_stream = {
                    let cfg: StreamConfig = output_config.clone().into();
                let error_fn = move |err| { tracing::error!("Output stream error: {:?}", err); };
                
                match output_config.sample_format() {
                    SampleFormat::F32 => output_device.build_output_stream(&cfg, create_output_stream_callback(buffer_out, input_volume_ref, virtual_volume_ref, input_channels, output_channels, |x: f32| x), error_fn, None),
                    SampleFormat::I8 => output_device.build_output_stream(&cfg, create_output_stream_callback(buffer_out, input_volume_ref, virtual_volume_ref, input_channels, output_channels, i8::from_sample), error_fn, None),
                    SampleFormat::U8 => output_device.build_output_stream(&cfg, create_output_stream_callback(buffer_out, input_volume_ref, virtual_volume_ref, input_channels, output_channels, u8::from_sample), error_fn, None),
                    SampleFormat::I16 => output_device.build_output_stream(&cfg, create_output_stream_callback(buffer_out, input_volume_ref, virtual_volume_ref, input_channels, output_channels, i16::from_sample), error_fn, None),
                    SampleFormat::U16 => output_device.build_output_stream(&cfg, create_output_stream_callback(buffer_out, input_volume_ref, virtual_volume_ref, input_channels, output_channels, u16::from_sample), error_fn, None),
                    SampleFormat::I32 => output_device.build_output_stream(&cfg, create_output_stream_callback(buffer_out, input_volume_ref, virtual_volume_ref, input_channels, output_channels, i32::from_sample), error_fn, None),
                    SampleFormat::U32 => output_device.build_output_stream(&cfg, create_output_stream_callback(buffer_out, input_volume_ref, virtual_volume_ref, input_channels, output_channels, u32::from_sample), error_fn, None),
                    SampleFormat::F64 => output_device.build_output_stream(&cfg, create_output_stream_callback(buffer_out, input_volume_ref, virtual_volume_ref, input_channels, output_channels, f64::from_sample), error_fn, None),
                    _ => { tracing::error!("Unsupported output sample format"); return; }
                }
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

fn create_input_stream_callback<T>(
    buffer: Arc<Mutex<VecDeque<f32>>>,
    converter: fn(T) -> f32,
) -> impl Fn(&[T], &cpal::InputCallbackInfo) + Send + 'static
where
    T: Sample + Send + 'static,
{
    move |data: &[T], _| {
        let mut buf = buffer.lock().unwrap();
        if buf.len() > buf.capacity().saturating_sub(data.len()) {
            let drain = data.len().min(1024);
            buf.drain(..drain);
        }
        for &sample in data {
            buf.push_back(converter(sample));
        }
    }
}

fn create_output_stream_callback<T>(
    buffer: Arc<Mutex<VecDeque<f32>>>,
    input_volume_ref: Arc<Mutex<f32>>,
    virtual_volume_ref: Arc<Mutex<f32>>,
    input_channels: usize,
    output_channels: usize,
    converter: fn(f32) -> T,
) -> impl Fn(&mut [T], &cpal::OutputCallbackInfo) + Send + 'static
where
    T: Sample + Send + 'static,
{
    move |data: &mut [T], _| {
        let input_vol = *input_volume_ref.lock().unwrap();
        let virt_vol = *virtual_volume_ref.lock().unwrap();
        let vol = (input_vol * virt_vol).clamp(0.0, 1.0);
        
        if std::mem::size_of::<T>() == std::mem::size_of::<f32>() {
            let f32_data = unsafe { 
                std::slice::from_raw_parts_mut(data.as_mut_ptr() as *mut f32, data.len())
            };
            let mut buf = buffer.lock().unwrap();
            fill_output_from_buffer(f32_data, &mut buf, input_channels, output_channels, vol);
        } else {
            let mut fbuf = vec![0.0f32; data.len()];
            {
                let mut buf = buffer.lock().unwrap();
                fill_output_from_buffer(&mut fbuf[..], &mut buf, input_channels, output_channels, vol);
            }
            for (d, s) in data.iter_mut().zip(fbuf.iter()) {
                *d = converter(*s);
            }
        }
    }
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
            let sample = if in_ch == 0 { 0.0 } else if in_ch == out_ch { inputs[c] } else if in_ch == 1 { inputs[0] } else if out_ch == 1 { inputs.iter().sum::<f32>() / in_ch as f32 } else {
                // use first two channels or average
                if c < in_ch { inputs[c] } else { inputs.iter().take(2).sum::<f32>() / 2.0f32 }
            };
            data[frame_idx * out_ch + c] = (sample * vol).clamp(-1.0, 1.0);
        }
    }
}