import { datadogLogs } from '@datadog/browser-logs';

const clientToken = 'pubceb951c58091f8a15ef256b92769d591';
const sensitiveKey = /pan|cvv|cvc|card.?number|account.?number|track|password|secret|token|authorization|raw|request.?body|response.?body|email|phone|address/i;

function redactText(value: string): string {
  return value
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[REDACTED_CARD_NUMBER]')
    .replace(/\b((?:cvv|cvc|security\s*code)\s*[:=]\s*)\S+/gi, '$1[REDACTED]')
    .replace(/\b(?:0?[1-9]|1[0-2])\/(?:\d{2}|20\d{2})\b/g, '[REDACTED_EXPIRY]');
}

function sanitize(value: unknown, key = ''): unknown {
  if (sensitiveKey.test(key)) return undefined;
  if (typeof value === 'string') {
    if (key === 'url' || key === 'referrer') {
      try {
        const url = new URL(value, window.location.origin);
        return `${url.origin}${url.pathname}`;
      } catch {
        return redactText(value.split(/[?#]/, 1)[0]);
      }
    }
    return redactText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item)).filter((item) => item !== undefined);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const child = sanitize(childValue, childKey);
      if (child !== undefined) result[childKey] = child;
    }
    return result;
  }
  return value;
}

datadogLogs.init({
  clientToken,
  site: 'datadoghq.com',
  forwardErrorsToLogs: true,
  sessionSampleRate: 100,
  service: 'livechecker-web',
  env: import.meta.env.MODE,
  beforeSend: (event) => {
    const clean = sanitize(event) as typeof event;
    for (const key of Object.keys(event)) delete (event as Record<string, unknown>)[key];
    Object.assign(event, clean);
    delete event.usr;
    return true;
  },
});
