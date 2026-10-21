const { detectBrand } = require('../utils/brand');

class CardParser {
  /**
   * Basit format: PAN|exp|cvv
   */
  static parseSimple(line) {
    if (!line) return null;
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('=') || line.startsWith('---')) return null;
    line = line.replace(/^[\s\-—–*]+/, '').trim();

    let parts;
    if (line.includes('|')) parts = line.split('|').map((p) => p.trim());
    else parts = line.split(/\s+/).filter((p) => p.length > 0);

    if (parts.length < 3) return null;

    let pan = parts[0].replace(/\D/g, '');
    if (pan.length < 13 || pan.length > 19) return null;

    let expMonth, expYear, cvv;
    if (parts[1].includes('/')) {
      const [m, y] = parts[1].split('/');
      expMonth = m; expYear = y; cvv = parts[2];
    } else if (/^\d{2}$/.test(parts[1]) && /^\d{2,4}$/.test(parts[2])) {
      expMonth = parts[1]; expYear = parts[2]; cvv = parts[3];
    } else return null;

    if (!cvv) return null;
    cvv = cvv.replace(/\D/g, '');
    if (cvv.length < 3 || cvv.length > 4) return null;

    expMonth = expMonth.padStart(2, '0');
    if (expYear.length === 2) {
      const yy = parseInt(expYear, 10);
      expYear = (yy < 50 ? '20' : '19') + expYear;
    }
    if (!/^\d{2}$/.test(expMonth) || !/^\d{4}$/.test(expYear)) return null;

    return { raw: line, pan, expMonth, expYear, cvv, brand: detectBrand(pan) };
  }

  /**
   * Tam format: PAN|exp|cvv|isim|adres|şehir|eyalet|zip|telefon|email|ülke
   */
  static parseFull(line) {
    if (!line) return null;
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('=') || line.startsWith('---')) return null;
    line = line.replace(/^[\s\-—–*+]+/, '').trim();

    let parts;
    if (line.includes('|')) parts = line.split('|').map((p) => p.trim());
    else parts = line.split(/\s+/).filter((p) => p.length > 0);

    if (parts.length < 3) return null;

    let pan = parts[0].replace(/\D/g, '');
    if (pan.length < 13 || pan.length > 19) return null;

    let expMonth, expYear, cvv, dataStartIdx;
    if (parts[1].includes('/')) {
      const [m, y] = parts[1].split('/');
      expMonth = m; expYear = y; cvv = parts[2];
      dataStartIdx = 3;
    } else if (/^\d{2}$/.test(parts[1]) && /^\d{2,4}$/.test(parts[2])) {
      expMonth = parts[1]; expYear = parts[2]; cvv = parts[3];
      dataStartIdx = 4;
    } else return null;

    if (!cvv) return null;
    cvv = cvv.replace(/\D/g, '');
    if (cvv.length < 3 || cvv.length > 4) return null;

    expMonth = expMonth.padStart(2, '0');
    if (expYear.length === 2) {
      const yy = parseInt(expYear, 10);
      expYear = (yy < 50 ? '20' : '19') + expYear;
    }
    if (!/^\d{2}$/.test(expMonth) || !/^\d{4}$/.test(expYear)) return null;

    const rest = parts.slice(dataStartIdx).filter((p) => p.length > 0);
    const result = {
      name: '', address: '', city: '', state: '',
      zip: '', phone: '', email: '', country: '',
    };

    // Kategorize et
    const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    const isPhone = (s) => /^[\+\d][\d\s\-\(\)]{7,}$/.test(s) && !s.includes('@');
    const isZip = (s) => /^\d{5}(-\d{4})?$/.test(s) || /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(s);
    const isCountry = (s) => /^(US|CA|GB|AU|DE|FR|IT|ES|NL|IE|TR|IN|IQ|PR|NZ|BE|PL|TH|MX|JP|KR|ENG|UK|BS|BR|CH|AT|SE|NO|DK|FI|PT|GR|RU|UA|ZA|EG|SA|AE|IL|CN|HK|SG|MY|ID|PH|VN|TW|AR|CL|CO|PE|VE|EC|UY|PY|BO|CR|PA|GT|DO|CU|JM|TT|BB|BS|BZ|HN|SV|NI)$/i.test(s);
    const isStateCode = (s) => /^[A-Z]{2}$/.test(s) && !isCountry(s);

    const classified = [];
    for (const p of rest) {
      if (isEmail(p)) { result.email = p; continue; }
      if (isCountry(p)) { result.country = p.toUpperCase(); continue; }
      if (isZip(p)) { result.zip = p; continue; }
      if (isPhone(p) && !result.phone) { result.phone = p; continue; }
      classified.push(p);
    }

    let idx = 0;
    if (idx < classified.length) { result.name = classified[idx]; idx++; }
    if (
      idx < classified.length &&
      classified[idx].length < 25 &&
      /^[a-zA-ZçğıöşüÇĞİÖŞÜ\s\-']+$/.test(classified[idx])
    ) {
      if (classified[idx].split(/\s+/).length <= 3) {
        result.name += ' ' + classified[idx];
        idx++;
      }
    }
    for (let i = classified.length - 1; i >= idx; i--) {
      if (isStateCode(classified[i])) {
        result.state = classified[i];
        classified.splice(i, 1);
        break;
      }
    }
    const remaining = classified.slice(idx);
    if (remaining.length === 1) result.city = remaining[0];
    else if (remaining.length === 2) {
      result.address = remaining[0];
      result.city = remaining[1];
    } else if (remaining.length >= 3) {
      result.city = remaining[remaining.length - 1];
      result.address = remaining.slice(0, -1).join(', ');
    }

    return { raw: line, pan, expMonth, expYear, cvv, brand: detectBrand(pan), ...result };
  }
}

module.exports = CardParser;