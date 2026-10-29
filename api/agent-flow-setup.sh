#!/usr/bin/env zsh
set -euo pipefail

ROOT="$(pwd)"
RUN="$ROOT/agent-run"
PROMPTS="$RUN/prompts"
STATE="$RUN/state"
LOG="$RUN/log.txt"

mkdir -p "$PROMPTS" "$STATE"
touch "$LOG"

# Mevcut yapıyı ve ödeme veri güvenliğini koru
cat > "$RUN/INTEGRATION_RULES.txt" << 'IR'
INTEGRATION (zorunlu):
- AGENTS.md kurallarına uy; hosted checkout veya provider token dışında kart verisi işleme.
- Mevcut provider adapter, auth ve DB kodunu reuse et.
- PAN, CVV, OTP/auth secret, provider secret veya raw response loglama/saklama.
- Migration yalnızca add/alter olsun; destructive reset yapma.
- Provider sandbox ya da DB erişimi yoksa sonucu PASS diye işaretleme.
IR

write_prompt() {
  local id="$1"; shift
  local f="$PROMPTS/${id}.md"
  cat > "$f" << PROMPT
# ${id}

AGENTS.md kurallarına uy. Bilinmeyen provider akışında fail closed.

$(cat "$RUN/INTEGRATION_RULES.txt")

Bitirme formatı (zorunlu):
DONE
- paths: (yazılan/değişen dosyalar)
- reused: (mevcut stripe/authnet/clover/auth/db parçaları)
- run: (komutlar)
- risk: (varsa)

---

$@
PROMPT
  echo "wrote $f"
}

# --- S0 ---
write_prompt S0 '
SADECE REPO TARAMASI. Stack, provider adapters, env variable NAMES,
auth/RBAC, DB migration runner ve mevcut token enrollment/POS/UI yollarını
özetle. Raw card veya secret değerlerini açma. Kod yazma.
'

# --- S1 ---
write_prompt S1 '
Mevcut şemayı eşleştir. Var olan users.role, bin_checks, card_enrollments,
processor_accounts, merchant_transactions, charges, audit_events tablolarını
yeniden oluşturma. Yalnızca credits, credit_ledger, non-secret settings ve
token-enrollment referanslı provisions eksikse additive migration ekle.
Admin hesabı ADMIN_EMAIL/ADMIN_PASSWORD env ile hazırlanır. Ücret, auth miktarı
ve provider hesabı uydurma; secret veya kart verisi seed etme. Migration/setup
komutlarını yaz; DB reset veya production migration çalıştırma.
'

# --- S2 ---
write_prompt S2 '
Mevcut JWT/RBAC üzerine requireAuth, requireAdmin, owner scope ve view guard
ekle. Credits spend/grant/balance row lock ve idempotency ile atomik olmalı.
Settings yalnız admin yazabilir, audited ve non-secret allowlist olmalı.
Yetersiz kredide fail closed.
'

# --- S3 ---
write_prompt S3 '
Mevcut ProviderFactory/adapters ve şifreli vaultı reuse et. Yalnızca tokenized
POS sağlayıcılarını sun; kullanıcı server default kullanır, admin default seçer.
Provider sonuçlarını allowlist et, raw response/client secret/OTP/payment token
saklama. Hosted 3DS redirect yalnız açıkça başlatılan tokenlı işlem için.
'

# --- S4 ---
write_prompt S4 '
card_enrollments token referansını reuse et. BIN endpoint yalnız tam 6 rakamı
kabul etsin ve allowlist metadata dönsün. Auth-only live/dead card check, PAN/CVV
endpointi veya fail-count burn ekleme. Açık tokenlı POS işleminde providerın
hosted auth redirect sonucunu işle.
'

# --- S5 ---
write_prompt S5 '
Owner-scoped PaymentService capture akışını reuse et. FULL_AUTH, BELOW_AUTH ve
CUSTOM capture destekle; PCT_120 hesapla fakat auth üstüne capture etme.
Over-auth için otomatik sale fallback yok. Ayrı sale varsa kullanıcı açıkça
başlatır ve provider tokenı kullanır. Belirsiz yanıtı reconciliation için kilitle.
'

# --- S6 ---
write_prompt S6 '
Admin-only settings/provider default/credit grant ve global masked enrollment,
provision, transaction metadata endpointlerini ekle. GET /ledger owner-scoped.
Non-admin writes 403, tüm yazmalar audit, response içinde token/raw provider data yok.
'

# --- S7 ---
write_prompt S7 '
Mevcut React layout ve pages ile ödeme ayarları, token enrollment, POS, BIN
metadata, provision/transaction listesi, admin credit management ve user ledger
entegrasyonu. User provider seçemez. Raw card/CVV/live-dead UI ekleme.
'

# --- S8 ---
write_prompt S8 '
Repo-local unit/build checks çalıştır; synthetic data kullan. DB/provider sandbox
yoksa NOT RUN yaz. Owner scope, admin 403, atomic credits/idempotency, six-digit
BIN only, HTTPS hosted redirect, auth üstü capture rejection ve UI guard kontrol et.
Gerçek payment request veya production migration çalıştırma.
'

# state
echo "0" > "$STATE/step"          # 0=hazır S0 için
echo "pending" > "$STATE/status"
cat > "$STATE/steps.txt" << 'ST'
S0
S1
S2
S3
S4
S5
S6
S7
S8
ST

echo ""
echo "OK setup: $RUN"
echo "Sonraki: zsh ./agent-flow.sh next"
