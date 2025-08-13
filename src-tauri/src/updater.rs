use serde::Deserialize;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use serde_json::json;
use tokio::fs as async_fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Clone)]
pub struct UpdateInfoPayload {
    pub version: String,
    pub changelog: String,
    pub msi_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubReleaseResponse {
    tag_name: String,
    body: String,
    assets: Option<Vec<GithubAsset>>,    
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

pub async fn check_for_update(app: AppHandle) {
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    let repo = crate::GITHUB_REPO;
    let url = format!("https://api.github.com/repos/{}/releases/latest", repo);

    let client = match reqwest::Client::builder()
        .user_agent("midah-updater")
        .build()
    {
        Ok(c) => c,
        Err(_) => return,
    };

    let response = match client.get(url).send().await {
        Ok(r) => r,
        Err(_) => return,
    };

    if !response.status().is_success() {
        return;
    }

    let release: GithubReleaseResponse = match response.json().await {
        Ok(j) => j,
        Err(_) => return,
    };

    let latest_version_raw = release.tag_name.trim().trim_start_matches('v').to_string();

    if is_version_newer(&latest_version_raw, &current_version) {
        let msi_url = release
            .assets
            .unwrap_or_default()
            .into_iter()
            .find(|a| a.name.to_lowercase().ends_with(".msi"))
            .map(|a| a.browser_download_url);
        let payload = UpdateInfoPayload {
            version: latest_version_raw,
            changelog: release.body,
            msi_url,
        };
        let _ = app.emit("update-available", payload);
    }
}

fn is_version_newer(latest: &str, current: &str) -> bool {

    fn parse_parts(v: &str) -> Vec<i64> {
        v.split('.')
            .map(|p| p.chars().take_while(|c| c.is_ascii_digit()).collect::<String>())
            .map(|n| n.parse::<i64>().unwrap_or(0))
            .collect()
    }

    let mut l = parse_parts(latest);
    let mut c = parse_parts(current);

    let len = l.len().max(c.len());
    l.resize(len, 0);
    c.resize(len, 0);

    for (la, cu) in l.iter().zip(c.iter()) {
        if la > cu {
            return true;
        } else if la < cu {
            return false;
        }
    }

    false
}

#[tauri::command]
pub async fn download_and_install_update(app: AppHandle, msi_url: String) -> Result<(), String> {
    if !msi_url.to_lowercase().ends_with(".msi") {
        return Err("Provided URL is not an MSI".to_string());
    }
    if !msi_url.starts_with("https://github.com/") && !msi_url.starts_with("https://objects.githubusercontent.com/") {
        return Err("Update URL must be from GitHub".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("midah-updater")
        .build()
        .map_err(|e| e.to_string())?;

    let _ = app.emit("update-progress", json!({"status":"downloading"}));
    let bytes = client
        .get(&msi_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download MSI: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("Failed to read MSI bytes: {}", e))?;

    let mut target_path: PathBuf = std::env::temp_dir();
    target_path.push("midah-update.msi");
    async_fs::write(&target_path, &bytes)
        .await
        .map_err(|e| format!("Failed to write MSI: {}", e))?;

    let _ = app.emit("update-progress", json!({"status":"downloaded"}));

    let mut log_path: PathBuf = std::env::temp_dir();
    log_path.push("midah-install.log");
    let args = vec![
        "/i".to_string(),
        target_path.to_string_lossy().to_string(),
        "/L*V".to_string(),
        log_path.to_string_lossy().to_string(),
        "/norestart".to_string(),
    ];

    let _ = app.emit("update-progress", json!({"status":"installing", "logPath": log_path.to_string_lossy()}));

    let status = tokio::process::Command::new("msiexec")
        .args(args.clone())
        .status()
        .await
        .map_err(|e| format!("Failed to run installer: {}", e))?;

    if !status.success() {
        let _ = app.emit("update-progress", json!({"status":"error", "message": format!("Installer exited with status {:?}", status.code())}));
        return Err(format!("Installer failed with status {:?}", status.code()));
    }

    let _ = app.emit("update-progress", json!({"status":"installed"}));

    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut signal_path: PathBuf = std::env::temp_dir();
    signal_path.push(format!("midah-launched-{}.flag", chrono::Utc::now().timestamp_millis()));
    let signal_str = signal_path.to_string_lossy().to_string();
    let _ = async_fs::remove_file(&signal_path).await;

    let _ = app.emit("update-progress", json!({"status":"launching_new"}));

    let _child = tokio::process::Command::new(&exe_path)
        .arg(format!("--update-launched-signal={}", signal_str))
        .spawn()
        .map_err(|e| format!("Failed to launch new app: {}", e))?;

    let mut launched_ok = false;
    for _ in 0..40 {
        if async_fs::metadata(&signal_path).await.is_ok() {
            launched_ok = true;
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }

    if launched_ok {
        let _ = app.emit("update-progress", json!({"status":"new_launched"}));
        app.exit(0);
        Ok(())
    } else {
        let _ = app.emit("update-progress", json!({"status":"launch_failed"}));
        Err("New app did not signal readiness; leaving current app running".to_string())
    }
}


