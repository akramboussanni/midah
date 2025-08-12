use anyhow::Result;
use chrono::{DateTime, Utc};
use rdev::{listen, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;
use tokio::sync::mpsc;
use once_cell::sync::OnceCell;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum HotkeyAction {
    PlaySound { sound_id: String },
    StopAllSounds,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Hotkey {
    pub key: String,
    pub modifiers: Modifiers,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyBinding {
    pub id: String,
    pub key: String,
    pub modifiers: Modifiers,
    pub action: HotkeyAction,
    pub sound_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, Default)]
pub struct Modifiers {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub meta: bool,
}

#[derive(Debug)]
pub struct HotkeyManager {
    bindings: Mutex<HashMap<String, HotkeyBinding>>,
    key_map: Mutex<HashMap<(String, Modifiers), String>>,
    event_sender: mpsc::Sender<HotkeyAction>,
    modifier_state: Mutex<Modifiers>,
}

impl HotkeyManager {
    pub fn new(event_sender: mpsc::Sender<HotkeyAction>) -> Self {
        Self {
            bindings: Mutex::new(HashMap::new()),
            key_map: Mutex::new(HashMap::new()),
            event_sender,
            modifier_state: Mutex::new(Modifiers::default()),
        }
    }

    pub fn add_binding(&self, key: String, modifiers: Modifiers, action: HotkeyAction, sound_id: Option<String>) -> anyhow::Result<String> {
        self.add_binding_with_persist(key, modifiers, action, sound_id, true)
    }

    pub fn add_binding_no_persist(&self, key: String, modifiers: Modifiers, action: HotkeyAction, sound_id: Option<String>) -> anyhow::Result<String> {
        self.add_binding_with_persist(key, modifiers, action, sound_id, false)
    }

    fn add_binding_with_persist(&self, key: String, modifiers: Modifiers, action: HotkeyAction, sound_id: Option<String>, persist: bool) -> anyhow::Result<String> {
        let id = match &action {
            HotkeyAction::PlaySound { sound_id } => format!("sound_{}", sound_id),
            HotkeyAction::StopAllSounds => "global_stop".to_string(),
        };
        let binding = HotkeyBinding {
            id: id.clone(),
            key: key.clone(),
            modifiers,
            action: action.clone(),
            sound_id: sound_id.clone(),
            created_at: Utc::now(),
        };
        self.bindings.lock().unwrap().insert(id.clone(), binding);
        self.key_map.lock().unwrap().insert((key.clone(), modifiers), id.clone());
        
        if persist {
            if let HotkeyAction::PlaySound { sound_id: _ } = action {
                if let Some(ref s_id) = sound_id {
                    let hotkey = crate::hotkeys::Hotkey { key, modifiers };
                    crate::database::update_sound_hotkey(s_id, Some(&hotkey))?;
                }
            }
        }
        Ok(id)
    }

    pub fn remove_binding(&self, id: &str) -> bool {
        let mut bindings = self.bindings.lock().unwrap();
        if let Some(binding) = bindings.remove(id) {
            self.key_map.lock().unwrap().remove(&(binding.key.clone(), binding.modifiers));
            if id == "global_stop" {
                let _ = crate::database::remove_hotkey_binding(id);
            }
            true
        } else {
            false
        }
    }

    pub fn update_binding(&self, id: &str, key: String, modifiers: Modifiers) -> bool {
        let mut bindings = self.bindings.lock().unwrap();
        if let Some(binding) = bindings.get_mut(id) {
            self.key_map.lock().unwrap().remove(&(binding.key.clone(), binding.modifiers));
            binding.key = key.clone();
            binding.modifiers = modifiers;
            self.key_map.lock().unwrap().insert((key, modifiers), id.to_string());
            true
        } else {
            false
        }
    }

    pub fn get_bindings(&self) -> Vec<HotkeyBinding> {
        self.bindings.lock().unwrap().values().cloned().collect()
    }

    pub fn handle_event(&self, event: &Event) {
        match event.event_type {
            EventType::KeyPress(key) => {
                self.update_modifier_state(key, true);
                
                let key_str = key_to_string(key);
                
                if !is_modifier_key(key) {
                    let current_modifiers = *self.modifier_state.lock().unwrap();
                    let key_map = self.key_map.lock().unwrap();
                    
                    if let Some(binding_id) = key_map.get(&(key_str, current_modifiers)) {
                        if let Some(binding) = self.bindings.lock().unwrap().get(binding_id) {
                            let _ = self.event_sender.blocking_send(binding.action.clone());
                        }
                    }
                }
            }
            EventType::KeyRelease(key) => {
                // Update modifier state for modifier keys
                self.update_modifier_state(key, false);
            }
            _ => {}
        }
    }

    fn update_modifier_state(&self, key: Key, pressed: bool) {
        let mut modifier_state = self.modifier_state.lock().unwrap();
        match key {
            Key::ControlLeft | Key::ControlRight => modifier_state.ctrl = pressed,
            Key::Alt | Key::AltGr => modifier_state.alt = pressed,
            Key::ShiftLeft | Key::ShiftRight => modifier_state.shift = pressed,
            Key::MetaLeft | Key::MetaRight => modifier_state.meta = pressed,
            _ => {}
        }
    }

    pub fn start_listening(self: Arc<Self>) {
        std::thread::spawn(move || {
            if let Err(e) = listen(move |event| {
                self.handle_event(&event);
            }) {
                tracing::error!("rdev listen failed: {:?}", e);
            }
        });
    }
}

pub static HOTKEY_MANAGER: OnceCell<Arc<HotkeyManager>> = OnceCell::new();

#[tauri::command]
pub async fn register_hotkey(_app: AppHandle, key: String, modifiers: Modifiers, sound_id: String) -> Result<String, String> {
    if let Some(manager) = HOTKEY_MANAGER.get() {
        let id = manager.add_binding(
            key,
            modifiers,
            HotkeyAction::PlaySound { sound_id: sound_id.clone() },
            Some(sound_id),
        ).map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        Err("Hotkey manager not initialized".into())
    }
}

#[tauri::command]
pub async fn unregister_hotkey(_app: AppHandle, binding_id: String) -> Result<(), String> {
    if let Some(manager) = HOTKEY_MANAGER.get() {
        if manager.remove_binding(&binding_id) {
            Ok(())
        } else {
            Err("Binding not found".into())
        }
    } else {
        Err("Hotkey manager not initialized".into())
    }
}

#[tauri::command]
pub async fn update_hotkey(_app: AppHandle, binding_id: String, key: String, modifiers: Modifiers) -> Result<(), String> {
    if let Some(manager) = HOTKEY_MANAGER.get() {
        if manager.update_binding(&binding_id, key, modifiers) {
            Ok(())
    } else {
            Err("Binding not found".into())
}
    } else {
        Err("Hotkey manager not initialized".into())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrontendHotkeyBinding {
    pub id: String,
    pub hotkey: String,
    pub action: String,
    #[serde(rename = "soundId")]
    pub sound_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

impl From<HotkeyBinding> for FrontendHotkeyBinding {
    fn from(binding: HotkeyBinding) -> Self {
        let hotkey_string = hotkey_to_string(&binding.key, &binding.modifiers);
        let action_string = match binding.action {
            HotkeyAction::PlaySound { .. } => "PlaySound".to_string(),
            HotkeyAction::StopAllSounds => "StopAllSounds".to_string(),
        };
        
        FrontendHotkeyBinding {
            id: binding.id,
            hotkey: hotkey_string,
            action: action_string,
            sound_id: binding.sound_id,
            created_at: binding.created_at.to_rfc3339(),
        }
    }
}

fn hotkey_to_string(key: &str, modifiers: &Modifiers) -> String {
    let mut parts = Vec::new();
    if modifiers.ctrl { parts.push("Ctrl"); }
    if modifiers.alt { parts.push("Alt"); }
    if modifiers.shift { parts.push("Shift"); }
    if modifiers.meta { parts.push("Meta"); }
    if !key.is_empty() { parts.push(key); }
    parts.join("+")
}

#[tauri::command]
pub async fn get_hotkey_bindings(_app: AppHandle) -> Result<Vec<FrontendHotkeyBinding>, String> {
    if let Some(manager) = HOTKEY_MANAGER.get() {
        let bindings = manager.get_bindings();
        Ok(bindings.into_iter().map(FrontendHotkeyBinding::from).collect())
    } else {
        Err("Hotkey manager not initialized".into())
    }
}

#[tauri::command]
pub async fn register_global_stop_hotkey(_app: tauri::AppHandle, key: String, modifiers: Modifiers) -> Result<(), String> {
    use crate::database;
    use chrono::Utc;
    let hotkey = Hotkey { key: key.clone(), modifiers: modifiers.clone() };
    let hotkey_json = serde_json::to_string(&hotkey).map_err(|e| e.to_string())?;
    database::save_setting("hotkey_stop_playback", &hotkey_json).map_err(|e| e.to_string())?;
    
    if let Some(manager) = HOTKEY_MANAGER.get() {
        let binding_id = "global_stop";
        let _ = manager.remove_binding(binding_id);
        let _ = database::remove_hotkey_binding(binding_id);
        manager.add_binding(key.clone(), modifiers, HotkeyAction::StopAllSounds, Some(binding_id.to_string())).map_err(|e| e.to_string())?;
        
        let binding = HotkeyBinding {
            id: binding_id.to_string(),
            key,
            modifiers,
            action: HotkeyAction::StopAllSounds,
            sound_id: None,
            created_at: Utc::now(),
        };
        database::save_hotkey_binding(&binding).map_err(|e| e.to_string())?;
        
        Ok(())
    } else {
        Err("Hotkey manager not initialized".into())
    }
}

#[tauri::command]
pub async fn unregister_global_stop_hotkey(_app: tauri::AppHandle) -> Result<(), String> {
    use crate::database;
    
    let _ = database::save_setting("hotkey_stop_playback", "");
    
    if let Some(manager) = HOTKEY_MANAGER.get() {
        let binding_id = "global_stop";
        let _ = manager.remove_binding(binding_id);
        let _ = database::remove_hotkey_binding(binding_id);
        Ok(())
    } else {
        Err("Hotkey manager not initialized".into())
    }
}

pub fn init_hotkeys() -> mpsc::Receiver<HotkeyAction> {
    let (tx, rx) = mpsc::channel(100);
    let manager = Arc::new(HotkeyManager::new(tx));
    
    if let Ok(sounds) = crate::database::get_sounds() {
        for sound in sounds {
            if let Some(hotkey) = sound.hotkey {
                let _ = manager.add_binding_no_persist(
                    hotkey.key,
                    hotkey.modifiers,
                    HotkeyAction::PlaySound { sound_id: sound.id.clone() },
                    Some(sound.id),
                );
            }
        }
    }
    
    if let Ok(bindings) = crate::database::get_hotkey_bindings() {
        for binding in bindings {
            let _ = manager.add_binding_no_persist(
                binding.key,
                binding.modifiers,
                binding.action,
                binding.sound_id,
            );
        }
    }
    
    if let Ok(Some(hotkey_json)) = crate::database::get_setting("hotkey_stop_playback") {
        if !hotkey_json.is_empty() {
            if let Ok(hotkey) = serde_json::from_str::<Hotkey>(&hotkey_json) {
                let _ = manager.add_binding_no_persist(
                    hotkey.key,
                    hotkey.modifiers,
                    HotkeyAction::StopAllSounds,
                    Some("global_stop".to_string()),
                );
            }
        }
    }
    
    manager.clone().start_listening();
    HOTKEY_MANAGER.set(manager).unwrap();
    rx
}

fn is_modifier_key(key: Key) -> bool {
    use rdev::Key::*;
    matches!(key, ControlLeft | ControlRight | Alt | AltGr | ShiftLeft | ShiftRight | MetaLeft | MetaRight)
}

fn key_to_string(key: Key) -> String {
    use rdev::Key::*;
    match key {
        KeyA => "A",
        KeyB => "B",
        KeyC => "C",
        KeyD => "D",
        KeyE => "E",
        KeyF => "F",
        KeyG => "G",
        KeyH => "H",
        KeyI => "I",
        KeyJ => "J",
        KeyK => "K",
        KeyL => "L",
        KeyM => "M",
        KeyN => "N",
        KeyO => "O",
        KeyP => "P",
        KeyQ => "Q",
        KeyR => "R",
        KeyS => "S",
        KeyT => "T",
        KeyU => "U",
        KeyV => "V",
        KeyW => "W",
        KeyX => "X",
        KeyY => "Y",
        KeyZ => "Z",
        F1 => "F1",
        F2 => "F2",
        F3 => "F3",
        F4 => "F4",
        F5 => "F5",
        F6 => "F6",
        F7 => "F7",
        F8 => "F8",
        F9 => "F9",
        F10 => "F10",
        F11 => "F11",
        F12 => "F12",
        Escape => "ESCAPE",
        Space => "SPACE",
        Return => "ENTER",
        Tab => "TAB",
        Backspace => "BACKSPACE",
        _ => "UNKNOWN",
    }.to_string()
}


