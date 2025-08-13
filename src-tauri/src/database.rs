use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::info;
use serde_json;
use crate::hotkeys::Hotkey;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sound {
    pub id: String,
    pub name: String,
    pub file_path: String,
    pub category: Option<String>,
    pub hotkey: Option<Hotkey>,
    pub volume: f32,
    pub start_position: Option<f32>,
    pub duration: Option<f32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: DateTime<Utc>,
}

pub fn init_database(db_path: &Path) -> Result<()> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    
    let conn = Connection::open(db_path)?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sounds (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            category TEXT,
            hotkey TEXT,
            volume REAL DEFAULT 1.0,
            start_position REAL,
            duration REAL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    // migrations NEEDS to be changed lol
    let mut stmt = conn.prepare("PRAGMA table_info(sounds)")?;
    let columns: Vec<String> = stmt
        .query_map([], |row| row.get(1))?
        .filter_map(|r| r.ok())
        .collect();
    if !columns.iter().any(|c| c == "duration") {
        let _ = conn.execute("ALTER TABLE sounds ADD COLUMN duration REAL", []);
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT,
            created_at TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS sound_categories (
            sound_id TEXT NOT NULL,
            category TEXT NOT NULL,
            PRIMARY KEY (sound_id, category)
        )",
        [],
    )?;

    {
        let mut stmt = conn.prepare("SELECT id, category FROM sounds WHERE category IS NOT NULL AND category <> ''")?;
        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let category: String = row.get(1)?;
            Ok((id, category))
        })?;
        for row in rows.flatten() {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO sound_categories (sound_id, category) VALUES (?1, ?2)",
                params![row.0, row.1],
            );
        }
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS hotkey_bindings (
            id TEXT PRIMARY KEY,
            hotkey TEXT NOT NULL,
            action TEXT NOT NULL,
            sound_id TEXT,
            created_at TEXT NOT NULL
        )",
        [],
    )?;

    info!("Database initialized at: {:?}", db_path);
    Ok(())
}

pub fn get_connection() -> Result<Connection> {
    let app_data_dir = dirs::data_dir()
        .context("Could not find data directory")?
        .join("midah");
    
    std::fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("soundboard.db");
    
    Ok(Connection::open(db_path)?)
}

pub fn add_sound(sound: &Sound) -> Result<()> {
    let conn = get_connection()?;
    let hotkey_json = match &sound.hotkey {
        Some(hotkey) => match serde_json::to_string(hotkey) {
            Ok(json) => Some(json),
            Err(e) => {
                eprintln!("[db] Failed to serialize hotkey for sound {}: {}", sound.id, e);
                return Err(anyhow::Error::from(e));
            }
        },
        None => None,
    };
    conn.execute(
        "INSERT OR REPLACE INTO sounds (id, name, file_path, category, hotkey, volume, start_position, duration, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            sound.id,
            sound.name,
            sound.file_path,
            sound.category,
            hotkey_json,
            sound.volume,
            sound.start_position,
            sound.duration,
            sound.created_at.to_rfc3339(),
            sound.updated_at.to_rfc3339(),
        ],
    )?;
    info!("Added sound: {}", sound.name);
    Ok(())
}

pub fn get_sounds() -> Result<Vec<Sound>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, file_path, category, hotkey, volume, start_position, duration, created_at, updated_at \
         FROM sounds ORDER BY name"
    )?;
    let sound_iter = stmt.query_map([], |row| {
        let hotkey_str: Option<String> = row.get(4)?;
        let hotkey = match hotkey_str {
            Some(ref s) => serde_json::from_str(s).ok(),
            None => None,
        };
        Ok(Sound {
            id: row.get(0)?,
            name: row.get(1)?,
            file_path: row.get(2)?,
            category: row.get(3)?,
            hotkey,
            volume: row.get(5)?,
            start_position: row.get(6)?,
            duration: row.get(7)?,
            created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                .unwrap_or_else(|_| Utc::now().into())
                .with_timezone(&Utc),
            updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                .unwrap_or_else(|_| Utc::now().into())
                .with_timezone(&Utc),
        })
    })?;
    Ok(sound_iter.filter_map(|r| r.ok()).collect())
}

