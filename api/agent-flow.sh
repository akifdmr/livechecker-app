#!/usr/bin/env zsh
set -euo pipefail

ROOT="$(pwd)"
RUN="$ROOT/agent-run"
PROMPTS="$RUN/prompts"
STATE="$RUN/state"
LOG="$RUN/log.txt"
CLIP="${AGENT_FLOW_CLIP:-1}"   # 1=pbcopy ile panoya al

steps=(S0 S1 S2 S3 S4 S5 S6 S7 S8)

log() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG"; }

current_index() {
  local s
  s="$(cat "$STATE/step" 2>/dev/null || echo 0)"
  echo "$s"
}

print_status() {
  local i
  i="$(current_index)"
  echo "=== AGENT FLOW ==="
  echo "root: $ROOT"
  echo "step_index: $i / ${#steps[@]}"
  local k=0
  for st in "${steps[@]}"; do
    local mark=" "
    if (( k < i )); then mark="✓"
    elif (( k == i )); then mark="▶"
    else mark="·"
    fi
    echo "  $mark $st  ($PROMPTS/$st.md)"
    ((k++)) || true
  done
  echo "status: $(cat "$STATE/status" 2>/dev/null || echo '?')"
  echo "=================="
}

copy_prompt() {
  local file="$1"
  if [[ "$CLIP" == "1" ]] && command -v pbcopy >/dev/null 2>&1; then
    pbcopy < "$file"
    echo "(panoya kopyalandı — Agent chat’e Cmd+V)"
  fi
}

cmd_next() {
  local i
  i="$(current_index)"
  if (( i >= ${#steps[@]} )); then
    log "Tümü bitti. S8 PASS runbook’u kontrol et."
    print_status
    return 0
  fi
  # önceki adım done değilse uyar
  if [[ -f "$STATE/status" ]] && [[ "$(cat "$STATE/status")" == "waiting_done" ]]; then
    echo "Önceki adım hâlâ waiting_done."
    echo "Agent DONE dediyse: zsh ./agent-flow.sh done"
    echo "Agent FAIL/yarım ise: zsh ./agent-flow.sh fail \"sebep\""
    print_status
    return 1
  fi
  local id="${steps[$i+1]}"   # zsh 1-based → steps[i+1] çünkü i 0-based: use steps[$((i+1))] 
  # zsh arrays are 1-based:
  id="${steps[$((i+1))]}"
  local file="$PROMPTS/${id}.md"
  [[ -f "$file" ]] || { echo "eksik: $file"; return 1; }

  echo ""
  echo "──────── $id PROMPT ────────"
  cat "$file"
  echo "──────── END $id ────────"
  copy_prompt "$file"

  echo "waiting_done" > "$STATE/status"
  log "DISPATCH $id"
  print_status
  echo ""
  echo "1) Agent chat’e yapıştır (Cmd+V)"
  echo "2) Agent dosya yazsın; DONE + paths gelsin"
  echo "3) zsh ./agent-flow.sh done"
}

cmd_done() {
  local i
  i="$(current_index)"
  if (( i >= ${#steps[@]} )); then
    echo "Zaten tamam."
    return 0
  fi
  local id="${steps[$((i+1))]}"
  if [[ "$(cat "$STATE/status")" != "waiting_done" ]]; then
    echo "Şu an waiting_done değil. Önce: zsh ./agent-flow.sh next"
    return 1
  fi
  # opsiyonel kanıt dosyası
  mkdir -p "$STATE/evidence"
  local ev="$STATE/evidence/${id}.txt"
  {
    echo "DONE_AT=$(date -Iseconds)"
    echo "STEP=$id"
    echo "NOTE=${1:-ok}"
  } > "$ev"

  echo $((i + 1)) > "$STATE/step"
  echo "ready" > "$STATE/status"
  log "DONE $id → step=$(cat "$STATE/step")"
  print_status

  if (( $(current_index) >= ${#steps[@]} )); then
    echo "🎉 S0–S8 tamam. Runbook + PASS tablosunu doğrula."
  else
    echo "Sıradaki için: zsh ./agent-flow.sh next"
  fi
}

cmd_fail() {
  local reason="${*:-unspecified}"
  local i id
  i="$(current_index)"
  id="${steps[$((i+1))]}"
  mkdir -p "$STATE/evidence"
  echo "FAIL $id: $reason" | tee -a "$LOG" > "$STATE/evidence/${id}.FAIL.txt"
  echo "waiting_done" > "$STATE/status"
  cat > "$PROMPTS/FIX_NOW.md" << FX
# FIX for $id

AGENTS.md talimatlarını izle. Fail durumunu güvenli kapsamda düzelt.
Mevcut yapıyı koru; sadece gerekli patch'i yap.

FAIL sebebi: $reason

Önceki $id hedeflerini tamamla.
Özellikle kontrol:
- owner scope ve admin-only writes
- atomic, idempotent credit changes
- provider token-only action results; no raw secrets or raw response storage
- exact 6 digit BIN metadata only
- hosted 3DS redirect; no live/dead card verification
- capture never exceeds provider authorization; no automatic sale fallback

Bitince DONE + paths + ne patch’lendi.
FX
  echo "──────── FIX PROMPT ────────"
  cat "$PROMPTS/FIX_NOW.md"
  echo "──────── END FIX ────────"
  copy_prompt "$PROMPTS/FIX_NOW.md"
  log "FAIL $id — $reason"
  echo "Agent’a FIX yapıştır → düzelince: zsh ./agent-flow.sh done"
}

cmd_replay() {
  # mevcut adımı tekrar bas (step artırmaz)
  local i id file
  i="$(current_index)"
  (( i >= ${#steps[@]} )) && { echo "bitti"; return 0; }
  id="${steps[$((i+1))]}"
  file="$PROMPTS/${id}.md"
  cat "$file"
  copy_prompt "$file"
  echo "waiting_done" > "$STATE/status"
  log "REPLAY $id"
}

cmd_status() { print_status; }

cmd_open() {
  local i id
  i="$(current_index)"
  (( i >= ${#steps[@]} )) && { echo "bitti"; return 0; }
  id="${steps[$((i+1))]}"
  open -a "Cursor" "$PROMPTS/${id}.md" 2>/dev/null || code "$PROMPTS/${id}.md" 2>/dev/null || true
  echo "$PROMPTS/${id}.md"
}

cmd_reset() {
  echo "0" > "$STATE/step"
  echo "ready" > "$STATE/status"
  log "RESET flow"
  print_status
}

usage() {
  cat << US
Usage: zsh ./agent-flow.sh <cmd>

  next      Sıradaki S prompt’u bas + panoya kopyala
  done      Agent DONE dedi; adımı ilerlet
  fail ...  FAIL + FIX prompt üret (sebep yaz)
  replay    Aynı adımı tekrar bas
  status    İlerleme
  open      Prompt dosyasını editörde aç
  reset     S0’a sıfırla (kodu silmez)

Akış:
  zsh ./agent-flow-setup.sh   # bir kez
  zsh ./agent-flow.sh next    # S0 → agent’e yapıştır
  # agent çalışır, DONE der
  zsh ./agent-flow.sh done
  zsh ./agent-flow.sh next    # S1
  ... S8’e kadar
US
}

case "${1:-}" in
  next) shift; cmd_next "$@" ;;
  done) shift; cmd_done "$@" ;;
  fail) shift; cmd_fail "$@" ;;
  replay) cmd_replay ;;
  status) cmd_status ;;
  open) cmd_open ;;
  reset) cmd_reset ;;
  *) usage ;;
esac
