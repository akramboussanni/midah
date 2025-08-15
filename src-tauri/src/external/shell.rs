use anyhow::Result;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tokio::time::{timeout, Duration};
use tracing::info;

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

#[tauri::command]
pub async fn open_browser(app_handle: AppHandle, url: String) -> Result<(), String> {
    info!("Opening URL in browser: {}", url);
    
    #[cfg(target_os = "windows")]
    let result = call_shell_process(&app_handle, "cmd", &["/C", "start", &url], None, 5).await;
    
    #[cfg(target_os = "macos")]
    let result = call_shell_process(&app_handle, "open", &[&url], None, 5).await;
    
    #[cfg(target_os = "linux")]
    let result = call_shell_process(&app_handle, "xdg-open", &[&url], None, 5).await;
    
    match result {
        Ok(shell_result) => {
            if shell_result.exit_code == Some(0) {
                info!("Successfully opened URL: {}", url);
                Ok(())
            } else {
                let error_msg = format!("Failed to open URL: exit code {:?}, stderr: {}", 
                                       shell_result.exit_code, shell_result.stderr);
                info!("{}", error_msg);
                Err(error_msg)
            }
        }
        Err(e) => {
            let error_msg = format!("Failed to open browser: {}", e);
            info!("{}", error_msg);
            Err(error_msg)
        }
    }
}
