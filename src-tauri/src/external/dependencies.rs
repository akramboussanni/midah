use anyhow::{Context, Result};
use std::{
    env,
    fs,
    path::{Path, PathBuf},
};
use reqwest::Client;
use tempfile::tempdir;
use tracing::info;
use zip::ZipArchive;
use std::io::Cursor;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri::AppHandle;
use tokio::time::{timeout, Duration};


#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DependencyType {
    YtDlp,
    Ffmpeg,
}

impl DependencyType {
    pub fn name(&self) -> &'static str {
        match self {
            DependencyType::YtDlp => "yt-dlp",
            DependencyType::Ffmpeg => "ffmpeg",
        }
    }

    pub fn executable_name(&self) -> &'static str {
        match self {
            DependencyType::YtDlp => if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" },
            DependencyType::Ffmpeg => if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" },
        }
    }

    pub fn version_arg(&self) -> &'static str {
        match self {
            DependencyType::YtDlp => "--version",
            DependencyType::Ffmpeg => "-version",
        }
    }

    fn get_download_url(&self, platform: &str) -> Result<String> {
        match self {
            DependencyType::YtDlp => {
                let url = match platform {
                    "windows-x64" | "windows-x86" => {
                        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
                    }
                    _ => {
                        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
                    }
                };
                Ok(url.to_string())
            }
            DependencyType::Ffmpeg => {
                let url = match platform {
                    "windows-x64" => {
                        "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
                    }
                    "windows-x86" => {
                        "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win32-gpl.zip"
                    }
                    "macos-x64" => {
                        "https://evermeet.cx/ffmpeg/getrelease/zip"
                    }
                    "macos-arm64" => {
                        "https://evermeet.cx/ffmpeg/getrelease/zip"
                    }
                    "linux-x64" => {
                        "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
                    }
                    "linux-arm64" => {
                        "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz"
                    }
                    _ => {
                        return Err(anyhow::anyhow!("Unsupported platform for ffmpeg: {}", platform));
                    }
                };
                Ok(url.to_string())
            }
        }
    }

    fn is_archive_download(&self) -> bool {
        matches!(self, DependencyType::Ffmpeg)
    }

    fn find_in_extracted_files(&self, dir: &Path) -> Result<PathBuf> {
        let executable_name = self.executable_name();
        
        for entry in fs::read_dir(dir).context("Failed to read directory")? {
            let entry = entry.context("Failed to read directory entry")?;
            let path = entry.path();
            
            if path.is_file() {
                if let Some(name) = path.file_name() {
                    if name == executable_name {
                        return Ok(path);
                    }
                }
            } else if path.is_dir() {
                if let Ok(sub_path) = self.find_in_extracted_files(&path) {
                    return Ok(sub_path);
                }
            }
        }
        
        Err(anyhow::anyhow!("{} executable not found in extracted files", self.name()))
    }
}

pub struct DependencyManager {
    client: Client,
    download_dir: PathBuf,
}

impl DependencyManager {
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .context("Failed to create HTTP client")?;

        let download_dir = Self::get_download_dir()?;
        fs::create_dir_all(&download_dir).context("Failed to create download directory")?;

