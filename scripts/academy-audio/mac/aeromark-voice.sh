#!/bin/bash
# Озвучка Академии пилотов голосом Mac. Запуск: bash ~/Downloads/aeromark-voice.sh
# Читает ~/Downloads/aeromark-phrases.tsv, кладёт записи в ~/Downloads/aeromark-voice.zip
set -e
cd ~/Downloads
LIST=aeromark-phrases.tsv
[ -f "$LIST" ] || { echo "Нет файла $LIST в Загрузках"; exit 1; }

# Лучший доступный русский голос: улучшенная Милена, потом обычная.
VOICE=""
for candidate in "Milena (Premium)" "Milena (Enhanced)" "Milena (улучшенный)" "Milena (Улучшенный)" "Milena"; do
  if say -v '?' | grep -q "^${candidate} \{1,\}ru_RU"; then VOICE="$candidate"; break; fi
done
if [ -z "$VOICE" ]; then
  VOICE=$(say -v '?' | grep ru_RU | head -1 | sed -E 's/ +ru_RU.*//')
fi
[ -n "$VOICE" ] || { echo "Русский голос не найден. Настройки → Универсальный доступ → Устный контент → Системный голос → Управлять голосами → Русский → Milena"; exit 1; }
echo "Голос: $VOICE"

OUT=$(mktemp -d)
n=0
while IFS=$'\t' read -r id category text; do
  case "$category" in
    unit) rate=150 ;;   # слоги и слова — чуть медленнее обычного
    text) rate=165 ;;
    *) rate=180 ;;
  esac
  say -v "$VOICE" -r "$rate" --file-format=WAVE --data-format=LEI16@24000 -o "$OUT/$id.wav" -- "$text"
  n=$((n+1))
  if [ $((n % 50)) -eq 0 ]; then echo "  готово $n"; fi
done < "$LIST"
echo "$VOICE" > "$OUT/voice.txt"
rm -f aeromark-voice.zip
(cd "$OUT" && zip -q -r ~/Downloads/aeromark-voice.zip .)
rm -rf "$OUT"
echo "Готово: $n записей → ~/Downloads/aeromark-voice.zip"
