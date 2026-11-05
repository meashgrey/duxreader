use anyhow::{Context, Result, bail};
use notify::{RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    env, fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::mpsc,
    thread,
    time::Duration,
};

const MAX_MESSAGE: usize = 1024 * 1024;

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Mode {
    Dark,
    Light,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
struct Colors {
    background: String,
    surface: String,
    foreground: String,
    accent: String,
}

#[derive(Debug, Deserialize, Serialize, PartialEq)]
struct Theme {
    mode: Mode,
    colors: Colors,
    #[serde(default)]
    css: String,
    // Optional Material 3 role colors exported by Matugen, preserved on the wire.
    #[serde(default)]
    material: BTreeMap<String, String>,
}

fn read_limited(path: &Path, limit: usize) -> Result<String> {
    let file = fs::File::open(path).with_context(|| format!("open {}", path.display()))?;
    let mut bytes = Vec::new();
    // Read one extra byte to detect oversized files without allocating their full size.
    file.take((limit + 1) as u64).read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        bail!("file exceeds size limit");
    }
    Ok(String::from_utf8(bytes)?)
}

fn load_theme(path: &Path, css: Option<&Path>) -> Result<Theme> {
    let mut theme: Theme = serde_json::from_str(&read_limited(path, MAX_MESSAGE)?)?;
    for color in [
        &theme.colors.background,
        &theme.colors.surface,
        &theme.colors.foreground,
        &theme.colors.accent,
    ] {
        if color.len() != 7
            || !color.starts_with('#')
            || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
        {
            bail!("colors must be six-digit hex values");
        }
    }
    for (role, color) in &theme.material {
        if role.is_empty()
            || role.len() > 64
            || !role
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte == b'-')
            || color.len() != 7
            || !color.starts_with('#')
            || !color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
        {
            bail!("Material roles must use lowercase names and six-digit hex colors");
        }
    }
    if let Some(path) = css {
        // An explicit CSS file overrides any inline CSS in the theme JSON.
        theme.css = read_limited(path, 262144)?;
    }
    if theme.css.len() > 262144 {
        bail!("CSS exceeds size limit");
    }
    Ok(theme)
}

fn write_message(mut output: impl Write, theme: &impl Serialize) -> Result<()> {
    let payload = serde_json::to_vec(theme)?;
    if payload.len() > MAX_MESSAGE {
        bail!("message too large");
    }
    // Native Messaging prefixes UTF-8 JSON with its byte length as a native-endian u32.
    // stdout must contain only protocol frames; diagnostics belong on stderr.
    output.write_all(&(payload.len() as u32).to_ne_bytes())?;
    output.write_all(&payload)?;
    output.flush()?;
    Ok(())
}

fn read_message(mut input: impl Read) -> Result<serde_json::Value> {
    let mut header = [0; 4];
    input.read_exact(&mut header)?;
    let size = u32::from_ne_bytes(header) as usize;
    if size > MAX_MESSAGE {
        bail!("message too large");
    }
    let mut payload = vec![0; size];
    input.read_exact(&mut payload)?;
    Ok(serde_json::from_slice(&payload)?)
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Command {
    Watch { path: Option<String> },
    PickFile,
}

// Echo the selected source so the extension can discard messages from an old watch.
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Message<'a> {
    Idle {
        source: &'a str,
        path: String,
    },
    Picked {
        path: Option<String>,
        error: Option<String>,
    },
    Theme {
        source: &'a str,
        path: String,
        theme: &'a Theme,
    },
    Error {
        source: &'a str,
        path: String,
        message: String,
    },
}

fn source_path(source: &str, default: &Path) -> Result<PathBuf> {
    if source.is_empty() {
        return Ok(default.to_path_buf());
    }
    let path = if let Some(rest) = source.strip_prefix("~/") {
        PathBuf::from(env::var_os("HOME").context("HOME is not set")?).join(rest)
    } else {
        PathBuf::from(source)
    };
    if !path.is_absolute() {
        bail!("Use an absolute path or a path starting with ~/");
    }
    Ok(path)
}

enum Signal {
    Command(Command),
    Picked(Result<Option<PathBuf>, String>),
    Changed,
    Closed,
}