        Ok(Self {
            client,
            download_dir,
        })
    }

    fn get_download_dir() -> Result<PathBuf> {
        let app_dir = dirs::data_dir()
            .ok_or_else(|| anyhow::anyhow!("Could not determine data directory"))?
            .join("midah")
            .join("dependencies");
        Ok(app_dir)
    }

    pub async fn find_dependency(&self, app_handle: &tauri::AppHandle, dep_type: DependencyType) -> Result<PathBuf> {
        let executable_name = dep_type.executable_name();
        info!("Checking for {} (executable: {})", dep_type.name(), executable_name);
        
        let dep_path = self.download_dir.join(executable_name);
        if dep_path.exists() {
            info!("{} found in download dir: {:?}", dep_type.name(), dep_path);
            return Ok(dep_path);
        }
        info!("{} not found in download dir: {:?}", dep_type.name(), dep_path);
        
        let which_cmd = if cfg!(windows) { "where" } else { "which" };
        info!("Running {} {} to find {}", which_cmd, executable_name, dep_type.name());
        
        let which_result = call_shell_process(
            app_handle,
            which_cmd,
            &[executable_name],
            None,
            5,
        ).await;
        
        match which_result {
            Ok(result) => {
                info!("{} command output: stdout='{}', stderr='{}', exit_code={:?}", 
                      which_cmd, result.stdout, result.stderr, result.exit_code);
                let path_str = result.stdout.trim();
                if !path_str.is_empty() {
                    let first_path = path_str.lines().next().unwrap_or(path_str);
                    let path = PathBuf::from(first_path);
                    info!("Found {} at: {:?}", dep_type.name(), path);
                    
                    info!("Running version check: {} {}", path.to_string_lossy(), dep_type.version_arg());
                    let version_result = call_shell_process(
                        app_handle,
                        &path.to_string_lossy(),
                        &[dep_type.version_arg()],
                        None,
                        5,
                    ).await;
                    
                    match version_result {
                        Ok(ver_result) => {
                            info!("Version check output: stdout='{}', stderr='{}', exit_code={:?}", 
                                  ver_result.stdout, ver_result.stderr, ver_result.exit_code);
                            if ver_result.exit_code == Some(0) {
                                info!("{} version check successful", dep_type.name());
                                return Ok(path);
                            } else {
                                info!("{} version check failed with exit code: {:?}", dep_type.name(), ver_result.exit_code);
                            }
                        }
                        Err(e) => {
                            info!("{} version check failed: {}", dep_type.name(), e);
                        }
                    }
                } else {
                    info!("{} command returned empty output", which_cmd);
                }
            }
            Err(e) => {
                info!("{} command failed: {}", which_cmd, e);
            }
        }
        
        info!("{} not found", dep_type.name());
        Err(anyhow::anyhow!("{} not found", dep_type.name()))
    }

    pub async fn ensure_dependency(&self, app_handle: &tauri::AppHandle, dep_type: DependencyType) -> Result<PathBuf> {
        if let Ok(path) = self.find_dependency(app_handle, dep_type).await {
            info!("{} found at: {:?}", dep_type.name(), path);
            return Ok(path);
        }
        info!("{} not found, downloading...", dep_type.name());
        self.download_dependency(dep_type).await
    }

    async fn download_dependency(&self, dep_type: DependencyType) -> Result<PathBuf> {
        let platform = self.get_platform()?;
        let download_url = dep_type.get_download_url(&platform)?;
        
        info!("Downloading {} from: {}", dep_type.name(), download_url);
        
        let response = self.client
            .get(&download_url)
            .send()
            .await
            .context(format!("Failed to download {}", dep_type.name()))?;

        if !response.status().is_success() {
            return Err(anyhow::anyhow!("Failed to download {}: HTTP {}", dep_type.name(), response.status()));
        }

        let bytes = response.bytes().await.context("Failed to read response")?;
        
        if dep_type.is_archive_download() {
            self.download_and_extract_archive(dep_type, &bytes).await
        } else {
            self.download_binary(dep_type, &bytes).await
        }
    }

    async fn download_binary(&self, dep_type: DependencyType, bytes: &[u8]) -> Result<PathBuf> {
        let executable_name = dep_type.executable_name();
        let dep_path = self.download_dir.join(executable_name);

        fs::write(&dep_path, bytes).context(format!("Failed to write {} binary", dep_type.name()))?;

        self.set_executable_permissions(&dep_path)?;

        info!("Successfully downloaded {} to: {:?}", dep_type.name(), dep_path);
        Ok(dep_path)
    }

    async fn download_and_extract_archive(&self, dep_type: DependencyType, bytes: &[u8]) -> Result<PathBuf> {
        let temp_dir = tempdir().context("Failed to create temp directory")?;
        
        if bytes.starts_with(b"PK") {
            self.extract_zip_archive(bytes, temp_dir.path()).await?;
        } else {
            self.extract_tar_xz_archive(bytes, temp_dir.path()).await?;
        }

        let extracted_path = dep_type.find_in_extracted_files(temp_dir.path())?;
        let executable_name = dep_type.executable_name();
        let final_path = self.download_dir.join(executable_name);
        
        fs::copy(&extracted_path, &final_path).context(format!("Failed to copy {}", dep_type.name()))?;

        self.set_executable_permissions(&final_path)?;

        info!("Successfully downloaded {} to: {:?}", dep_type.name(), final_path);
        Ok(final_path)
    }

    fn set_executable_permissions(&self, _path: &Path) -> Result<()> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(path)?.permissions();
            perms.set_mode(0o755);
            fs::set_permissions(path, perms).context("Failed to set executable permissions")?;
        }
        Ok(())
    }

    async fn extract_zip_archive(&self, bytes: &[u8], extract_dir: &Path) -> Result<()> {
        let cursor = Cursor::new(bytes);
        let mut archive = ZipArchive::new(cursor).context("Failed to read zip archive")?;
        
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).context("Failed to access archive file")?;
            let outpath = extract_dir.join(file.name());
            
            if file.name().ends_with('/') {
                fs::create_dir_all(&outpath).context("Failed to create directory")?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        fs::create_dir_all(p).context("Failed to create parent directory")?;
                    }
                }
                let mut outfile = fs::File::create(&outpath).context("Failed to create file")?;
                std::io::copy(&mut file, &mut outfile).context("Failed to write file")?;
            }
        }
        
        Ok(())
    }

    async fn extract_tar_xz_archive(&self, bytes: &[u8], extract_dir: &Path) -> Result<()> {
        use std::io::Read;
        
        let mut decoder = xz2::read::XzDecoder::new(bytes);
        let mut decompressed = Vec::new();
        decoder.read_to_end(&mut decompressed).context("Failed to decompress XZ data")?;
        
        let mut archive = tar::Archive::new(&decompressed[..]);
        archive.unpack(extract_dir).context("Failed to extract TAR archive")?;
        
        Ok(())
    }

    fn get_platform(&self) -> Result<String> {
        let os = env::consts::OS;
        let arch = env::consts::ARCH;
        
        match (os, arch) {
            ("windows", "x86_64") => Ok("windows-x64".to_string()),
            ("windows", "x86") => Ok("windows-x86".to_string()),
            ("macos", "x86_64") => Ok("macos-x64".to_string()),
            ("macos", "aarch64") => Ok("macos-arm64".to_string()),
            ("linux", "x86_64") => Ok("linux-x64".to_string()),
            ("linux", "aarch64") => Ok("linux-arm64".to_string()),
            _ => Err(anyhow::anyhow!("Unsupported platform: {} {}", os, arch)),
        }
    }


}
#[derive(Debug)]
pub struct ShellProcessResult {
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

pub async fn call_shell_process(
    app_handle: &AppHandle,
    program: &str,
    args: &[&str],
    current_dir: Option<&str>,
    timeout_secs: u64,
) -> Result<ShellProcessResult, String> {
    info!("Spawning shell process: {} {:?} (cwd: {:?})", program, args, current_dir);
    
    let mut command = app_handle.shell().command(program);
    for arg in args {
        command = command.arg(arg);
    }
    if let Some(dir) = current_dir {
        command = command.current_dir(dir);
    }
    
    let (mut rx, _child) = command.spawn()
        .map_err(|e| {
            let error_msg = format!("Failed to spawn {}: {}", program, e);
            info!("{}", error_msg);
            error_msg
        })?;

    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut exit_code = None;

    let result = timeout(Duration::from_secs(timeout_secs), async {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(data) => {
                    if let Ok(text) = String::from_utf8(data) {
                        stdout.push_str(&text);
                    }
                }
                CommandEvent::Stderr(data) => {
                    if let Ok(text) = String::from_utf8(data) {
                        stderr.push_str(&text);
                    }
                }
                CommandEvent::Terminated(status) => {
                    exit_code = status.code;
                    return true;
                }
                _ => {}
            }
        }
        false
    }).await;

    match result {
        Ok(true) => {
            info!("Shell process completed: {} (exit_code: {:?}, stdout: '{}', stderr: '{}')", 
                  program, exit_code, stdout, stderr);
            Ok(ShellProcessResult { exit_code, stdout, stderr })
        }
        Ok(false) => {
            let error_msg = format!("{} did not complete", program);
            info!("{}", error_msg);
            Err(error_msg)
        }
        Err(_) => {
            let _ = _child.kill();
            let error_msg = format!("{} timed out", program);
            info!("{}", error_msg);
            Err(error_msg)
        }
    }
}