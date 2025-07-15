use anyhow::Result;
use rodio::Source;
use std::{
    collections::VecDeque,
    fs::File,
};
use symphonia::core::{
    audio::{AudioBufferRef, Signal},
    codecs::{DecoderOptions, CODEC_TYPE_NULL},
    errors::Error as SymphoniaError,
    formats::FormatOptions,
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
    units::Time,
};
use tracing::{error, info};

pub struct SymphoniaAudioSource {
    decoder: Box<dyn symphonia::core::codecs::Decoder>,
    format: Box<dyn symphonia::core::formats::FormatReader>,
    track_id: u32,
    current_ts: u64,
    end_ts: Option<u64>,
    sample_rate: u32,
    channels: u16,
    _start_position: f32,
    _samples_skipped: usize,
    sample_buffer: VecDeque<f32>,
}

impl SymphoniaAudioSource {
    pub fn new(file_path: &str, start_position: f32) -> Result<Self> {
        let src = MediaSourceStream::new(Box::new(File::open(file_path)?), Default::default());
        let mut hint = Hint::new();
        if let Some(extension) = std::path::Path::new(file_path).extension() {
            if let Some(extension_str) = extension.to_str() {
                hint.with_extension(extension_str);
            }
        }
        
        let meta_opts: MetadataOptions = Default::default();
        let fmt_opts: FormatOptions = Default::default();
        
        let probed = symphonia::default::get_probe().format(&hint, src, &fmt_opts, &meta_opts)?;
        let mut format = probed.format;
        
        // Find the first audio track
        let track = format.tracks().iter().find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
            .ok_or_else(|| anyhow::anyhow!("No supported audio tracks"))?;
        let track_id = track.id;
        let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
        let channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(2);
        let end_ts = track.codec_params.n_frames;
        
        let dec_opts: DecoderOptions = Default::default();
        let mut decoder = symphonia::default::get_codecs().make(&track.codec_params, &dec_opts)?;
        
        // Seek to the start position if specified
        if start_position > 0.0 {
            format.seek(symphonia::core::formats::SeekMode::Accurate, symphonia::core::formats::SeekTo::Time {
                time: Time { seconds: start_position as u64, frac: 0.0 },
                track_id: Some(track_id),
            })?;
            
            // Reset the decoder after seeking
            decoder.reset();
        }
        
        // Calculate the starting timestamp
        let start_ts = (start_position * sample_rate as f32) as u64;
        
        // Create the source
        let mut source = Self {
            decoder,
            format,
            track_id,
            current_ts: start_ts,
            end_ts,
            sample_rate,
            channels: channels.try_into().unwrap_or(2),
            _start_position: start_position,
            _samples_skipped: 0,
            sample_buffer: VecDeque::new(),
        };
        
        // Prime the decoder by reading the first packet
        // This ensures the decoder is properly initialized
        source.prime_decoder()?;
        
        Ok(source)
    }
    
    fn decode_and_buffer(decoded: AudioBufferRef, channels: u16) -> Option<VecDeque<f32>> {
        let channels = channels as usize;
        let frames = decoded.frames();
        let mut interleaved = Vec::with_capacity(frames * channels);

        match decoded {
            AudioBufferRef::F32(buf) => {
                for frame in 0..frames {
                    for ch in 0..channels {
                        interleaved.push(buf.chan(ch)[frame]);
                    }
                }
            }
            AudioBufferRef::S16(buf) => {
                for frame in 0..frames {
                    for ch in 0..channels {
                        interleaved.push(buf.chan(ch)[frame] as f32 / i16::MAX as f32);
                    }
                }
            }
            AudioBufferRef::S24(buf) => {
                for frame in 0..frames {
                    for ch in 0..channels {
                        interleaved.push(buf.chan(ch)[frame].inner() as f32 / 8388608.0);
                    }
                }
            }
            AudioBufferRef::S32(buf) => {
                for frame in 0..frames {
                    for ch in 0..channels {
                        interleaved.push(buf.chan(ch)[frame] as f32 / i32::MAX as f32);
                    }
                }
            }
            AudioBufferRef::U8(buf) => {
                for frame in 0..frames {
                    for ch in 0..channels {
                        interleaved.push((buf.chan(ch)[frame] as f32 - 128.0) / 128.0);
                    }
                }
            }
            _ => return None,
        }

        Some(VecDeque::from(interleaved))
    }
    
