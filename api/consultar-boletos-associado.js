const DEFAULT_ASSOCIADO_URL = 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/carrega/carregaAssociados.php';
const DEFAULT_ASSOCIADO_DADOS_URL = 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/carrega/carregaAssociadoDados.php';
const DEFAULT_BOLETOS_URL = 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/carrega/carregaListaBoletoAJAX.php';
const DEFAULT_VEICULOS_URL = 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/carrega/carregaPlacasVeiculo.php';
const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir a consulta no SGA/Hinova.';
const UPDATE_MESSAGE = 'Este boleto está vencido há mais de 6 dias e não está disponível para emissão pelo site. Por favor, regularize no setor financeiro da Novo Horizonte pelo 0800 590 0656, opção 2.';
const INACTIVE_PLATE_MESSAGE = 'Esta placa está inativa por possuir mais de um boleto vencido há mais de 6 dias. Entre em contato com o financeiro da Novo Horizonte pelo 0800 590 0656, opção 2.';
const CANCELED_PLATE_MESSAGE = 'Esta placa está cancelada. Entre em contato com o atendimento financeiro da Novo Horizonte pelo 0800 590 0656, opção 2.';
const DEFAULT_LOGIN_URL = 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/index.php';
let cachedSgaCookie = '';
let cachedSgaCookieCreatedAt = 0;

function getCleanInput(value) {
  return String(value || '').trim();
}

function onlyDigits(value) {
  return getCleanInput(value).replace(/\D/g, '');
}

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

function decodeHtmlEntities(value = '') {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ccedil: 'ç', Ccedil: 'Ç', aacute: 'á', Aacute: 'Á', eacute: 'é', Eacute: 'É',
    iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú',
    atilde: 'ã', Atilde: 'Ã', otilde: 'õ', Otilde: 'Õ', acirc: 'â', Acirc: 'Â',
    ecirc: 'ê', Ecirc: 'Ê', ocirc: 'ô', Ocirc: 'Ô', agrave: 'à', Agrave: 'À'
  };

  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([a-zA-Z]+);/g, (entity, name) => named[name] ?? entity);
}

