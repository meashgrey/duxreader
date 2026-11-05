use anyhow::{Context, Result, bail};
use notify::{RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
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
    if let Some(path) = css {
        // An explicit CSS file overrides any inline CSS in the theme JSON.
        theme.css = read_limited(path, 262144)?;
    }
    if theme.css.len() > 262144 {
        bail!("CSS exceeds size limit");
    }
    Ok(theme)
}

fn write_message(mut output: impl Write, theme: &Theme) -> Result<()> {
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

enum Signal {
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
    let mut css_path = None;
    let mut args = env::args_os().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--theme" {
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
    let (tx, rx) = mpsc::channel();
    let input_tx = tx.clone();
    // Detect browser shutdown independently of filesystem events or idle timeouts.
    thread::spawn(move || {
        let input = io::stdin();
        let mut lock = input.lock();
        while read_message(&mut lock).is_ok() {}
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
                last_error.clear();
                if previous.as_ref() != Some(&theme) {
                    // Directory events and recovery polls may report unchanged data.
                    write_message(io::stdout().lock(), &theme)?;
                    previous = Some(theme);
                }
            }
            Err(error) => {
                // Partial writes are retried; keep the previously published theme.
                let message = format!("{error:#}");
                if message != last_error {
                    eprintln!("duxreader: {message}");
                    last_error = message;
                }
            }
        }
        match rx.recv_timeout(Duration::from_secs(2)) {
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
