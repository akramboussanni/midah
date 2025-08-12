// rm console win
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod external;
mod database;
mod soundboard;
mod hotkeys;
mod app_handlers;
mod updater;

use external::*;

use tauri::{Manager, Emitter};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use std::sync::Mutex;
use crate::hotkeys::{init_hotkeys, HotkeyAction};

pub const GITHUB_REPO: &str = "akramboussanni/midah";




fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    std::thread::spawn(|| { audio::get_audio_manager(); });
    audio::get_audio_engine();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(audio::AudioManager::new().expect("Failed to initialize AudioManager")))
        .setup(move |app| {
            let db_path = app.path().app_data_dir().unwrap().join("soundboard.db");
            database::init_database(&db_path)?;
            let youtube_api_key = database::get_setting("youtube_api_key")
                .unwrap_or_else(|_| None)
                .unwrap_or_else(|| String::new());
            external::youtube::init_youtube_service(youtube_api_key)?;

            let mut event_receiver = init_hotkeys();

            let app_handle = app.handle().clone();

            // Background updater check on startup
            let app_for_update = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // small delay to let UI boot
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                crate::updater::check_for_update(app_for_update).await;
            });
            std::thread::spawn(move || {
                loop {
                    if let Some(action) = event_receiver.blocking_recv() {
                        match action {
                            HotkeyAction::PlaySound { sound_id } => {
                                let _ = crate::soundboard::play_sound(sound_id.clone(), app_handle.state::<std::sync::Mutex<audio::AudioManager>>());
                                let _ = app_handle.emit("hotkey-play-sound", sound_id);
                            }
                            HotkeyAction::StopAllSounds => {
                                let _ = crate::soundboard::stop_all_sounds();
                                let _ = app_handle.emit("hotkey-stop-all-sounds", ());
                            }
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            audio::get_audio_devices,
            audio::set_virtual_device,
            audio::set_output_device,
            audio::set_input_device,
            audio::get_virtual_volume,
            audio::set_virtual_volume,
            audio::get_output_volume,
            audio::set_output_volume,
            audio::get_input_volume,
            audio::set_input_volume,
            audio::start_input_capture,
            audio::stop_input_capture,
            audio::list_all_devices,
            audio::get_audio_status,
            audio::play_audio_file_command,
            audio::stop_sound_command,
            audio::stop_all_sounds_command,
            audio::update_sound_volume_command,
            audio::update_device_volumes_command,
            audio::get_playing_sounds_command,
            audio::get_playback_position,
            audio::restart_sound_from_position,
            soundboard::get_sounds,
            soundboard::add_sound,
            soundboard::remove_sound,
            soundboard::remove_all_sounds,
            soundboard::play_sound,
            soundboard::stop_sound,
            soundboard::stop_all_sounds,
            soundboard::get_categories,
            soundboard::add_category,
            soundboard::remove_category,
            soundboard::import_audio_file,
            soundboard::update_sound_volume,
            soundboard::update_sound_hotkey,
            soundboard::update_sound_category,
            soundboard::update_sound_categories,
            soundboard::play_sound_local,
            soundboard::update_sound_start_position,
            soundboard::get_playing_sounds,
            soundboard::seek_sound,
            hotkeys::register_hotkey,
            hotkeys::unregister_hotkey,
            hotkeys::update_hotkey,
            hotkeys::get_hotkey_bindings,
            hotkeys::register_global_stop_hotkey,
            hotkeys::unregister_global_stop_hotkey,
            app_handlers::get_app_data_dir,
            app_handlers::create_directory,
            app_handlers::save_setting,
            app_handlers::get_setting,
            app_handlers::minimize_window,
            app_handlers::close_window,
            app_handlers::toggle_maximize,
            app_handlers::get_app_version,
            app_handlers::register_global_shortcut,
            app_handlers::test_hotkey,
            app_handlers::check_dependencies,
            app_handlers::download_dependencies,
            app_handlers::update_yt_dlp,
            external::vbcable::check_virtual_cable,
            external::vbcable::install_virtual_cable,
            external::youtube::search_videos,
            external::youtube::get_video_info,
            external::youtube::get_video_info_by_url,
            external::youtube::download_video,
            external::youtube::update_youtube_api_key,
            external::youtube::get_youtube_api_key,
            updater::download_and_install_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri app")
        .run(|_app_handle, _event| {
        });
}


