#!/usr/bin/env python3
"""
Импорт записей, сделанных голосом macOS (скрипт aeromark-voice.sh на Mac).

Записи пронумерованы по порядку списка из collect.mjs. Скрипт срезает
тишину, выравнивает громкость, кодирует в mp3, проверяет длительность и
громкость и пересобирает манифест. Отклонённые записи в манифест не
попадают — для них приложение использует запасной синтез браузера.

Запуск:
  node --experimental-strip-types scripts/academy-audio/collect.mjs > /tmp/list.json
  python3 scripts/academy-audio/import.py /tmp/list.json /путь/к/распакованным/wav
"""
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from generate import MANIFEST, OUT_DIR, check, probe, run  # noqa: E402


def main():
    entries = json.load(open(sys.argv[1], encoding="utf-8"))
    source = sys.argv[2]
    voice = open(os.path.join(source, "voice.txt"), encoding="utf-8").read().strip() if os.path.exists(os.path.join(source, "voice.txt")) else "mac"
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest, rejected, keep = {}, [], set()
    for index, entry in enumerate(entries):
        wav = os.path.join(source, f"{index:03d}.wav")
        if not os.path.exists(wav):
            rejected.append(f"{entry['text']!r}: нет записи")
            continue
        name = hashlib.sha1(f"{voice}|{entry['text']}".encode()).hexdigest()[:12] + ".mp3"
        target = os.path.join(OUT_DIR, name)
        run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", wav, "-af",
            "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
            "silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
            "adelay=40,apad=pad_dur=0.1,loudnorm=I=-17:TP=-1.5:LRA=11",
            "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "56k", target,
        ])
        duration, mean = probe(target)
        problem = check(entry["text"], entry["category"], duration, mean)
        if problem:
            rejected.append(f"{entry['text']!r}: {problem}")
            os.remove(target)
            continue
        keep.add(name)
        manifest[entry["key"]] = {"file": name, "ms": round(duration * 1000)}
    for stale in os.listdir(OUT_DIR):
        if stale.endswith(".mp3") and stale not in keep:
            os.remove(os.path.join(OUT_DIR, stale))
    lines = [
        f"// Создано scripts/academy-audio/import.py ({voice}) — не редактировать вручную.",
        "// Ключ — audioKey(текст), значение — файл в /audio/academy/ и длительность.",
        "export const AUDIO_MANIFEST: Record<string, { file: string; ms: number }> = {",
    ]
    for key in sorted(manifest):
        item = manifest[key]
        lines.append(f'  {json.dumps(key, ensure_ascii=False)}: {{ file: "{item["file"]}", ms: {item["ms"]} }},')
    lines.append("};")
    open(MANIFEST, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"голос: {voice}; записей: {len(manifest)}, отклонено: {len(rejected)}")
    for line in rejected:
        print("  ОТКЛОНЕНО", line)


if __name__ == "__main__":
    main()
