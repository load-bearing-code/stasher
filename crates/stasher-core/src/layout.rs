//! Renders a downloaded file's path from the user's filename template (the
//! "File layout" builder in settings). The template is a string of literal
//! text and `{token}` / `{token|format}` placeholders; this module is the
//! Rust counterpart to the preview logic in the desktop app's `tokens.ts`,
//! so the saved path matches what the settings UI previewed.

use std::path::PathBuf;

/// The values a template can interpolate for one downloaded file. Optional
/// fields render as empty when absent; empty folder segments are then
/// collapsed so a missing token never leaves a stray `/` in the path.
#[derive(Debug, Clone, Default)]
pub struct MediaName {
    pub site: String,
    pub performer: Option<String>,
    pub id: String,
    pub title: Option<String>,
    /// `YYYY-MM-DD`.
    pub date: Option<String>,
    /// e.g. `2160p`.
    pub resolution: Option<String>,
    pub extension: String,
}

impl MediaName {
    fn value(&self, key: &str) -> Option<String> {
        match key {
            "site" => Some(self.site.clone()),
            "performer" => self.performer.clone(),
            "id" => Some(self.id.clone()),
            "title" => self.title.clone(),
            "date" => self.date.clone(),
            "resolution" => self.resolution.clone(),
            "extension" => Some(self.extension.clone()),
            _ => None,
        }
    }
}

/// Characters illegal in a filename on the platforms we target (and inside an
/// NFS export). `/` is kept because the template uses it for folders.
const ILLEGAL: &[char] = &[':', '*', '?', '"', '<', '>', '|', '\\'];

const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// Renders `template` against `name` into a relative path. Illegal filename
/// characters are stripped and empty path segments collapsed, so the result
/// is always a clean relative path safe to hand to `NfsWriter::write_file`.
pub fn render_path(template: &str, name: &MediaName) -> PathBuf {
    let expanded = expand(template, name);
    let cleaned: String = expanded.chars().filter(|c| !ILLEGAL.contains(c)).collect();
    // Collapse empty segments (from missing tokens or `//`) and drop any `.`
    // or `..` so the path can't climb out of the library.
    let segments: Vec<String> = cleaned
        .split('/')
        .map(|segment| segment.trim().to_string())
        .filter(|segment| !segment.is_empty() && segment != "." && segment != "..")
        .collect();
    segments.iter().collect()
}

/// Inserts `-{n}` before the final extension, used to keep multiple files
/// from one post from overwriting each other when the template has nothing
/// that varies between them.
pub fn with_index(path: &std::path::Path, index: usize) -> PathBuf {
    let parent = path.parent();
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    let name = match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => format!("{stem}-{index}.{ext}"),
        None => format!("{stem}-{index}"),
    };
    match parent {
        Some(parent) if !parent.as_os_str().is_empty() => parent.join(name),
        _ => PathBuf::from(name),
    }
}

/// Replaces every `{token}` / `{token|format}` in `template`, leaving literal
/// text untouched. Unknown tokens render empty.
fn expand(template: &str, name: &MediaName) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        let after = &rest[open + 1..];
        match after.find('}') {
            Some(close) => {
                let body = &after[..close];
                let (key, fmt) = match body.split_once('|') {
                    Some((key, fmt)) => (key, fmt),
                    None => (body, ""),
                };
                let value = name.value(key.trim()).unwrap_or_default();
                out.push_str(&format_value(&value, fmt.trim()));
                rest = &after[close + 1..];
            }
            // No closing brace: emit the rest verbatim and stop.
            None => {
                out.push('{');
                out.push_str(after);
                return out;
            }
        }
    }
    out.push_str(rest);
    out
}

/// Applies a format variant to a raw token value. Mirrors `formatValue` in
/// the desktop app's `tokens.ts`.
fn format_value(value: &str, fmt: &str) -> String {
    match fmt {
        "" => value.to_string(),
        "lower" => value.to_lowercase(),
        "upper" => value.to_uppercase(),
        "title" => title_case(value),
        "kebab" => slug(value, '-'),
        "snake" => slug(value, '_'),
        "pad8" => {
            if value.len() >= 8 {
                value.to_string()
            } else {
                format!("{value:0>8}")
            }
        }
        "compact" | "dmy" | "month" => format_date(value, fmt),
        "label" => match value {
            "2160p" => "4K".to_string(),
            "1440p" => "QHD".to_string(),
            "1080p" | "720p" => "HD".to_string(),
            other => other.to_string(),
        },
        _ => value.to_string(),
    }
}