fn main() -> Result<()> {
    let config = env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
        .context("HOME or XDG_CONFIG_HOME must be set")?
        .join("duxreader");
    let mut theme_path = config.join("theme.json");
    let mut explicit_default = false;
    let mut css_path = None;
    let mut args = env::args_os().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--theme" {
            explicit_default = true;
            theme_path = args.next().context("--theme needs a path")?.into();
        } else if arg == "--css" {
            css_path = Some(PathBuf::from(args.next().context("--css needs a path")?));
        } else if arg == "--help" {
            eprintln!(
                "duxreader-bridge [--theme PATH] [--css PATH]\nNative Messaging host; stdout contains binary frames."
            );
            return Ok(());
        }
        // Native Messaging supplies browser origin arguments.
    }
    let default_path = theme_path.clone();
    let mut source = String::new();
    let (tx, rx) = mpsc::channel();
    let input_tx = tx.clone();
    let picker_tx = tx.clone();
    let mut picker_open = false;
    // Detect browser shutdown independently of filesystem events or idle timeouts.
    thread::spawn(move || {
        let input = io::stdin();
        let mut lock = input.lock();
        while let Ok(value) = read_message(&mut lock) {
            if let Ok(command) = serde_json::from_value(value)
                && input_tx.send(Signal::Command(command)).is_err()
            {
                return;
            }
        }
        let _ = input_tx.send(Signal::Closed);
    });
    let mut watcher =
        notify::recommended_watcher(move |event: notify::Result<notify::Event>| match event {
            Ok(event) if !event.kind.is_access() => {
                let _ = tx.send(Signal::Changed);
            }
            Err(error) => eprintln!("duxreader watcher: {error}"),
            _ => {}
        })?;
    let mut watched = HashSet::new();
    let mut previous = None;
    let mut last_error = String::new();
    let mut idle_sent = false;
    loop {
        // Watch parent directories so atomic rename and symlink replacement are detected.
        // Re-resolve targets each pass; a timeout also recovers missed events.
        let mut desired = HashSet::new();
        for path in std::iter::once(&theme_path).chain(css_path.iter()) {
            let absolute = std::path::absolute(path)?;
            for candidate in [Some(absolute), fs::canonicalize(path).ok()]
                .into_iter()
                .flatten()
            {
                if let Some(parent) = candidate.parent() {
                    desired.insert(parent.to_path_buf());
                }
            }
        }
        for old in watched.difference(&desired) {
            let _ = watcher.unwatch(old);
        }
        watched.retain(|path| desired.contains(path));
        for parent in desired.difference(&watched).cloned().collect::<Vec<_>>() {
            if watcher.watch(&parent, RecursiveMode::NonRecursive).is_ok() {
                watched.insert(parent);
            }
        }
        match load_theme(&theme_path, css_path.as_deref()) {
            Ok(theme) => {
                idle_sent = false;
                let recovered = !last_error.is_empty();
                last_error.clear();
                if recovered || previous.as_ref() != Some(&theme) {
                    // Directory events and recovery polls may report unchanged data.
                    write_message(
                        io::stdout().lock(),
                        &Message::Theme {
                            source: &source,
                            path: theme_path.display().to_string(),
                            theme: &theme,
                        },
                    )?;
                    previous = Some(theme);
                }
            }
            Err(_)
                if source.is_empty()
                    && !explicit_default
                    && previous.is_none()
                    && matches!(theme_path.try_exists(), Ok(false)) =>
            {
                // The conventional default is optional on first run. Keep checking
                // so Matugen can create it later without a browser restart.
                if !idle_sent {
                    write_message(
                        io::stdout().lock(),
                        &Message::Idle {
                            source: &source,
                            path: theme_path.display().to_string(),
                        },
                    )?;
                    last_error.clear();
                    idle_sent = true;
                }
            }
            Err(error) => {
                idle_sent = false;
                // Partial writes are retried; keep the previously published theme.
                let message = format!("{error:#}");
                if message != last_error {
                    eprintln!("duxreader: {message}");
                    write_message(
                        io::stdout().lock(),
                        &Message::Error {
                            source: &source,
                            path: theme_path.display().to_string(),
                            message: message.clone(),
                        },
                    )?;
                    last_error = message;
                }
            }
        }
        match rx.recv_timeout(Duration::from_secs(2)) {
            Ok(Signal::Command(Command::PickFile)) => {
                if !picker_open {
                    picker_open = true;
                    let tx = picker_tx.clone();
                    // Keep filesystem watching responsive while the desktop dialog is open.
                    thread::spawn(move || {
                        let result = std::panic::catch_unwind(|| {
                            rfd::FileDialog::new()
                                .set_title("Choose a Duxreader theme")
                                .add_filter("Theme JSON", &["json"])
                                .pick_file()
                        })
                        .map_err(|_| {
                            "The desktop file chooser failed. Check your desktop portal."
                                .to_string()
                        });
                        let _ = tx.send(Signal::Picked(result));
                    });
                }
            }
            Ok(Signal::Picked(result)) => {
                picker_open = false;
                let (path, error) = match result {
                    Ok(path) => (path.map(|path| path.to_string_lossy().into_owned()), None),
                    Err(error) => (None, Some(error)),
                };
                write_message(io::stdout().lock(), &Message::Picked { path, error })?;
            }
            Ok(Signal::Command(Command::Watch { path })) => {
                let next = path.unwrap_or_default();
                match source_path(&next, &default_path) {
                    Ok(path) => {
                        source = next;
                        theme_path = path;
                        // Always publish a snapshot after a source switch, even for equal colors.
                        previous = None;
                        last_error.clear();
                        idle_sent = false;
                    }
                    Err(error) => write_message(
                        io::stdout().lock(),
                        &Message::Error {
                            source: &next,
                            path: next.clone(),
                            message: error.to_string(),
                        },
                    )?,
                }
            }
            Ok(Signal::Closed) | Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Ok(Signal::Changed) => thread::sleep(Duration::from_millis(100)),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn source_selection_validates_paths_and_restores_default() {
        let default = Path::new("/tmp/duxreader/theme.json");
        assert_eq!(source_path("", default).unwrap(), default);
        assert_eq!(
            source_path("/tmp/another.json", default).unwrap(),
            Path::new("/tmp/another.json")
        );
        assert!(source_path("relative.json", default).is_err());
        let command: Command = serde_json::from_str(r#"{"type":"watch","path":null}"#).unwrap();
        assert!(matches!(command, Command::Watch { path: None }));
    }

    #[test]
    fn picker_protocol_distinguishes_selection_cancellation_and_failure() {
        let command: Command = serde_json::from_str(r#"{"type":"pickFile"}"#).unwrap();
        assert!(matches!(command, Command::PickFile));
        let picked = serde_json::to_value(Message::Picked {
            path: Some("/tmp/theme.json".into()),
            error: None,
        })
        .unwrap();
        assert_eq!(picked["type"], "picked");
        assert_eq!(picked["path"], "/tmp/theme.json");
        let cancelled = serde_json::to_value(Message::Picked {
            path: None,
            error: None,
        })
        .unwrap();
        assert!(cancelled["path"].is_null());
        assert!(cancelled["error"].is_null());
        let failed = serde_json::to_value(Message::Picked {
            path: None,
            error: Some("Desktop chooser unavailable".into()),
        })
        .unwrap();
        assert!(failed["error"].is_string());
    }

    #[test]
    fn native_frames_round_trip_and_reject_truncation() {
        let mut theme: Theme =
            serde_json::from_str(include_str!("../../examples/theme.json")).unwrap();
        theme.css = "/* Palette 🎨 */".into();
        let mut output = Vec::new();
        write_message(&mut output, &theme).unwrap();
        let decoded: Theme =
            serde_json::from_value(read_message(Cursor::new(&output)).unwrap()).unwrap();
        assert_eq!(decoded, theme);
        assert!(read_message(Cursor::new(&output[..output.len() - 1])).is_err());
        assert!(read_message(Cursor::new(u32::MAX.to_ne_bytes())).is_err());
    }

    #[test]
    fn theme_validation_and_external_css() {
        let root = env::temp_dir().join(format!("duxreader-test-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let theme = root.join("theme.json");
        let css = root.join("custom.css");
        fs::write(&theme, include_str!("../../examples/theme.json")).unwrap();
        fs::write(&css, "body { color: var(--dux-fg); }").unwrap();
        assert!(
            load_theme(&theme, Some(&css))
                .unwrap()
                .css
                .contains("--dux-fg")
        );
        fs::write(
            &theme,
            include_str!("../../examples/theme.json").replace("#89b4fa", "red;}"),
        )
        .unwrap();
        assert!(load_theme(&theme, None).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
