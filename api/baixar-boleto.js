const DEFAULT_ERROR_MESSAGE = 'Não foi possível baixar o boleto no SGA/Hinova.';
const DEFAULT_LOGIN_URL = 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/index.php';
let cachedSgaCookie = '';
let cachedSgaCookieCreatedAt = 0;

function isTrue(value) {
  return String(value || '').toLowerCase() === 'true';
}


function getEnv(name, fallback = '') {
  return process.env[name] || fallback;
}

function getEffectiveCookie() {
  return cachedSgaCookie || process.env.HINOVA_COOKIE || '';
}

function canAutoLogin() {
  return Boolean(process.env.HINOVA_LOGIN_USER && process.env.HINOVA_LOGIN_PASSWORD);
}

function isAutoLoginEnabled() {
  return canAutoLogin() && String(process.env.HINOVA_AUTO_LOGIN || 'true').toLowerCase() !== 'false';
}

function splitSetCookieHeader(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;,\s]+=)/g).map((item) => item.trim()).filter(Boolean);
}

function getSetCookieValues(headers) {
  if (!headers) return [];
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get?.('set-cookie') || '';
  return splitSetCookieHeader(raw);
}

function cookieNameValue(setCookie = '') {
  return String(setCookie || '').split(';')[0].trim();
}

function mergeCookieStrings(...cookieStrings) {
  const map = new Map();

  cookieStrings
    .flatMap((value) => Array.isArray(value) ? value : String(value || '').split(';'))
    .map((value) => cookieNameValue(value))
    .filter((value) => value && value.includes('='))
    .forEach((pair) => {
      const name = pair.slice(0, pair.indexOf('=')).trim();
      if (!name) return;
      map.set(name, pair);
    });

  return [...map.values()].join('; ');
}

function getAttr(tag = '', attr = '') {
  const pattern = new RegExp(`${attr}\\s*=\\s*(["'])(.*?)\\1`, 'i');
  return String(tag || '').match(pattern)?.[2] || '';
}

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseLoginFormFields(html = '') {
  const params = new URLSearchParams();
  const inputRegex = /<input\b[^>]*>/gi;

  for (const match of String(html || '').matchAll(inputRegex)) {
    const tag = match[0];
    const name = getAttr(tag, 'name');
    if (!name) continue;

    const type = getAttr(tag, 'type').toLowerCase();
    if (['submit', 'button', 'image', 'file'].includes(type)) continue;

    params.set(name, decodeHtmlEntities(getAttr(tag, 'value')));
  }

  return params;
}

function getLoginFormAction(html = '', fallbackUrl = DEFAULT_LOGIN_URL) {
  const formTag = String(html || '').match(/<form\b[^>]*>/i)?.[0] || '';
  const action = getAttr(formTag, 'action');
  if (!action) return fallbackUrl;

  try {
    return new URL(decodeHtmlEntities(action), fallbackUrl).toString();
  } catch {
    return fallbackUrl;
  }
}

function applyExtraLoginFields(params) {
  const extra = process.env.HINOVA_LOGIN_EXTRA_FIELDS;
  if (!extra) return;

  try {
    const json = JSON.parse(extra);
    Object.entries(json).forEach(([key, value]) => params.set(key, String(value ?? '')));
    return;
  } catch {
    // Também aceita formato URLSearchParams: campo=valor&outro=valor
  }

  const extraParams = new URLSearchParams(extra);
  for (const [key, value] of extraParams.entries()) {
    params.set(key, value);
  }
}

function basicBrowserHeaders({ referer = '', cookie = '', form = false } = {}) {
  const headers = {
    Accept: form ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' : '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  };

  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
  if (referer) headers.Referer = referer;
  if (cookie) headers.Cookie = cookie;
  headers.Origin = process.env.HINOVA_ORIGIN || 'https://sga.hinova.com.br';

  return headers;
}

async function loginSga(force = false) {
  if (!isAutoLoginEnabled()) return '';

  const ttlMs = Number(process.env.HINOVA_LOGIN_CACHE_MS || 20 * 60 * 1000);
  if (!force && cachedSgaCookie && Date.now() - cachedSgaCookieCreatedAt < ttlMs) {
    return cachedSgaCookie;
  }

  const loginUrl = getEnv('HINOVA_LOGIN_URL', DEFAULT_LOGIN_URL);
  const loginGet = await fetch(loginUrl, {
    method: 'GET',
    headers: basicBrowserHeaders(),
    redirect: 'manual',
  });

  const loginHtml = await loginGet.text();
  let cookie = mergeCookieStrings(process.env.HINOVA_COOKIE || '', getSetCookieValues(loginGet.headers));

  const params = parseLoginFormFields(loginHtml);
  const userField = getEnv('HINOVA_LOGIN_USER_FIELD', 'usuario');
  const passwordField = getEnv('HINOVA_LOGIN_PASSWORD_FIELD', 'senha');
  params.set(userField, process.env.HINOVA_LOGIN_USER);
  params.set(passwordField, process.env.HINOVA_LOGIN_PASSWORD);
  applyExtraLoginFields(params);

  const postUrl = getEnv('HINOVA_LOGIN_POST_URL', getLoginFormAction(loginHtml, loginUrl));
  const postResponse = await fetch(postUrl, {
    method: 'POST',
    headers: basicBrowserHeaders({ referer: loginUrl, cookie, form: true }),
    body: params.toString(),
    redirect: 'manual',
  });

  cookie = mergeCookieStrings(cookie, getSetCookieValues(postResponse.headers));
  let postText = '';

  const location = postResponse.headers.get('location');
  if (location && postResponse.status >= 300 && postResponse.status < 400) {
    const nextUrl = new URL(location, postUrl).toString();
    const followResponse = await fetch(nextUrl, {
      method: 'GET',
      headers: basicBrowserHeaders({ referer: postUrl, cookie }),
      redirect: 'manual',
    });
    cookie = mergeCookieStrings(cookie, getSetCookieValues(followResponse.headers));
    postText = await followResponse.text().catch(() => '');
  } else {
    postText = await postResponse.text().catch(() => '');
  }

  if (!cookie) {
    const error = new Error('Não foi possível obter cookie ao tentar login automático no SGA.');
    error.status = 401;
    error.details = postText.slice(0, 1200);
    throw error;
  }

  cachedSgaCookie = cookie;
  cachedSgaCookieCreatedAt = Date.now();
  return cachedSgaCookie;
}

