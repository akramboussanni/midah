use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use regex::Regex;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::Path,
    sync::OnceLock,
    time::Duration,
};
use tempfile::tempdir;
use tracing::{error, info, warn};
use crate::database;
use crate::dependencies::{DependencyManager, DependencyType};
use tauri_plugin_shell::ShellExt;
use tauri::Emitter;
use tauri_plugin_shell::process::CommandEvent;



#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    pub description: String,
    pub duration: Option<String>,
    pub thumbnail: String,
    pub channel_title: String,
    pub published_at: DateTime<Utc>,
    pub view_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub videos: Vec<VideoInfo>,
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub video_id: String,
    pub status: String,
    pub progress: f32,
    pub downloaded_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
}

pub struct YouTubeService {
    api_key: String,
    client: Client,
}

impl YouTubeService {
    pub fn new(api_key: String) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_default();

        Self { api_key, client }
    }

    pub fn extract_video_id(url: &str) -> Option<String> {
        let patterns = [
            r"youtube\.com/watch\?v=([a-zA-Z0-9_-]{11})",
            r"youtu\.be/([a-zA-Z0-9_-]{11})",
            r"youtube\.com/embed/([a-zA-Z0-9_-]{11})",
            r"youtube\.com/v/([a-zA-Z0-9_-]{11})",
        ];

        for pattern in &patterns {
            if let Some(captures) = Regex::new(pattern).ok().and_then(|re| re.captures(url)) {
                if let Some(video_id) = captures.get(1) {
                    return Some(video_id.as_str().to_string());
                }
            }
        }

        None
    }

    pub async fn get_video_info_by_url(&self, url: &str) -> Result<VideoInfo> {
        let video_id = Self::extract_video_id(url)
            .ok_or_else(|| anyhow::anyhow!("Could not extract video ID from URL"))?;
        
        self.get_video_details(&video_id).await
    }

    pub async fn search_videos(&self, query: &str, max_results: u32, page_token: Option<&str>) -> Result<SearchResult> {
        let url = "https://www.googleapis.com/youtube/v3/search";
        
        let max_results_str = max_results.to_string();
        let mut query_params = vec![
            ("part", "snippet"),
            ("q", query),
            ("type", "video"),
            ("maxResults", &max_results_str),
            ("key", &self.api_key),
        ];
        
        if let Some(token) = page_token {
            query_params.push(("pageToken", token));
        }
        
        let response = self.client
            .get(url)
            .query(&query_params)
            .send()
            .await
            .context("Failed to search YouTube videos")?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            error!("YouTube API error: {}", error_text);
            return Err(anyhow::anyhow!("YouTube API error: {}", error_text));
        }

        let search_response: serde_json::Value = response.json().await?;
        
        let items = search_response["items"]
            .as_array()
            .context("No items in search response")?;

        let mut videos = Vec::new();
        for item in items {
            let video_id = item["id"]["videoId"]
                .as_str()
                .context("No video ID in item")?;
            
            let snippet = &item["snippet"];
            let published_at = DateTime::parse_from_rfc3339(
                snippet["publishedAt"].as_str().unwrap_or("")
            ).unwrap_or_else(|_| Utc::now().into());

            let video_details = self.get_video_details(video_id).await;
            let duration = video_details.ok().and_then(|v| v.duration);

            let video_info = VideoInfo {
                id: video_id.to_string(),
                title: snippet["title"].as_str().unwrap_or("").to_string(),
                description: snippet["description"].as_str().unwrap_or("").to_string(),
                duration,
                thumbnail: snippet["thumbnails"]["medium"]["url"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                channel_title: snippet["channelTitle"].as_str().unwrap_or("").to_string(),
                published_at: published_at.into(),
                view_count: None,
            };

            videos.push(video_info);
        }

        let next_page_token = search_response["nextPageToken"]
            .as_str()
            .map(|s| s.to_string());

        Ok(SearchResult {
            videos,
            next_page_token,
        })
    }

    pub async fn get_video_details(&self, video_id: &str) -> Result<VideoInfo> {
        let url = "https://www.googleapis.com/youtube/v3/videos";
        
        let response = self.client
            .get(url)
            .query(&[
                ("part", "snippet,contentDetails,statistics"),
                ("id", video_id),
                ("key", &self.api_key),
            ])
            .send()
            .await
            .context("Failed to get video details")?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            error!("YouTube API error: {}", error_text);
            return Err(anyhow::anyhow!("YouTube API error: {}", error_text));
        }

        let video_response: serde_json::Value = response.json().await?;
        
        let item = video_response["items"]
            .as_array()
            .and_then(|arr| arr.first())
            .context("No video found")?;

        let snippet = &item["snippet"];
        let content_details = &item["contentDetails"];
        let statistics = &item["statistics"];

        let published_at = DateTime::parse_from_rfc3339(
            snippet["publishedAt"].as_str().unwrap_or("")
        ).unwrap_or_else(|_| Utc::now().into());

        let duration = content_details["duration"]
            .as_str()
            .map(|d| parse_duration(d).unwrap_or_default());

        let view_count = statistics["viewCount"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok());

        Ok(VideoInfo {
            id: video_id.to_string(),
            title: snippet["title"].as_str().unwrap_or("").to_string(),
            description: snippet["description"].as_str().unwrap_or("").to_string(),
            duration,
            thumbnail: snippet["thumbnails"]["medium"]["url"]
                .as_str()
                .unwrap_or("")
                .to_string(),
            channel_title: snippet["channelTitle"].as_str().unwrap_or("").to_string(),
            published_at: published_at.into(),
            view_count,
        })
    }



    pub async fn download_video_with_progress(
        &self,
        app: &tauri::AppHandle,
        video_id: &str,
        output_path: &Path,
    ) -> Result<String> {
        let temp_dir = tempdir().context("Failed to create temp directory")?;
        let output_template = temp_dir.path().join("%(title)s.%(ext)s");

        let dep_manager = DependencyManager::new()
            .context("Failed to initialize dependency manager")?;
        
        let yt_dlp_path = dep_manager.ensure_dependency(app, DependencyType::YtDlp).await
            .context("Failed to ensure yt-dlp is available")?;

        let _ffmpeg_path = dep_manager.ensure_dependency(app, DependencyType::Ffmpeg).await
            .context("Failed to ensure ffmpeg is available")?;

        let video_url = format!("https://www.youtube.com/watch?v={}", video_id);
        
        info!("Starting download for video: {}", video_id);

        let initial_progress = DownloadProgress {
            video_id: video_id.to_string(),
            status: "starting".to_string(),
            progress: 0.0,
            downloaded_bytes: None,
            total_bytes: None,
        };
        let _ = app.emit("youtube-download-progress", initial_progress);

        let (mut child, _) = app
            .shell()
            .command(&yt_dlp_path)
            .args(&[
                "--extract-audio",
                "--audio-format", "mp3",
                "--audio-quality", "0",
                "--output", output_template.to_str().unwrap(),
                "--no-playlist",
                "--progress",
                "--newline",
                &video_url,
            ])
            .spawn()
            .map_err(|e| anyhow::anyhow!("Failed to spawn yt-dlp: {}", e))?;

        // Send initializing status
        let init_progress = DownloadProgress {
            video_id: video_id.to_string(),
            status: "initializing".to_string(),
            progress: 0.0,
            downloaded_bytes: None,
            total_bytes: None,
        };
        let _ = app.emit("youtube-download-progress", init_progress);

        let mut has_seen_progress = false;
        let mut has_reached_100 = false;

        while let Some(event) = child.recv().await {
            match event {
                CommandEvent::Stdout(data) => {
                    if let Ok(line) = String::from_utf8(data) {
                        let line = line.trim();
                        info!("yt-dlp output: {}", line);
                        if line.contains('%') {
                            if let Some(percent_str) = line.split_whitespace().find(|s| s.ends_with('%')) {
                                if let Ok(percent) = percent_str.trim_end_matches('%').parse::<f32>() {
                                    // Mark that we've seen progress
                                    if !has_seen_progress {
                                        has_seen_progress = true;
                                    }
                                    
                                    // Check if we've reached 100%
                                    if percent >= 100.0 && !has_reached_100 {
                                        has_reached_100 = true;
                                    }
                                    
                                    let status = if has_reached_100 {
                                        "finalizing".to_string()
                                    } else {
                                        "downloading".to_string()
                                    };
                                    
                                    let progress_event = DownloadProgress {
                                        video_id: video_id.to_string(),
                                        status,
                                        progress: percent,
                                        downloaded_bytes: None,
                                        total_bytes: None,
                                    };
                                    let _ = app.emit("youtube-download-progress", progress_event);
                                }
                            }
                        }
                    }
                }
                CommandEvent::Stderr(data) => {
                    if let Ok(line) = String::from_utf8(data) {
                        let line = line.trim();
                        if !line.is_empty() && !line.contains("WARNING") {
                            warn!("yt-dlp stderr: {}", line);
                        }
                    }
                }
                CommandEvent::Error(e) => {
                    error!("yt-dlp error: {}", e);
                    let error_progress = DownloadProgress {
                        video_id: video_id.to_string(),
                        status: "error".to_string(),
                        progress: 0.0,
                        downloaded_bytes: None,
                        total_bytes: None,
                    };
                    let _ = app.emit("youtube-download-progress", error_progress);
                    return Err(anyhow::anyhow!("yt-dlp error: {}", e));
                }
                CommandEvent::Terminated(exit_status) => {
                    if exit_status.code != Some(0) {
                        error!("yt-dlp process failed with status: {:?}", exit_status);
                        let error_progress = DownloadProgress {
                            video_id: video_id.to_string(),
                            status: "error".to_string(),
                            progress: 0.0,
                            downloaded_bytes: None,
                            total_bytes: None,
                        };
                        let _ = app.emit("youtube-download-progress", error_progress);
                        return Err(anyhow::anyhow!("yt-dlp process failed"));
                    }
                    break;
                }
                _ => {}
            }
        }

        let completion_progress = DownloadProgress {
            video_id: video_id.to_string(),
            status: "processing".to_string(),
            progress: 95.0,
            downloaded_bytes: None,
            total_bytes: None,
        };
        let _ = app.emit("youtube-download-progress", completion_progress);

        let entries: Vec<_> = fs::read_dir(temp_dir.path())?
            .filter_map(|entry| entry.ok())
            .collect();

        let audio_file = entries
            .iter()
            .find(|entry| {
                entry.path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext == "mp3")
                    .unwrap_or(false)
            })
            .context("No audio file found after download")?;

        let final_path = output_path.join(format!("{}.mp3", video_id));
        if let Some(parent) = final_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| anyhow::anyhow!("Failed to create output directory: {}", e))?;
            }
        }
        
        info!("Copying file to final destination: {:?}", final_path);
        
        fs::copy(&audio_file.path(), &final_path)
            .context("Failed to copy audio file to final destination")?;

        let final_progress = DownloadProgress {
            video_id: video_id.to_string(),
            status: "completed".to_string(),
            progress: 100.0,
            downloaded_bytes: None,
            total_bytes: None,
        };
        let _ = app.emit("youtube-download-progress", final_progress);

        info!("Successfully downloaded video {} to {:?}", video_id, final_path);
        Ok(final_path.to_string_lossy().to_string())
    }
}