    fn prime_decoder(&mut self) -> Result<()> {
        // Read the first packet to prime the decoder
        loop {
            let packet = self.format.next_packet()?;
            if packet.track_id() == self.track_id {
                // Decode the packet to prime the decoder
                match self.decoder.decode(&packet) {
                    Ok(decoded) => {
                        // Convert the decoded audio to our sample buffer
                        if let Some(buffer) = Self::decode_and_buffer(decoded, self.channels) {
                            self.sample_buffer = buffer;
                            break;
                        }
                    }
                    Err(SymphoniaError::IoError(_)) => {
                        return Err(anyhow::anyhow!("Failed to prime decoder: IO error"));
                    }
                    Err(err) => {
                        return Err(anyhow::anyhow!("Failed to prime decoder: {}", err));
                    }
                }
            }
        }
        Ok(())
    }
}

impl Iterator for SymphoniaAudioSource {
    type Item = f32;
    
    fn next(&mut self) -> Option<Self::Item> {
        // First, return any samples we have in the buffer
        if let Some(sample) = self.sample_buffer.pop_front() {
            self.current_ts += 1;
            return Some(sample);
        }
        
        loop {
            if let Some(end_ts) = self.end_ts {
                if self.current_ts >= end_ts {
                    info!("Audio source reached end timestamp: {} >= {}", self.current_ts, end_ts);
                    return None;
                }
            }
            
            let packet = match self.format.next_packet() {
                Ok(packet) => packet,
                Err(SymphoniaError::ResetRequired) => {
                    info!("Audio source requires reset");
                    return None;
                }
                Err(SymphoniaError::IoError(err)) => {
                    if err.kind() == std::io::ErrorKind::UnexpectedEof {
                        info!("Audio source reached end of file");
                        return None;
                    }
                    error!("Audio source IO error: {}", err);
                    return None;
                }
                Err(err) => {
                    error!("Audio source decode error: {}", err);
                    return None;
                }
            };
            
            while !self.format.metadata().is_latest() {
                self.format.metadata().pop();
            }
            
            if packet.track_id() != self.track_id {
                continue;
            }
            
            match self.decoder.decode(&packet) {
                Ok(decoded) => {
                    if let Some(buffer) = Self::decode_and_buffer(decoded, self.channels) {
                        self.sample_buffer = buffer;
                        // Return the first sample from the new buffer
                        if let Some(sample) = self.sample_buffer.pop_front() {
                            self.current_ts += 1;
                            return Some(sample);
                        } else {
                            continue;
                        }
                    } else {
                        continue;
                    }
                }
                Err(SymphoniaError::IoError(_)) => {
                    info!("Audio source decoder IO error");
                    return None;
                }
                Err(err) => {
                    error!("Audio source decoder error: {}", err);
                    return None;
                }
            }
        }
    }
}

impl Source for SymphoniaAudioSource {
    fn current_frame_len(&self) -> Option<usize> {
        None // Streaming source
    }
    
    fn channels(&self) -> u16 {
        self.channels
    }
    
    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
    
    fn total_duration(&self) -> Option<std::time::Duration> {
        if let Some(end_ts) = self.end_ts {
            let duration_seconds = (end_ts - self.current_ts) as f64 / self.sample_rate as f64;
            Some(std::time::Duration::from_secs_f64(duration_seconds))
        } else {
            None
        }
    }
}

pub fn get_audio_duration(file_path: &str) -> Result<f32> {
    let src = MediaSourceStream::new(Box::new(File::open(file_path)?), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = std::path::Path::new(file_path).extension() {
        if let Some(extension_str) = extension.to_str() {
            hint.with_extension(extension_str);
        }
    }
    let meta_opts: MetadataOptions = Default::default();
    let fmt_opts: FormatOptions = Default::default();
    let probed = symphonia::default::get_probe().format(&hint, src, &fmt_opts, &meta_opts)?;
    let format = probed.format;
    let track = format.tracks().iter().find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| anyhow::anyhow!("No supported audio tracks"))?;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    let duration = if let Some(n_frames) = track.codec_params.n_frames {
        n_frames as f32 / sample_rate as f32
    } else {
        return Err(anyhow::anyhow!("Could not determine audio duration: n_frames missing"));
    };
    Ok(duration)
} 