function getSafeFilename(value = '') {
  const fallback = 'boleto.pdf';
  const cleaned = String(value || fallback)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

  if (!cleaned) return fallback;
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

function isAllowedSgaBoletoUrl(rawUrl = '') {
  try {
    const url = new URL(String(rawUrl));
    return url.protocol === 'https:' &&
      url.hostname === 'sga.hinova.com.br' &&
      url.pathname.includes('/sga/sgav4_novohorizonte/boleto/gerarBoletoAvulso.php');
  } catch {
    return false;
  }
}

function buildHeaders() {
  const headers = {
    Accept: 'application/pdf,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    Referer: process.env.HINOVA_REFERER || 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/associado/consultarAssociado.php',
  };

  const cookie = getEffectiveCookie();
  if (cookie) {
    headers.Cookie = cookie;
  }

  return headers;
}

function looksLikeAuthError(text = '') {
  const raw = String(text).toLowerCase();
  return raw.includes('falha na autentica') ||
    raw.includes('falha na autenticação') ||
    raw.includes('codigo_mobile') ||
    raw.includes('name="usuario"') ||
    raw.includes("name='usuario'") ||
    raw.includes('location.href="https://sga.hinova.com.br/sga/sgav4_novohorizonte/index.php"') ||
    raw.includes("location.href='https://sga.hinova.com.br/sga/sgav4_novohorizonte/index.php'");
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  const boletoUrl = req.query?.url;
  const filename = getSafeFilename(req.query?.filename);

  if (!boletoUrl || !isAllowedSgaBoletoUrl(boletoUrl)) {
    return res.status(400).json({ message: 'URL de boleto inválida.' });
  }

  if (!getEffectiveCookie() && !isAutoLoginEnabled()) {
    return res.status(500).json({
      message: 'Configure HINOVA_COOKIE ou HINOVA_LOGIN_USER/HINOVA_LOGIN_PASSWORD para baixar o boleto com sessão válida do SGA.',
    });
  }

  try {
    if (!getEffectiveCookie() && isAutoLoginEnabled()) {
      await loginSga(true);
    }

    let response = await fetch(boletoUrl, {
      method: 'GET',
      headers: buildHeaders(),
      redirect: 'follow',
    });

    let contentType = response.headers.get('content-type') || '';
    let buffer = Buffer.from(await response.arrayBuffer());

    if (!response.ok) {
      const details = buffer.toString('utf8').slice(0, 1500);
      return res.status(response.status).json({
        message: `SGA/Hinova retornou HTTP ${response.status} ao baixar o boleto.`,
        ...(isTrue(process.env.HINOVA_DEBUG_RESPONSE) ? { details } : {}),
      });
    }

    const textPreview = contentType.includes('text/') || contentType.includes('html')
      ? buffer.toString('utf8').slice(0, 2500)
      : '';

    if (textPreview && looksLikeAuthError(textPreview) && isAutoLoginEnabled()) {
      await loginSga(true);
      response = await fetch(boletoUrl, {
        method: 'GET',
        headers: buildHeaders(),
        redirect: 'follow',
      });
      contentType = response.headers.get('content-type') || '';
      buffer = Buffer.from(await response.arrayBuffer());
    }

    const retryTextPreview = contentType.includes('text/') || contentType.includes('html')
      ? buffer.toString('utf8').slice(0, 2500)
      : '';

    if (retryTextPreview && looksLikeAuthError(retryTextPreview)) {
      return res.status(401).json({
        message: 'O SGA recusou a emissão do boleto. O login automático não conseguiu renovar a sessão; atualize o HINOVA_COOKIE ou confira usuário/senha.',
        ...(isTrue(process.env.HINOVA_DEBUG_RESPONSE) ? { details: retryTextPreview } : {}),
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', contentType && !contentType.includes('text/html') ? contentType : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({
      message: error.message || DEFAULT_ERROR_MESSAGE,
      ...(isTrue(process.env.HINOVA_DEBUG_RESPONSE) ? { details: String(error.stack || error) } : {}),
    });
  }
}