pub fn get_sound_by_id(id: &str) -> Result<Option<Sound>> {
    let conn = get_connection()?;
    
    let mut stmt = conn.prepare(
        "SELECT id, name, file_path, category, hotkey, volume, start_position, duration, created_at, updated_at 
         FROM sounds WHERE id = ?"
    )?;
    
    let mut sound_iter = stmt.query_map(params![id], |row| {
        let hotkey_str: Option<String> = row.get(4)?;
        let hotkey = match hotkey_str {
            Some(ref s) => serde_json::from_str(s).ok(),
            None => None,
        };
        Ok(Sound {
            id: row.get(0)?,
            name: row.get(1)?,
            file_path: row.get(2)?,
            category: row.get(3)?,
            hotkey,
            volume: row.get(5)?,
            start_position: row.get(6)?,
            duration: row.get(7)?,
            created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(8)?)
                .unwrap_or_else(|_| Utc::now().into())
                .with_timezone(&Utc),
            updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(9)?)
                .unwrap_or_else(|_| Utc::now().into())
                .with_timezone(&Utc),
        })
    })?;

    Ok(sound_iter.next().transpose()?)
}

pub fn get_sound_categories(sound_id: &str) -> Result<Vec<String>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare("SELECT category FROM sound_categories WHERE sound_id = ? ORDER BY category")?;
    let rows = stmt.query_map(params![sound_id], |row| {
        let name: String = row.get(0)?;
        Ok(name)
    })?;
    let mut categories: Vec<String> = Vec::new();
    for r in rows {
        if let Ok(name) = r { categories.push(name); }
    }
    Ok(categories)
}

pub fn set_sound_categories(sound_id: &str, categories: &[String]) -> Result<()> {
    let conn = get_connection()?;
    conn.execute("DELETE FROM sound_categories WHERE sound_id = ?", params![sound_id])?;
    for cat in categories {
        if cat.trim().is_empty() { continue; }
        conn.execute(
            "INSERT OR IGNORE INTO sound_categories (sound_id, category) VALUES (?1, ?2)",
            params![sound_id, cat],
        )?;
    }
    Ok(())
}

pub fn remove_sound(id: &str) -> Result<()> {
    let conn = get_connection()?;
    let _ = conn.execute("DELETE FROM sound_categories WHERE sound_id = ?", params![id]);
    let _ = conn.execute("DELETE FROM hotkey_bindings WHERE sound_id = ?", params![id]);
    conn.execute("DELETE FROM sounds WHERE id = ?", params![id])?;
    
    info!("Removed sound with id: {}", id);
    Ok(())
}

pub fn remove_all_sounds() -> Result<()> {
    let conn = get_connection()?;
    let _ = conn.execute("DELETE FROM sound_categories", []);
    let _ = conn.execute("DELETE FROM hotkey_bindings", []);
    conn.execute("DELETE FROM sounds", [])?;
    info!("Removed all sounds from database");
    Ok(())
}

//todo category
pub fn add_category(category: &Category) -> Result<()> {
    let conn = get_connection()?;
    
    conn.execute(
        "INSERT OR REPLACE INTO categories (id, name, color, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![
            category.id,
            category.name,
            category.color,
            category.created_at.to_rfc3339(),
        ],
    )?;

    info!("Added category: {}", category.name);
    Ok(())
}

pub fn get_categories() -> Result<Vec<Category>> {
    let conn = get_connection()?;
    
    let mut stmt = conn.prepare(
        "SELECT id, name, color, created_at FROM categories ORDER BY name"
    )?;
    
    let category_iter = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
            created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                .unwrap_or_else(|_| Utc::now().into())
                .with_timezone(&Utc),
        })
    })?;

    let mut categories = Vec::new();
    for category in category_iter {
        categories.push(category?);
    }

    Ok(categories)
}

