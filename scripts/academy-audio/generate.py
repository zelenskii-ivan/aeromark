#!/usr/bin/env python3
"""
Генерирует записи для Академии пилотов голосом RHVoice «dasha-rus»
(лицензия CC BY-SA 4.0 — разрешает использование в приложении с указанием
авторства, см. public/audio/academy/LICENSE.md).

Почему готовые записи, а не синтез в браузере:
  - встроенные голоса браузеров разные на каждом устройстве, на части
    Android и Linux русского голоса нет вовсе;
  - браузерный синтезатор читает отдельный слог как аббревиатуру
    («мо» → «эм-о») и глотает короткие слоги;
  - записи весят ~3 МБ на всю программу, кешируются service worker'ом и
    работают офлайн; никаких ключей облачных сервисов в клиенте.

Запуск (нужны собранный RHVoice и ffmpeg):
  node --experimental-strip-types scripts/academy-audio/collect.mjs > /tmp/list.json
  RHVOICE=/opt/rhv/inst python3 scripts/academy-audio/generate.py /tmp/list.json

Каждая запись проверяется: не пустая, не тише порога, длительность в
пределах для своей длины текста. Отклонённые записи не попадают в манифест —
для них приложение использует запасной синтез браузера.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "public", "audio", "academy")
MANIFEST = os.path.join(ROOT, "content", "academy", "audio-manifest.ts")
RHVOICE = os.environ.get("RHVOICE", "/opt/rhv/inst")
VOICE = "dasha-rus"
# Темп: звуки и слоги медленно, текст — спокойно, реплики — обычным темпом.
RATE = {"unit": "50", "text": "75", "voice": "85"}


def run(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)


def synth(text, rate, wav):
    env = dict(os.environ, LD_LIBRARY_PATH=os.path.join(RHVOICE, "lib"))
    subprocess.run(
        [os.path.join(RHVOICE, "bin", "RHVoice-test"), "-p", VOICE, "-r", rate, "-q", "max", "-R", "24000", "-o", wav],
        input=text.encode("utf-8"),
        env=env,
        check=True,
        capture_output=True,
    )


def probe(path):
    """Длительность и средняя громкость записи."""
    duration = float(
        run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).stdout.decode().strip()
    )
    stats = run(["ffmpeg", "-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-"]).stderr.decode()
    mean = re.search(r"mean_volume: (-?[\d.]+) dB", stats)
    return duration, float(mean.group(1)) if mean else -99.0


def letters(text):
    return len(re.sub(r"[^а-яё]", "", text.lower()))


def check(text, category, duration, mean):
    if mean < -35:
        return f"слишком тихо ({mean} dB)"
    n = letters(text)
    low = 0.2 if category == "unit" else 0.05 * n
    high = 0.75 + 0.25 * n if category == "unit" else 1.0 + 0.16 * n
    if duration < low:
        return f"слишком коротко ({duration:.2f} с)"
    if duration > high:
        return f"слишком длинно ({duration:.2f} с) — возможно, синтезатор прочитал по буквам"
    return None


def main():
    entries = json.load(open(sys.argv[1], encoding="utf-8"))
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = {}
    rejected = []
    keep = set()
    with tempfile.TemporaryDirectory() as tmp:
        for entry in entries:
            text, key, category = entry["text"], entry["key"], entry["category"]
            # Имя файла — хеш текста и голоса: при смене голоса или текста
            # имя меняется, и кеш браузера не отдаёт старую запись.
            name = hashlib.sha1(f"{VOICE}|{RATE[category]}|{text}".encode()).hexdigest()[:12] + ".mp3"
            target = os.path.join(OUT_DIR, name)
            keep.add(name)
            if not os.path.exists(target):
                wav = os.path.join(tmp, "raw.wav")
                synth(text if category != "unit" else text + ".", RATE[category], wav)
                run([
                    "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", wav, "-af",
                    # Срезаем тишину по краям, оставляем короткий хвост и
                    # выравниваем громкость, чтобы все записи звучали ровно.
                    "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                    "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                    "adelay=60,apad=pad_dur=0.12,loudnorm=I=-17:TP=-1.5:LRA=11",
                    "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k", target,
                ])
            duration, mean = probe(target)
            problem = check(text, category, duration, mean)
            if problem:
                rejected.append(f"{text!r}: {problem}")
                os.remove(target)
                continue
            manifest[key] = {"file": name, "ms": round(duration * 1000)}
    for stale in os.listdir(OUT_DIR):
        if stale.endswith(".mp3") and stale not in keep:
            os.remove(os.path.join(OUT_DIR, stale))
    lines = [
        "// Создано scripts/academy-audio/generate.py — не редактировать вручную.",
        "// Ключ — audioKey(текст), значение — файл в /audio/academy/ и длительность.",
        "export const AUDIO_MANIFEST: Record<string, { file: string; ms: number }> = {",
    ]
    for key in sorted(manifest):
        item = manifest[key]
        lines.append(f'  {json.dumps(key, ensure_ascii=False)}: {{ file: "{item["file"]}", ms: {item["ms"]} }},')
    lines.append("};")
    open(MANIFEST, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"записей: {len(manifest)}, отклонено: {len(rejected)}")
    for line in rejected:
        print("  ОТКЛОНЕНО", line)


if __name__ == "__main__":
    main()