fn parse_duration(duration: &str) -> Result<String> { //iso8601
    let duration = duration.trim_start_matches("PT");
    
    let mut hours = 0;
    let mut minutes = 0;
    let mut seconds = 0;
    
    if let Some(h_pos) = duration.find('H') {
        hours = duration[..h_pos].parse::<u32>()?;
    }
    
    if let Some(m_pos) = duration.find('M') {
        let start = if duration.contains('H') { 
            duration.find('H').unwrap() + 1 
        } else { 
            0 
        };
        minutes = duration[start..m_pos].parse::<u32>()?;
    }
    
    if let Some(s_pos) = duration.find('S') {
        let start = if duration.contains('M') { 
            duration.find('M').unwrap() + 1 
        } else if duration.contains('H') {
            duration.find('H').unwrap() + 1
        } else { 
            0 
        };
        seconds = duration[start..s_pos].parse::<u32>()?;
    }
    
    if hours > 0 {
        Ok(format!("{}:{:02}:{:02}", hours, minutes, seconds))
    } else {
        Ok(format!("{}:{:02}", minutes, seconds))
    }
}

static YOUTUBE_SERVICE: OnceLock<YouTubeService> = OnceLock::new();

pub fn init_youtube_service(api_key: String) -> Result<()> {
    let service = YouTubeService::new(api_key);
    YOUTUBE_SERVICE.set(service)
        .map_err(|_| anyhow::anyhow!("YouTube service already initialized"))?;
    Ok(())
}