pub fn remove_category(id: &str) -> Result<()> {
    let conn = get_connection()?;
    
    let _ = conn.execute("UPDATE sounds SET category = NULL WHERE category = ?", params![id]);
    let _ = conn.execute("DELETE FROM sound_categories WHERE category = ?", params![id]);
    let _ = conn.execute("DELETE FROM categories WHERE id = ? OR name = ?", params![id, id]);
    
    info!("Removed category with id: {}", id);
    Ok(())
}

pub fn save_setting(key: &str, value: &str) -> Result<()> {
    let conn = get_connection()?;
    let now = Utc::now();
    
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at)
         VALUES (?1, ?2, ?3)",
        params![key, value, now.to_rfc3339()],
    )?;

    Ok(())
}

pub fn get_setting(key: &str) -> Result<Option<String>> {
    let conn = get_connection()?;
    
    let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?")?;
    let mut rows = stmt.query(params![key])?;
    
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn save_hotkey_binding(binding: &crate::hotkeys::HotkeyBinding) -> Result<()> {
    let conn = get_connection()?;
    let hotkey_json = serde_json::to_string(&serde_json::json!({
        "key": binding.key,
        "modifiers": binding.modifiers
    }))?;
    conn.execute(
        "INSERT OR REPLACE INTO hotkey_bindings (id, hotkey, action, sound_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            binding.id,
            hotkey_json,
            serde_json::to_string(&binding.action)?,
            binding.sound_id,
            binding.created_at.to_rfc3339(),
        ],
    )?;
    info!("Saved hotkey binding: {}", hotkey_json);
    Ok(())
}

pub fn get_hotkey_bindings() -> Result<Vec<crate::hotkeys::HotkeyBinding>> {
    let conn = get_connection()?;
    let mut stmt = conn.prepare(
        "SELECT id, hotkey, action, sound_id, created_at FROM hotkey_bindings ORDER BY created_at"
    )?;
    let binding_iter = stmt.query_map([], |row| {
        let hotkey_str: String = row.get(1)?;
        let hotkey_json: serde_json::Value = serde_json::from_str(&hotkey_str).unwrap_or_default();
        let key = hotkey_json.get("key").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let modifiers = serde_json::from_value(hotkey_json.get("modifiers").cloned().unwrap_or_default()).unwrap_or_default();
        Ok(crate::hotkeys::HotkeyBinding {
            id: row.get(0)?,
            key,
            modifiers,
            action: serde_json::from_str(&row.get::<_, String>(2)?)
                .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?,
            sound_id: row.get(3)?,
            created_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(4)?)
                .unwrap_or_else(|_| Utc::now().into())
                .with_timezone(&Utc),
        })
    })?;
    let mut bindings = Vec::new();
    for binding in binding_iter {
        bindings.push(binding?);
    }
    Ok(bindings)
}

pub fn remove_hotkey_binding(id: &str) -> Result<()> {
    let conn = get_connection()?;
    
    conn.execute("DELETE FROM hotkey_bindings WHERE id = ?", params![id])?;
    
    info!("Removed hotkey binding with id: {}", id);
    Ok(())
}

pub fn update_sound_hotkey(sound_id: &str, hotkey: Option<&Hotkey>) -> Result<()> {
    let conn = get_connection()?;
    let hotkey_json = match hotkey {
        Some(hotkey) => serde_json::to_string(hotkey)?,
        None => "null".to_string(),
    };
    conn.execute(
        "UPDATE sounds SET hotkey = ? WHERE id = ?",
        params![hotkey_json, sound_id],
    )?;
    info!("Updated hotkey for sound with id: {}", sound_id);
    Ok(())
} 