function stripTags(value = '') {
  return decodeHtmlEntities(String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function isLoginHtml(text = '') {
  const raw = String(text).toLowerCase();
  return raw.includes('codigo_mobile') ||
    raw.includes('name="usuario"') ||
    raw.includes("name='usuario'") ||
    raw.includes('name="senha"') ||
    raw.includes("name='senha'") ||
    raw.includes('sga - hinova') ||
    raw.includes('location.href="https://sga.hinova.com.br/sga/sgav4_novohorizonte/index.php"') ||
    raw.includes("location.href='https://sga.hinova.com.br/sga/sgav4_novohorizonte/index.php'");
}

function buildHeaders({ form = false, referer = '' } = {}) {
  const headers = {
    Accept: '*/*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest',
  };

  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';

  const token = process.env.HINOVA_TOKEN;
  if (token) {
    const authHeaderName = process.env.HINOVA_AUTH_HEADER || 'Authorization';
    const authPrefix = process.env.HINOVA_AUTH_PREFIX ?? 'Bearer';
    headers[authHeaderName] = String(authPrefix).toLowerCase() === 'none'
      ? token
      : `${authPrefix} ${token}`;
  }

  const cookie = getEffectiveCookie();
  if (cookie) headers.Cookie = cookie;

  headers.Referer = referer || process.env.HINOVA_REFERER || 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/associado/consultarAssociado.php';
  headers.Origin = process.env.HINOVA_ORIGIN || 'https://sga.hinova.com.br';

  return headers;
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  if (!response.ok) {
    const error = new Error(`SGA/Hinova retornou HTTP ${response.status}.`);
    error.status = response.status;
    error.details = text.slice(0, 1600);
    throw error;
  }

  return text;
}

async function fetchSgaText(url, { method = 'GET', form = false, referer = '', body = null, retryOnAuth = true } = {}) {
  const options = {
    method,
    headers: buildHeaders({ form, referer }),
    ...(body ? { body } : {}),
  };

  let text = await fetchText(url, options);

  if (retryOnAuth && isAutoLoginEnabled() && isLoginHtml(text)) {
    await loginSga(true);
    text = await fetchText(url, {
      method,
      headers: buildHeaders({ form, referer }),
      ...(body ? { body } : {}),
    });
  }

  return text;
}

function parseAssociadoXml(xml, documento) {
  if (isLoginHtml(xml)) {
    const error = new Error('O SGA retornou a tela de login. Adicione HINOVA_COOKIE válido ou peça à Hinova uma rota oficial por token.');
    error.status = 401;
    throw error;
  }

  const cleanDocument = onlyDigits(documento);
  const matches = [...String(xml).matchAll(/<rs\b([^>]*)>([\s\S]*?)<\/rs>/gi)];
  if (!matches.length) return null;

  const associados = matches.map((match) => {
    const attrs = match[1] || '';
    const content = stripTags(match[2] || '');
    const id = attrs.match(/\bid=["']?([^"'\s>]+)/i)?.[1] || '';
    const parts = content.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
    const docIndex = parts.findIndex((part) => {
      const digits = onlyDigits(part);
      return digits.length === 11 || digits.length === 14;
    });

    const nome = docIndex > 0 ? parts.slice(0, docIndex).join(' - ') : (parts[0] || content || 'Associado localizado');
    const documentoRetornado = docIndex >= 0 ? onlyDigits(parts[docIndex]) : '';
    const status = docIndex >= 0 ? parts.slice(docIndex + 1).join(' - ') : (parts[2] || '');

    return { id, nome, documento: documentoRetornado || cleanDocument, status, raw: content };
  }).filter((associado) => associado.id);

  if (!associados.length) return null;
  return associados.find((associado) => associado.documento === cleanDocument) || associados[0];
}

function getFieldFromAssociadoDados(html, fieldName) {
  const pattern = new RegExp(`frm\\.${fieldName}\\.value\\s*=\\s*(["'])(.*?)\\1`, 'i');
  const found = String(html).match(pattern);
  return found ? decodeHtmlEntities(found[2]) : '';
}

function updateAssociadoFromDados(associado, html) {
  const nome = getFieldFromAssociadoDados(html, 'dfsNome');
  const documento = getFieldFromAssociadoDados(html, 'dfsCpf');
  const id = getFieldFromAssociadoDados(html, 'dfsMatricula');
  const statusCode = getFieldFromAssociadoDados(html, 'cmbSituacao') || getFieldFromAssociadoDados(html, 'dfsSituacao');

  const statusMap = { '1': 'ATIVO', '2': 'INATIVO', '3': 'CANCELADO' };

  return {
    ...associado,
    id: id || associado.id,
    nome: nome || associado.nome,
    documento: onlyDigits(documento) || associado.documento,
    status: statusMap[statusCode] || associado.status,
  };
}

function parseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('/').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  if (/^\d{2}\/\d{2}\/\d{2}$/.test(raw)) {
    const [day, month, shortYear] = raw.split('/').map(Number);
    const year = shortYear >= 70 ? 1900 + shortYear : 2000 + shortYear;
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  const date = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysAfterDueDate(dueDate, currentDate = new Date()) {
  const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 12);
  const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 12);
  if (today <= due) return 0;

  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.floor((today.getTime() - due.getTime()) / oneDayMs);
}

function getBoletoOverdueDays(dueDateValue) {
  const dueDate = parseDate(dueDateValue);
  if (!dueDate) return 0;
  return daysAfterDueDate(dueDate);
}

function getBoletoMaxDaysAfterDue() {
  const value = Number(process.env.BOLETO_MAX_DAYS_AFTER_DUE || 6);
  return Number.isFinite(value) && value >= 0 ? value : 6;
}

function canIssueBoleto(dueDateValue) {
  const dueDate = parseDate(dueDateValue);
  if (!dueDate) return true;
  return daysAfterDueDate(dueDate) <= getBoletoMaxDaysAfterDue();
}

function normalizeSgaBoletoUrl(key, operacao, baseUrl) {
  if (!key || !operacao) return '';
  const url = new URL('../boleto/gerarBoletoAvulso.php', baseUrl);
  url.searchParams.set('key', decodeHtmlEntities(key));
  url.searchParams.set('operacao', decodeHtmlEntities(operacao));
  url.searchParams.set('layout', process.env.HINOVA_BOLETO_LAYOUT || 'C');
  url.searchParams.set('lote', process.env.HINOVA_BOLETO_LOTE || 'Y');
  url.searchParams.set('mensagem', process.env.HINOVA_BOLETO_MENSAGEM || 'Y');
  url.searchParams.set('desconto', process.env.HINOVA_BOLETO_DESCONTO || 'N');
  return url.toString();
}

function buildBoletoDownloadUrl(sgaUrl, numero = '') {
  if (!sgaUrl) return '';
  const filename = numero ? `boleto-${String(numero).replace(/\D/g, '') || numero}.pdf` : 'boleto.pdf';
  return `/api/baixar-boleto?url=${encodeURIComponent(sgaUrl)}&filename=${encodeURIComponent(filename)}`;
}

function resolveSgaUrl(href, baseUrl) {
  if (!href) return '';
  try {
    return new URL(decodeHtmlEntities(href), baseUrl).toString();
  } catch {
    return '';
  }
}

function extractCellsHtml(rowHtml) {
  return [...String(rowHtml).matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
}

function jsStringUnescape(value = '') {
  return String(value)
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t');
}

function rebuildNamedStringHtml(responseText = '', variableName = '') {
  const fragments = [];
  if (!variableName) return '';

  const escapedName = String(variableName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const singleQuoteRegex = new RegExp(`${escapedName}\\s*\\+=\\s*'((?:\\\\'|[^'])*)';`, 'gi');
  const doubleQuoteRegex = new RegExp(`${escapedName}\\s*\\+=\\s*"((?:\\\\"|[^"])*)";`, 'gi');

  for (const match of String(responseText).matchAll(singleQuoteRegex)) {
    fragments.push(jsStringUnescape(match[1] || ''));
  }

  for (const match of String(responseText).matchAll(doubleQuoteRegex)) {
    fragments.push(jsStringUnescape(match[1] || ''));
  }

  return fragments.join('');
}

function rebuildStringBoletoHtml(responseText = '') {
  return rebuildNamedStringHtml(responseText, 'stringBoleto');
}

function rebuildStringVeiculoHtml(responseText = '') {
  return rebuildNamedStringHtml(responseText, 'stringVeiculo');
}

function extractPlacaForNumero(html, numero) {
  if (!numero) return '';
  const escaped = String(numero).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`id=["']linhaPlaca${escaped}["'][\\s\\S]*?<strong>Placas:<\\/strong>\\s*([^<]+)`, 'i');
  const match = String(html).match(pattern);
  return match ? stripTags(match[1]) : '';
}

function extractStatusFromRow(rowHtml) {
  const titleStatus = String(rowHtml).match(/title=["'](ABERTO|BAIXADO|CANCELADO|EXCLU[IÍ]DO|BAIXADO\s*C\/?\s*PEND[ÊE]NCIA)["']/i)?.[1];
  if (titleStatus) return titleStatus.toUpperCase();

  const imageStatus = String(rowHtml).match(/boleto_([a-z_]+)\.png/i)?.[1] || '';
  if (imageStatus) return imageStatus.replace(/_/g, ' ').toUpperCase();

  return '';
}

function extractPrintUrlFromRow(rowHtml, baseUrl) {
  const matches = [...String(rowHtml).matchAll(/gerarBoletoAvulso\.php\?key=([^&'"\\]+)&(?:amp;)?operacao=([^&'"\\]+)/gi)];
  if (!matches.length) return '';

  // Em geral a segunda ocorrência é o botão de impressão. Se existir mais de uma,
  // usamos a última porque costuma ser a opção visual "Emitir 2ª via".
  const selected = matches[matches.length - 1];
  return normalizeSgaBoletoUrl(selected[1], selected[2], baseUrl);
}

function dedupeBoletos(boletos) {
  const seen = new Set();
  return boletos.filter((boleto) => {
    const key = `${boleto.id}|${boleto.nossoNumero || ''}|${boleto.vencimento}|${boleto.valor}|${boleto.pdf}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseBoletosFinanceiroFromAssociadoDados(responseText, baseUrl) {
  if (isLoginHtml(responseText)) {
    const error = new Error('O SGA retornou a tela de login ao consultar dados financeiros. Adicione HINOVA_COOKIE válido ou peça à Hinova uma rota oficial por token.');
    error.status = 401;
    throw error;
  }

  const html = rebuildStringBoletoHtml(responseText);
  const rows = [...html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((match) => match[0]);

  const boletos = rows.map((row) => {
    if (!/gerarBoletoAvulso\.php/i.test(row)) return null;

    const cellsHtml = extractCellsHtml(row);
    const cells = cellsHtml.map(stripTags);

    if (cells.length < 10) return null;

    const numero = cells[1] || '';
    const nossoNumero = cells[2] || '';
    const tipo = cells[3] || '';
    const banco = cells[4] || '';
    const emissao = cells[5] || '';
    const vencimento = cells[6] || '';
    const dataOriginal = cells[7] || '';
    const valor = cells[9] || '';
    const valorPago = cells[10] || '';
    const parcela = cells[11] || '';
    const controle = cells[12] || '';
    const status = extractStatusFromRow(row) || 'ABERTO';
    const sgaUrl = extractPrintUrlFromRow(row, baseUrl);
    const pdf = buildBoletoDownloadUrl(sgaUrl, numero);
    const placa = extractPlacaForNumero(html, numero);
    const disponivel = canIssueBoleto(vencimento);
    const diasAtraso = getBoletoOverdueDays(vencimento);

    if (!numero && !vencimento && !valor && !pdf) return null;

    return {
      id: numero,
      numero,
      nossoNumero,
      tipo,
      banco,
      emissao,
      vencimento,
      dataOriginal,
      valor,
      valorPago,
      parcela,
      controle,
      placa,
      veiculo: placa ? `Boleto ${numero} — Placa ${placa}` : `Boleto nº ${numero}`,
      status,
      pdf,
      urlOriginal: sgaUrl,
      codigoBarras: '',
      linhaDigitavel: '',
      disponivel,
      diasAtraso,
      mensagem: disponivel ? '' : UPDATE_MESSAGE,
    };
  }).filter(Boolean);

  return dedupeBoletos(boletos);
}

function extractSecondCopyUrl(optionsHtml, baseUrl) {
  const html = String(optionsHtml || '');
  const byTitle = html.match(/data-original-title=["']Emitir Segunda Via["'][\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i);
  if (byTitle?.[1]) return resolveSgaUrl(byTitle[1], baseUrl);

  const byFile = html.match(/href=["']([^"']*gerarBoletoAvulso\.php[^"']*)["']/i);
  if (byFile?.[1]) return resolveSgaUrl(byFile[1], baseUrl);

  return '';
}

function parseBoletosListaHtml(html, baseUrl) {
  if (isLoginHtml(html)) {
    const error = new Error('O SGA retornou a tela de login ao consultar boletos. Adicione HINOVA_COOKIE válido ou peça à Hinova uma rota oficial por token.');
    error.status = 401;
    throw error;
  }

  const body = String(html).match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || String(html);
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];

  const boletos = rows.map((row) => {
    const cellsHtml = extractCellsHtml(row[1]);
    const cells = cellsHtml.map(stripTags);
    if (cells.length < 7) return null;

    const numero = cells[2] || '';
    const emissao = cells[3] || '';
    const vencimento = cells[4] || '';
    const valor = cells[5] || '';
    const status = cells[6] || '';
    const sgaUrl = extractSecondCopyUrl(cellsHtml[7], baseUrl);
    const pdf = buildBoletoDownloadUrl(sgaUrl, numero);
    const disponivel = canIssueBoleto(vencimento);
    const diasAtraso = getBoletoOverdueDays(vencimento);

    if (!numero && !valor && !vencimento && !pdf) return null;

    return {
      id: numero,
      numero,
      placa: '',
      veiculo: numero ? `Boleto nº ${numero}` : '',
      emissao,
      vencimento,
      valor,
      status,
      pdf,
      urlOriginal: sgaUrl,
      codigoBarras: '',
      linhaDigitavel: '',
      disponivel,
      diasAtraso,
      mensagem: disponivel ? '' : UPDATE_MESSAGE,
    };
  }).filter(Boolean);

  return dedupeBoletos(boletos);
}

function base64(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64');
}

function geraNumeroAleatorio(min = 100, max = 999) {
  // Mesmo cálculo usado pelo SGA: Math.floor(Math.random() * (max - min)) + min.
  return Math.floor(Math.random() * (max - min)) + min;
}

function criptografaSgaInt(value, fator = null) {
  const numero = Number(String(value || '').replace(/\D/g, ''));
  if (!Number.isFinite(numero) || numero <= 0) return '';

  const multiplicador = fator || geraNumeroAleatorio(100, 999);
  const produto = numero * multiplicador;
  const digito = produto % 7;
  return base64(`${produto}${multiplicador}${digito}`);
}

function buildAssociadoDadosKeyCandidates(associado) {
  const candidates = [];

  // Se quiser forçar uma key manualmente para teste.
  if (process.env.HINOVA_ASSOCIADO_DADOS_FIXED_KEY) {
    candidates.push(process.env.HINOVA_ASSOCIADO_DADOS_FIXED_KEY);
  }

  if (process.env.HINOVA_ASSOCIADO_DADOS_KEY) {
    candidates.push(process.env.HINOVA_ASSOCIADO_DADOS_KEY);
  }

  if (associado.id) {
    // Key correta do SGA, equivalente a fCriptografa(id, 'INT').
    candidates.push(criptografaSgaInt(associado.id));

    // Algumas tentativas extras com fatores fixos ajudam no debug e evitam azar raro.
    [374, 928, 137, 512, 777].forEach((fator) => {
      candidates.push(criptografaSgaInt(associado.id, fator));
    });

    // Fallbacks antigos apenas para debug/compatibilidade.
    candidates.push(base64(associado.id));
    candidates.push(associado.id);
  }

  return [...new Set(candidates.filter(Boolean))];
}


function sortBoletosByDueDate(boletos = []) {
  return [...boletos].sort((a, b) => {
    const dateA = parseDate(a.vencimento)?.getTime() || Number.MAX_SAFE_INTEGER;
    const dateB = parseDate(b.vencimento)?.getTime() || Number.MAX_SAFE_INTEGER;
    return dateA - dateB;
  });
}

function normalizePlateKey(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function getPlateFromBoleto(boleto = {}) {
  const values = [boleto.placa, boleto.veiculo, boleto.titulo, boleto.title]
    .map((value) => String(value || ''))
    .filter(Boolean);

  for (const value of values) {
    const direct = normalizePlateKey(value);
    if (/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(direct)) return direct;

    const found = String(value).match(/[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}/i)?.[0] || '';
    const normalized = normalizePlateKey(found);
    if (normalized) return normalized;
  }

  return '';
}

function getBoletoVehicleKey(boleto = {}, index = 0) {
  const placaKey = getPlateFromBoleto(boleto);
  if (placaKey) return `placa:${placaKey}`;

  // No retorno Financeiro do SGA, o campo "controle" costuma se repetir nas
  // parcelas do mesmo veículo. Ele é o melhor fallback quando a placa não foi
  // extraída do HTML.
  const controleKey = String(boleto.controle || boleto.idControle || boleto.id_contrato || '')
    .replace(/\D/g, '')
    .trim();
  if (controleKey) return `controle:${controleKey}`;

  const veiculoKey = normalizePlateKey(boleto.veiculo || boleto.tipo || '');
  if (veiculoKey) return `veiculo:${veiculoKey}`;

  // Último fallback: não mistura todos em um grupo único se o SGA vier sem
  // placa/controle. Isso evita esconder boletos de veículos diferentes por erro.
  const idKey = String(boleto.id || boleto.numero || boleto.nossoNumero || index).trim();
  return `sem-identificacao:${idKey || index}`;
}

function getBoletoVehicleLabel(group = {}, boleto = {}) {
  const placa = boleto.placa || group.placa || '';
  if (placa) return placa;
  if (boleto.controle || group.controle) return `Controle ${boleto.controle || group.controle}`;
  return group.key || 'Veículo sem identificação';
}

function getManualCanceledPlates() {
  return String(process.env.HINOVA_PLACAS_CANCELADAS || '')
    .split(/[;,\n]/g)
    .map((plate) => normalizePlateKey(plate))
    .filter((plate) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate));
}

function extractPlateKeysFromText(text = '') {
  const plates = new Set();
  const raw = decodeHtmlEntities(stripTags(String(text || '')));
  const matches = raw.match(/[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}/gi) || [];

  matches.forEach((match) => {
    const plate = normalizePlateKey(match);
    if (/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) plates.add(plate);
  });

  return [...plates];
}

function contextLooksLikeCanceledVehicle(context = '') {
  const normalized = normalizeStatus(stripTags(decodeHtmlEntities(context)));
  if (!normalized) return false;

  const hasVehicleWord = normalized.includes('PLACA') || normalized.includes('VEICULO') || normalized.includes('VEICULO') || normalized.includes('SITUACAO');
  const hasCanceledWord = normalized.includes('CANCELAD') || normalized.includes('EXCLUID') || normalized.includes('INATIV');

  // Evita considerar apenas o nome de arquivo do ícone de boleto cancelado como placa cancelada.
  const onlyBoletoIcon = normalized.includes('BOLETO_CANCELADO') && !hasVehicleWord;

  return hasVehicleWord && hasCanceledWord && !onlyBoletoIcon;
}

function extractCanceledPlatesFromRows(html = '') {
  const canceled = new Set();
  const rows = String(html || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || [];

  rows.forEach((row) => {
    if (!contextLooksLikeCanceledVehicle(row)) return;
    extractPlateKeysFromText(row).forEach((plate) => canceled.add(plate));
  });

  return [...canceled];
}

function extractCanceledVehiclePlatesFromAssociadoDados(responseText = '') {
  const canceled = new Set(getManualCanceledPlates());
  const sources = [
    rebuildStringVeiculoHtml(responseText),
    String(responseText || ''),
  ].filter(Boolean);

  sources.forEach((source) => {
    extractCanceledPlatesFromRows(source).forEach((plate) => canceled.add(plate));

    const text = String(source || '');
    const plateRegex = /[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}/gi;
    for (const match of text.matchAll(plateRegex)) {
      const plate = normalizePlateKey(match[0]);
      if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) continue;

      const start = Math.max(0, match.index - 500);
      const end = Math.min(text.length, match.index + match[0].length + 500);
      const context = text.slice(start, end);

      if (contextLooksLikeCanceledVehicle(context)) {
        canceled.add(plate);
      }
    }
  });

  return [...canceled];
}


function parseCanceledVehiclePlatesFromText(responseText = '') {
  const canceled = new Set();
  const source = String(responseText || '');
  if (!source.trim()) return [];

  const decoded = decodeHtmlEntities(source);
  const htmlChunks = [
    ...(decoded.match(/<tr\b[\s\S]*?<\/tr>/gi) || []),
    ...(decoded.match(/<option\b[\s\S]*?<\/option>/gi) || []),
    ...(decoded.match(/<li\b[\s\S]*?<\/li>/gi) || []),
    ...(decoded.match(/<div\b[\s\S]*?<\/div>/gi) || []),
  ];

  htmlChunks.forEach((chunk) => {
    if (!contextLooksLikeCanceledVehicle(chunk)) return;
    extractPlateKeysFromText(chunk).forEach((plate) => canceled.add(plate));
  });

  const plain = normalizeStatus(stripTags(decoded));
  const plateRegex = /[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}/gi;
  for (const match of decoded.matchAll(plateRegex)) {
    const plate = normalizePlateKey(match[0]);
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) continue;

    const start = Math.max(0, match.index - 700);
    const end = Math.min(decoded.length, match.index + match[0].length + 700);
    const context = decoded.slice(start, end);

    if (contextLooksLikeCanceledVehicle(context)) {
      canceled.add(plate);
    }
  }

  // Fallback para respostas sem HTML estruturado, ex: "ABC1D23 - CANCELADO".
  for (const match of plain.matchAll(/([A-Z]{3}[0-9][A-Z0-9][0-9]{2})[\s\S]{0,120}(CANCELAD|EXCLUID|INATIV)/gi)) {
    const plate = normalizePlateKey(match[1]);
    if (plate) canceled.add(plate);
  }
  for (const match of plain.matchAll(/(CANCELAD|EXCLUID|INATIV)[\s\S]{0,120}([A-Z]{3}[0-9][A-Z0-9][0-9]{2})/gi)) {
    const plate = normalizePlateKey(match[2]);
    if (plate) canceled.add(plate);
  }

  return [...canceled];
}

function getVehicleLookupUrls() {
  const urls = [];
  const configured = String(process.env.HINOVA_VEICULOS_URL || '')
    .split(/[;,\n]/g)
    .map((url) => url.trim())
    .filter(Boolean);

  urls.push(...configured);
  urls.push(DEFAULT_VEICULOS_URL);
  urls.push('https://sga.hinova.com.br/sga/sgav4_novohorizonte/carrega/carregaVeiculoDados.php');
  urls.push('https://sga.hinova.com.br/sga/sgav4_novohorizonte/carrega/carregaDadosAssociadoVeiculoAgregado.php');

  return [...new Set(urls)];
}

async function consultarPlacasCanceladasAssociado(associado) {
  if (isTrue(process.env.HINOVA_DISABLE_VEICULOS_LOOKUP)) {
    return { placasCanceladas: [], attempts: [] };
  }

  const attempts = [];
  const placasCanceladas = new Set();
  const keys = buildAssociadoDadosKeyCandidates(associado).slice(0, 4);
  const urls = getVehicleLookupUrls();

  for (const baseUrl of urls) {
    for (const key of keys) {
      try {
        const url = new URL(baseUrl);
        if (!url.searchParams.has('key')) url.searchParams.set('key', key);

        const html = await fetchSgaText(url.toString(), {
          method: 'GET',
          referer: 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/associado/consultarAssociado.php',
        });

        const found = parseCanceledVehiclePlatesFromText(html);
        found.forEach((plate) => placasCanceladas.add(plate));

        attempts.push({
          url: url.toString(),
          key,
          tamanho: html.length,
          placasCanceladas: found,
          preview: html.slice(0, 600),
        });
      } catch (error) {
        attempts.push({
          url: baseUrl,
          key,
          erro: error.message || 'Falha ao consultar veículos do associado.',
          status: error.status || null,
          details: String(error.details || '').slice(0, 500),
        });
      }
    }
  }

  return { placasCanceladas: [...placasCanceladas], attempts };
}

function buildCanceledPlateNotice(plate) {
  return {
    id: `placa-cancelada-${plate}`,
    numero: '',
    placa: plate,
    veiculo: `Placa ${plate}`,
    valor: '',
    vencimento: '',
    status: 'PLACA CANCELADA',
    pdf: '',
    codigoBarras: '',
    linhaDigitavel: '',
    disponivel: false,
    tipoExibicao: 'placa_cancelada',
    mensagem: CANCELED_PLATE_MESSAGE,
  };
}

function normalizeStatus(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function isCanceledBoleto(boleto = {}) {
  const status = normalizeStatus(boleto.status || boleto.situacao || boleto.situacaoTitulo || '');
  const allText = normalizeStatus([
    boleto.status,
    boleto.situacao,
    boleto.situacaoTitulo,
    boleto.statusPlaca,
    boleto.situacaoPlaca,
    boleto.veiculo,
    boleto.tipo,
    boleto.mensagem,
  ].filter(Boolean).join(' '));

  return status.includes('CANCELADO') ||
    status.includes('EXCLUIDO') ||
    allText.includes('PLACA CANCELADA') ||
    allText.includes('VEICULO CANCELADO') ||
    allText.includes('VEICULO EXCLUIDO');
}

function hasCanceledPlateSignal(group = {}) {
  const text = normalizeStatus(group.boletos.map((boleto) => [
    boleto.statusPlaca,
    boleto.situacaoPlaca,
    boleto.statusVeiculo,
    boleto.situacaoVeiculo,
    boleto.veiculo,
    boleto.mensagem,
  ].filter(Boolean).join(' ')).join(' '));

  if (text.includes('PLACA CANCELADA') || text.includes('VEICULO CANCELADO')) return true;
  if (!group.boletos.length) return false;

  const nonEmptyStatuses = group.boletos
    .map((boleto) => normalizeStatus(boleto.status || boleto.situacao || ''))
    .filter(Boolean);

  // Quando todos os títulos retornados daquela placa vêm como cancelados/excluídos,
  // tratamos a placa como cancelada para não listar vários boletos cancelados.
  return nonEmptyStatuses.length > 0 && group.boletos.every(isCanceledBoleto);
}

function isOpenOrIssueableBoleto(boleto = {}) {
  if (isCanceledBoleto(boleto)) return false;

  const status = normalizeStatus(boleto.status || boleto.situacao || '');
  if (status.includes('BAIXADO')) return false;
  if (status.includes('PAGO')) return false;

  return true;
}

function buildPlateNoticeBoleto(group, type, baseBoleto = {}) {
  const placaLabel = getBoletoVehicleLabel(group, baseBoleto);
  const placa = group.placa || baseBoleto.placa || (String(placaLabel).startsWith('Controle ') ? '' : placaLabel);

  if (type === 'cancelada') {
    return {
      id: `placa-cancelada-${group.key}`,
      numero: '',
      placa,
      veiculo: placa ? `Placa ${placa}` : placaLabel,
      valor: '',
      vencimento: '',
      status: 'PLACA CANCELADA',
      pdf: '',
      codigoBarras: '',
      linhaDigitavel: '',
      disponivel: false,
      tipoExibicao: 'placa_cancelada',
      mensagem: CANCELED_PLATE_MESSAGE,
    };
  }

  return null;
}

function applyOverdueDisplayRule(boletos = [], canceledVehiclePlates = []) {
  const groups = new Map();
  const limiteDias = getBoletoMaxDaysAfterDue();
  const canceledPlateKeys = new Set([
    ...getManualCanceledPlates(),
    ...canceledVehiclePlates.map((plate) => normalizePlateKey(plate)),
  ].filter((plate) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)));


  boletos.forEach((boleto, index) => {
    if (!boleto) return;

    const key = getBoletoVehicleKey(boleto, index);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        placa: boleto.placa || '',
        controle: boleto.controle || '',
        boletos: [],
      });
    }

    const group = groups.get(key);
    if (!group.placa && boleto.placa) group.placa = boleto.placa;
    if (!group.controle && boleto.controle) group.controle = boleto.controle;
    group.boletos.push(boleto);
  });

  const filteredBoletos = [];
  const gruposBloqueados = [];
  const gruposAnalisados = [];
  const placasCanceladas = [];
  const placasInativas = [];

  canceledPlateKeys.forEach((plate) => {
    const key = `placa:${plate}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        placa: plate,
        controle: '',
        boletos: [],
        placaCanceladaDetectada: true,
      });
    } else {
      groups.get(key).placaCanceladaDetectada = true;
    }
  });

  groups.forEach((group) => {
    const boletosOrdenados = sortBoletosByDueDate(group.boletos);
    const firstBoleto = boletosOrdenados[0] || group.boletos[0] || {};
    const placaLabel = getBoletoVehicleLabel(group, firstBoleto);

    const normalizedGroupPlate = normalizePlateKey(group.placa || firstBoleto.placa || '');
    if (group.placaCanceladaDetectada || (normalizedGroupPlate && canceledPlateKeys.has(normalizedGroupPlate)) || hasCanceledPlateSignal(group)) {
      const notice = buildPlateNoticeBoleto(group, 'cancelada', firstBoleto);
      filteredBoletos.push(notice);
      placasCanceladas.push(placaLabel);

      gruposAnalisados.push({
        key: group.key,
        placa: placaLabel,
        controle: group.controle || '',
        totalBoletosDoVeiculo: group.boletos.length,
        totalBoletosExibidos: 1,
        regraAplicada: 'placa-cancelada',
      });
      return;
    }

    const boletosValidosParaAnalise = boletosOrdenados.filter(isOpenOrIssueableBoleto);
    const boletosVencidosAcimaDoPrazo = boletosValidosParaAnalise.filter((boleto) => {
      return getBoletoOverdueDays(boleto?.vencimento) > limiteDias;
    });

    if (boletosVencidosAcimaDoPrazo.length >= 2) {
      const selected = {
        ...boletosVencidosAcimaDoPrazo[0],
        disponivel: false,
        status: 'PLACA INATIVA',
        tipoExibicao: 'placa_inativa',
        mensagem: INACTIVE_PLATE_MESSAGE,
      };

      filteredBoletos.push(selected);
      placasInativas.push(placaLabel);

      const blockedInfo = {
        key: group.key,
        placa: placaLabel,
        controle: group.controle || selected.controle || '',
        totalBoletosDoVeiculo: group.boletos.length,
        totalBoletosVencidosAcimaDoPrazo: boletosVencidosAcimaDoPrazo.length,
        boletoVencidoMaisAntigo: selected,
      };

      gruposBloqueados.push(blockedInfo);
      gruposAnalisados.push({ ...blockedInfo, totalBoletosExibidos: 1, regraAplicada: 'placa-inativa-por-atraso' });
      return;
    }

    if (boletosVencidosAcimaDoPrazo.length === 1) {
      const selected = {
        ...boletosVencidosAcimaDoPrazo[0],
        disponivel: false,
        tipoExibicao: 'boleto_vencido',
        mensagem: UPDATE_MESSAGE,
      };

      filteredBoletos.push(selected);

      const blockedInfo = {
        key: group.key,
        placa: placaLabel,
        controle: group.controle || selected.controle || '',
        totalBoletosDoVeiculo: group.boletos.length,
        totalBoletosVencidosAcimaDoPrazo: 1,
        boletoVencidoMaisAntigo: selected,
      };

      gruposBloqueados.push(blockedInfo);
      gruposAnalisados.push({ ...blockedInfo, totalBoletosExibidos: 1, regraAplicada: 'um-boleto-vencido' });
      return;
    }

    // Placa sem atraso acima do prazo: mostra somente boletos realmente disponíveis
    // para baixar pelo site, sem exibir títulos cancelados, baixados ou pagos.
    const boletosDisponiveis = boletosValidosParaAnalise.filter((boleto) => boleto.disponivel !== false);
    filteredBoletos.push(...boletosDisponiveis);

    gruposAnalisados.push({
      key: group.key,
      placa: placaLabel,
      controle: group.controle || '',
      totalBoletosDoVeiculo: group.boletos.length,
      totalBoletosExibidos: boletosDisponiveis.length,
      regraAplicada: 'placa-em-dia-boletos-disponiveis',
    });
  });

  return {
    boletos: filteredBoletos,
    bloqueadoPorBoletoVencido: gruposBloqueados.length > 0,
    possuiPlacaCancelada: placasCanceladas.length > 0,
    possuiPlacaInativa: placasInativas.length > 0,
    boletoVencidoSelecionado: gruposBloqueados[0]?.boletoVencidoMaisAntigo || null,
    gruposBloqueados,
    gruposAnalisados,
    placasBloqueadas: gruposBloqueados.map((group) => group.placa).filter(Boolean),
    placasCanceladas,
    placasInativas,
    totalGrupos: groups.size,
  };
}

async function consultarAssociadoDados(associado) {
  const associadoDadosBaseUrl = getEnv('HINOVA_ASSOCIADO_DADOS_URL', DEFAULT_ASSOCIADO_DADOS_URL);
  const keyField = getEnv('HINOVA_ASSOCIADO_DADOS_KEY_FIELD', 'key');
  const candidates = buildAssociadoDadosKeyCandidates(associado);
  const attempts = [];

  for (const key of candidates) {
    const url = new URL(associadoDadosBaseUrl);
    url.searchParams.set(keyField, key);

    const html = await fetchSgaText(url.toString(), {
      method: 'GET',
      referer: 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/associado/consultarAssociado.php',
    });

    const boletos = parseBoletosFinanceiroFromAssociadoDados(html, associadoDadosBaseUrl);
    const placasCanceladasDetectadas = extractCanceledVehiclePlatesFromAssociadoDados(html);
    const associadoAtualizado = updateAssociadoFromDados(associado, html);

    attempts.push({
      key,
      tamanho: html.length,
      boletos: boletos.length,
      placasCanceladasDetectadas,
      preview: html.slice(0, 1200),
    });

    if (boletos.length || placasCanceladasDetectadas.length) {
      return { associado: associadoAtualizado, boletos, placasCanceladasDetectadas, raw: html, key, attempts };
    }
  }

  return { associado, boletos: [], placasCanceladasDetectadas: [], raw: '', key: candidates[0] || '', attempts };
}

async function localizarAssociado(documento) {
  const associadoSearchUrl = getEnv('HINOVA_ASSOCIADO_SEARCH_URL', DEFAULT_ASSOCIADO_URL);
  const associadoSearchField = getEnv('HINOVA_ASSOCIADO_SEARCH_FIELD', 'input');
  const url = new URL(associadoSearchUrl);
  url.searchParams.set(associadoSearchField, documento);

  let xml = await fetchSgaText(url.toString(), { method: 'GET' });

  let associado = parseAssociadoXml(xml, documento);

  // Em algumas sessões expiradas o SGA não retorna tela de login; ele apenas
  // devolve <results></results>. Nesse caso tentamos renovar a sessão e consultar novamente.
  if (!associado && isAutoLoginEnabled()) {
    await loginSga(true);
    xml = await fetchSgaText(url.toString(), { method: 'GET', retryOnAuth: false });
    associado = parseAssociadoXml(xml, documento);
  }

  if (!associado) {
    const error = new Error('Associado não localizado para o CPF/CNPJ informado.');
    error.status = 404;
    error.details = xml.slice(0, 1200);
    throw error;
  }

  return { associado, raw: xml };
}

async function consultarBoletosListaAjax(associado) {
  const boletosListUrl = getEnv('HINOVA_BOLETOS_LIST_URL', DEFAULT_BOLETOS_URL);
  const payload = new URLSearchParams();

  payload.append('filtro[boletosemitidos][id_associado]', associado.id || '');
  payload.append('filtro[boletosemitidos][id_cliente]', '');
  payload.append('filtro[discriminacaovalor][id_veiculo]', '');
  payload.append('data[parametros]', 'veiculo');
  payload.append('filtro[boletosemitidos][modulo_contratado]', 'veiculo');
  payload.append('data[associado][nome]', associado.nome || '');
  payload.append('data[cliente][nome]', '');
  payload.append('filtro[boletosemitidos][nosso_numero]', '');
  payload.append('filtro[boletosemitidos][data_emissao]', '');
  payload.append('filtro[boletosemitidos][data_vencimento]', '');
  payload.append('filtro[boletosemitidos][$valor]', '');
  payload.append('filtro[logemissaoboleto][codigo_barras%]', '');
  payload.append('filtro[logemissaoboleto][codigo_barras_barras%]', '');

  const situacoes = String(process.env.HINOVA_BOLETO_SITUACOES || '1,2,3,4,999')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  situacoes.forEach((situacao) => payload.append('filtro[boletosemitidos][id_situacao][]', situacao));

  const html = await fetchSgaText(boletosListUrl, {
    method: 'POST',
    form: true,
    referer: 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/financeiro/listaBoleto.php',
    body: payload.toString(),
  });

  return {
    boletos: parseBoletosListaHtml(html, boletosListUrl),
    raw: html,
    payload: payload.toString(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  try {
    const { documento } = req.body || {};
    const cleanDocument = onlyDigits(documento);

    if (cleanDocument.length !== 11 && cleanDocument.length !== 14) {
      return res.status(400).json({ message: 'Informe um CPF ou CNPJ válido.' });
    }

    const { associado, raw: associadoRaw } = await localizarAssociado(cleanDocument);

    let dadosResult = { associado, boletos: [], placasCanceladasDetectadas: [], raw: '', key: '', attempts: [] };
    let veiculosResult = { placasCanceladas: [], attempts: [] };
    if (!isTrue(process.env.HINOVA_DISABLE_ASSOCIADO_DADOS)) {
      dadosResult = await consultarAssociadoDados(associado);
    }

    veiculosResult = await consultarPlacasCanceladasAssociado(dadosResult.associado || associado);
    const placasCanceladasDetectadas = [...new Set([
      ...(dadosResult.placasCanceladasDetectadas || []),
      ...(veiculosResult.placasCanceladas || []),
    ].map((plate) => normalizePlateKey(plate)).filter(Boolean))];
    dadosResult.placasCanceladasDetectadas = placasCanceladasDetectadas;

    let boletos = dadosResult.boletos || [];
    let listaResult = { boletos: [], raw: '', payload: '' };

    if (!boletos.length) {
      listaResult = await consultarBoletosListaAjax(dadosResult.associado || associado);
      boletos = listaResult.boletos;
    }

    const associadoFinal = dadosResult.associado || associado;
    const totalBoletosAntesDaRegra = boletos.length;
    const regraExibicao = applyOverdueDisplayRule(boletos, dadosResult.placasCanceladasDetectadas || []);
    boletos = regraExibicao.boletos;

    return res.status(200).json({
      message: boletos.length
        ? 'Consulta realizada com sucesso.'
        : 'Associado localizado, mas nenhum boleto disponível foi encontrado para este CPF/CNPJ.',
      associado: {
        id: associadoFinal.id,
        nome: associadoFinal.nome,
        documento: associadoFinal.documento || cleanDocument,
        status: associadoFinal.status || '',
      },
      boletos,
      regraExibicao: {
        bloqueadoPorBoletoVencido: regraExibicao.bloqueadoPorBoletoVencido,
        totalBoletosAntesDaRegra,
        totalBoletosExibidos: boletos.length,
        limiteDiasVencido: getBoletoMaxDaysAfterDue(),
        gruposBloqueados: regraExibicao.gruposBloqueados || [],
        placasBloqueadas: regraExibicao.placasBloqueadas || [],
        placasCanceladas: regraExibicao.placasCanceladas || [],
        placasInativas: regraExibicao.placasInativas || [],
        possuiPlacaCancelada: regraExibicao.possuiPlacaCancelada || false,
        possuiPlacaInativa: regraExibicao.possuiPlacaInativa || false,
        totalGrupos: regraExibicao.totalGrupos || 0,
        gruposAnalisados: regraExibicao.gruposAnalisados || [],
      },
      ...(isTrue(process.env.HINOVA_DEBUG_RESPONSE) ? {
        debug: {
          modo: boletos.length && dadosResult.boletos?.length ? 'carregaAssociadoDados' : 'fallback-listaBoletoAJAX',
          associadoRetorno: associadoRaw.slice(0, 1200),
          associadoDadosKeyUsada: dadosResult.key,
          associadoDadosTentativas: dadosResult.attempts,
          associadoDadosRetornoTamanho: dadosResult.raw?.length || 0,
          associadoDadosRetornoPreview: dadosResult.raw?.slice(0, 2400) || '',
          placasCanceladasDetectadas: dadosResult.placasCanceladasDetectadas || [],
          veiculosLookupTentativas: veiculosResult.attempts || [],
          listaAjaxBoletosEncontrados: listaResult.boletos.length,
          listaAjaxPayload: listaResult.payload,
          listaAjaxRetornoTamanho: listaResult.raw.length,
          listaAjaxRetornoPreview: listaResult.raw.slice(0, 1200),
          boletosEncontrados: boletos.length,
          totalBoletosAntesDaRegra,
          regraExibicao,
        },
      } : {}),
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || DEFAULT_ERROR_MESSAGE,
      ...(isTrue(process.env.HINOVA_DEBUG_RESPONSE) ? { details: error.details || String(error.stack || error) } : {}),
    });
  }
}
