use serde::Serialize;
use cpal::traits::{DeviceTrait, HostTrait};
use std::path::PathBuf;
use std::fs;

#[derive(Debug, Serialize)]
pub struct VirtualCableStatus {
    pub found: bool,
    pub device_name: Option<String>,
    pub is_voicemod: bool,
    pub message: Option<String>,
}

#[cfg(target_os = "windows")]
fn run_as_admin(exe: &std::path::Path) -> std::io::Result<()> {
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SHOW_WINDOW_CMD;
    use windows::Win32::Foundation::HWND;
    use windows::core::PCWSTR;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    let operation = OsStr::new("runas").encode_wide().chain(Some(0)).collect::<Vec<_>>();
    let file = exe.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<_>>();

    unsafe {
        let result = ShellExecuteW(
            HWND(0),
            PCWSTR(operation.as_ptr()),
            PCWSTR(file.as_ptr()),
            PCWSTR(std::ptr::null()),
            PCWSTR(std::ptr::null()),
            SHOW_WINDOW_CMD(1), // SW_SHOWNORMAL
        );
        if result.0 as usize > 32 {
            Ok(())
        } else {
            Err(std::io::Error::new(std::io::ErrorKind::Other, "Failed to launch installer as admin"))
        }
    }
}

#[tauri::command]
pub async fn check_virtual_cable() -> Result<VirtualCableStatus, String> {
    let host = cpal::default_host();
    let mut found = false;
    let mut device_name = None;
    let mut is_voicemod = false;
    let mut message = None;
    if let Ok(devices) = host.output_devices() {
        for device in devices {
            if let Ok(name) = device.name() {
                let name_lower = name.to_lowercase();
                if name_lower.contains("vb-cable") || name_lower.contains("vb audio") || name_lower.contains("virtual cable") || name_lower.contains("vb-audio") {
                    found = true;
                    device_name = Some(name.clone());
                    break;
                } else if name_lower.contains("voicemod") {
                    found = true;
                    device_name = Some(name.clone());
                    is_voicemod = true;
                    message = Some("Voicemod Virtual Cable detected. Please ensure the Voicemod app is open for the cable to function.\n\nWarning: If Voicemod is not running, the virtual cable will not work!".to_string());
                    break;
                }
            }
        }
    }
    Ok(VirtualCableStatus { found, device_name, is_voicemod, message })
}

#[tauri::command]
pub async fn install_virtual_cable() -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Err("VB-Cable auto-install is only supported on Windows. Please install manually from https://vb-audio.com/Cable/".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        use reqwest::Client;
        use zip::ZipArchive;

        let url = "https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack43.zip";
        let downloads_dir = PathBuf::from("downloads");
        let zip_path = downloads_dir.join("VBCABLE_Driver_Pack43.zip");
        let extract_dir = downloads_dir.join("vb-cable-installer");

        let _ = fs::create_dir_all(&downloads_dir);

        if !zip_path.exists() {
            let client = Client::new();
            let resp = client.get(url).send().await.map_err(|e| format!("Failed to download: {}", e))?;
            let bytes = resp.bytes().await.map_err(|e| format!("Failed to read download: {}", e))?;
            fs::write(&zip_path, &bytes).map_err(|e| format!("Failed to save zip: {}", e))?;
        }

        if !extract_dir.exists() {
            let file = fs::File::open(&zip_path).map_err(|e| format!("Failed to open zip: {}", e))?;
            let mut archive = ZipArchive::new(file).map_err(|e| format!("Failed to read zip: {}", e))?;
            for i in 0..archive.len() {
                let mut file = archive.by_index(i).map_err(|e| format!("Failed to extract: {}", e))?;
                let outpath = extract_dir.join(file.name());
                if file.is_dir() {
                    let _ = fs::create_dir_all(&outpath);
                } else {
                    if let Some(p) = outpath.parent() {
                        let _ = fs::create_dir_all(p);
                    }
                    let mut outfile = fs::File::create(&outpath).map_err(|e| format!("Failed to create file: {}", e))?;
                    std::io::copy(&mut file, &mut outfile).map_err(|e| format!("Failed to write file: {}", e))?;
                }
            }
        }

        let setup_x64 = extract_dir.join("VBCABLE_Setup_x64.exe");
        let setup = extract_dir.join("VBCABLE_Setup.exe");
        let exe = if setup_x64.exists() { setup_x64 } else if setup.exists() { setup } else {
            return Err("Could not find VB-Cable setup executable after extraction.".to_string());
        };

        match run_as_admin(&exe) {
            Ok(_) => Ok("VB-Cable installer launched with admin rights. Please follow the on-screen instructions. After installation, restart your computer.".to_string()),
            Err(e) => Err(format!("Failed to launch installer as admin: {}. You may need to run it manually as administrator from the downloads/vb-cable-installer folder.", e)),
        }
    }
} 