fn update_youtube_service_api_key(api_key: String) -> Result<()> {
    database::save_setting("youtube_api_key", &api_key)?;
    
    let service = YouTubeService::new(api_key);
    if let Some(_) = YOUTUBE_SERVICE.get() {
        info!("YouTube API key updated - service will use new key on next initialization");
    } else {
        YOUTUBE_SERVICE.set(service)
            .map_err(|_| anyhow::anyhow!("Failed to set YouTube service"))?;
    }
    info!("Updated YouTube API key");
    Ok(())
}

fn get_youtube_service() -> Result<&'static YouTubeService> {
    YOUTUBE_SERVICE
        .get()
        .context("YouTube service not initialized")
}

#[tauri::command]
pub async fn search_videos(query: String, max_results: u32, page_token: Option<String>) -> Result<SearchResult, String> {
    let service = get_youtube_service().map_err(|e| e.to_string())?;
    service
        .search_videos(&query, max_results, page_token.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_video_info(video_id: String) -> Result<VideoInfo, String> {
    let service = get_youtube_service().map_err(|e| e.to_string())?;
    service
        .get_video_details(&video_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_video_info_by_url(url: String) -> Result<VideoInfo, String> {
    let service = get_youtube_service().map_err(|e| e.to_string())?;
    service
        .get_video_info_by_url(&url)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn download_video(
    app: tauri::AppHandle,
    video_id: String,
    output_path: String
) -> Result<String, String> {
    let service = get_youtube_service().map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&output_path);
    
    service
        .download_video_with_progress(&app, &video_id, path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_youtube_api_key(api_key: String) -> Result<(), String> {
    update_youtube_service_api_key(api_key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_youtube_api_key() -> Result<Option<String>, String> {
    database::get_setting("youtube_api_key").map_err(|e| e.to_string())
} 