fn title_case(value: &str) -> String {
    value
        .split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => {
                    first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase()
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Lowercases and replaces every run of non-alphanumeric characters with
/// `sep`, trimming leading/trailing separators.
fn slug(value: &str, sep: char) -> String {
    let mut out = String::with_capacity(value.len());
    let mut pending_sep = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            if pending_sep && !out.is_empty() {
                out.push(sep);
            }
            pending_sep = false;
            out.push(ch.to_ascii_lowercase());
        } else {
            pending_sep = true;
        }
    }
    out
}

/// Reformats an ISO `YYYY-MM-DD` string. Non-ISO input is returned unchanged.
fn format_date(value: &str, fmt: &str) -> String {
    let parts: Vec<&str> = value.split('-').collect();
    let [y, mo, d] = parts.as_slice() else {
        return value.to_string();
    };
    match fmt {
        "compact" => format!("{y}{mo}{d}"),
        "dmy" => format!("{d}.{mo}.{y}"),
        "month" => match mo.parse::<usize>() {
            Ok(month) if (1..=12).contains(&month) => format!("{} {y}", MONTHS[month - 1]),
            _ => value.to_string(),
        },
        _ => value.to_string(),
    }
}

/// Formats a Unix timestamp (seconds) as `YYYY-MM-DD` in UTC, for the `date`
/// token. Hand-rolled to avoid pulling in a date crate.
pub fn unix_to_ymd(secs: u32) -> String {
    let (year, month, day) = civil_from_days(i64::from(secs) / 86_400);
    format!("{year:04}-{month:02}-{day:02}")
}

/// Howard Hinnant's `civil_from_days`: converts a count of days since the
/// Unix epoch into a `(year, month, day)` triple.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (year + i64::from(month <= 2), month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> MediaName {
        MediaName {
            site: "Fansly".into(),
            performer: Some("Sienna Kade".into()),
            id: "884213".into(),
            title: Some("Golden hour: on the rooftop".into()),
            date: Some("2026-09-28".into()),
            resolution: Some("2160p".into()),
            extension: "mp4".into(),
        }
    }

    #[test]
    fn renders_the_default_preset() {
        let path = render_path("{performer}/{date} – {title}.{extension}", &sample());
        // The `:` in the title is stripped as an illegal filename character.
        assert_eq!(
            path,
            PathBuf::from("Sienna Kade/2026-09-28 – Golden hour on the rooftop.mp4")
        );
    }

    #[test]
    fn applies_format_variants() {
        let path = render_path(
            "{site|lower}/{performer|kebab} [{id|pad8}] {date|month}.{extension|upper}",
            &sample(),
        );
        assert_eq!(
            path,
            PathBuf::from("fansly/sienna-kade [00884213] Sep 2026.MP4")
        );
    }

    #[test]
    fn missing_token_collapses_its_folder_segment() {
        let name = MediaName {
            performer: None,
            ..sample()
        };
        // `{performer}/...` with no performer must not leave a leading `/`.
        let path = render_path("{performer}/{date} – {title}.{extension}", &name);
        assert_eq!(
            path,
            PathBuf::from("2026-09-28 – Golden hour on the rooftop.mp4")
        );
    }

    #[test]
    fn rejects_path_traversal_in_values() {
        let name = MediaName {
            performer: Some("../../etc".into()),
            ..sample()
        };
        let path = render_path("{performer}/{id}.{extension}", &name);
        // `..` segments are dropped, leaving only the safe remainder.
        assert_eq!(path, PathBuf::from("etc/884213.mp4"));
    }

    #[test]
    fn resolution_label_maps_known_heights() {
        assert_eq!(format_value("2160p", "label"), "4K");
        assert_eq!(format_value("1080p", "label"), "HD");
        assert_eq!(format_value("999p", "label"), "999p");
    }

    #[test]
    fn with_index_inserts_before_extension() {
        assert_eq!(
            with_index(std::path::Path::new("fansly/golden hour.mp4"), 2),
            PathBuf::from("fansly/golden hour-2.mp4")
        );
        assert_eq!(
            with_index(std::path::Path::new("noext"), 3),
            PathBuf::from("noext-3")
        );
    }

    #[test]
    fn unix_epoch_and_a_known_date() {
        assert_eq!(unix_to_ymd(0), "1970-01-01");
        // 2026-09-28T00:00:00Z
        assert_eq!(unix_to_ymd(1_790_553_600), "2026-09-28");
    }
}
