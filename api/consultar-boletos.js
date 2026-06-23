
const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir a consulta na API da Hinova.';

function getCleanInput(value) {
  return String(value || '').trim();
}

function onlyDigits(value) {
  return getCleanInput(value).replace(/\D/g, '');
}

function isTrue(value) {
  return String(value || '').toLowerCase() === 'true';
}

function joinUrl(base, endpoint) {
  const cleanEndpoint = getCleanInput(endpoint);
  if (!cleanEndpoint) return getCleanInput(base);
  if (/^https?:\/\//i.test(cleanEndpoint)) return cleanEndpoint;
  return `${getCleanInput(base).replace(/\/+$/, '')}/${cleanEndpoint.replace(/^\/+/, '')}`;
}

function getHinovaHeaders() {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const token = process.env.HINOVA_TOKEN;
  const usuario = process.env.HINOVA_USUARIO;
  const senha = process.env.HINOVA_SENHA;
  const authType = String(process.env.HINOVA_AUTH_TYPE || 'bearer').toLowerCase();

  if (authType === 'basic' && usuario && senha) {
    const basicToken = Buffer.from(`${usuario}:${senha}`).toString('base64');
    headers.Authorization = `Basic ${basicToken}`;
  } else if (token) {
    const authHeaderName = process.env.HINOVA_AUTH_HEADER || 'Authorization';
    const authPrefix = process.env.HINOVA_AUTH_PREFIX ?? 'Bearer';
    headers[authHeaderName] = String(authPrefix).toLowerCase() === 'none'
      ? token
      : `${authPrefix} ${token}`;
  }

  if (process.env.HINOVA_USER_HEADER && usuario) {
    headers[process.env.HINOVA_USER_HEADER] = usuario;
  }

  if (process.env.HINOVA_PASSWORD_HEADER && senha) {
    headers[process.env.HINOVA_PASSWORD_HEADER] = senha;
  }

  return headers;
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function buildGetUrl(apiUrl, params) {
  const url = new URL(apiUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });

  return url.toString();
}

function withCredentialsInBody(payload) {
  if (!isTrue(process.env.HINOVA_SEND_CREDENTIALS_IN_BODY)) return payload;

  const userField = process.env.HINOVA_USER_FIELD || 'usuario';
  const passwordField = process.env.HINOVA_PASSWORD_FIELD || 'senha';

  return {
    ...payload,
    [userField]: process.env.HINOVA_USUARIO || '',
    [passwordField]: process.env.HINOVA_SENHA || '',
  };
}

async function requestHinova({ url, method = 'GET', payload = {} }) {
  const normalizedMethod = method.toUpperCase();
  const requestUrl = normalizedMethod === 'GET' ? buildGetUrl(url, payload) : url;

  const response = await fetch(requestUrl, {
    method: normalizedMethod,
    headers: getHinovaHeaders(),
    ...(normalizedMethod === 'GET' ? {} : { body: JSON.stringify(withCredentialsInBody(payload)) }),
  });

  const data = await readResponse(response);

  if (!response.ok) {
    const message = data.message || data.mensagem || data.erro || DEFAULT_ERROR_MESSAGE;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

function findArray(payload, preferredKeys = []) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  for (const key of preferredKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  for (const value of Object.values(payload)) {
    const found = findArray(value, preferredKeys);
    if (found.length) return found;
  }

  return [];
}

function findObject(payload, preferredKeys = []) {
  if (!payload || typeof payload !== 'object') return null;
  if (Array.isArray(payload)) return payload[0] || null;

  for (const key of preferredKeys) {
    if (payload[key] && typeof payload[key] === 'object') {
      return Array.isArray(payload[key]) ? payload[key][0] : payload[key];
    }
  }

  return payload;
}

function findFirstValue(payload, fields = []) {
  if (!payload || typeof payload !== 'object') return '';

  for (const field of fields) {
    if (payload[field] !== undefined && payload[field] !== null && payload[field] !== '') {
      return payload[field];
    }
  }

  return '';
}

function parseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('/').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  const date = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function businessDaysAfterDueDate(dueDate, currentDate = new Date()) {
  const due = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 12);
  const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 12);

  if (today <= due) return 0;

  let count = 0;
  const cursor = new Date(due);
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= today) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function boletoCanBeIssued(boleto) {
  const explicitValue = findFirstValue(boleto, ['pode_emitir', 'emitivel', 'disponivel', 'podeEmitir']);
  if (String(explicitValue).toLowerCase() === 'false') return false;
  if (String(explicitValue).toLowerCase() === 'true') return true;

  const status = String(findFirstValue(boleto, ['status', 'situacao', 'situacao_boleto'])).toLowerCase();
  if (status.includes('baixado') || status.includes('cancelado') || status.includes('indispon')) return false;

  const dueDate = parseDate(findFirstValue(boleto, ['data_vencimento', 'vencimento', 'dt_vencimento', 'dataVencimento']));
  if (!dueDate) return true;

  return businessDaysAfterDueDate(dueDate) <= 5;
}

function normalizeBoleto(boleto) {
  const canIssue = boletoCanBeIssued(boleto);
  return {
    ...boleto,
    pdf: findFirstValue(boleto, ['pdf', 'url_pdf', 'url_boleto', 'link', 'url', 'boleto', 'segunda_via']),
    codigo_barras: findFirstValue(boleto, ['codigo_barras', 'linha_digitavel', 'linhaDigitavel', 'codigo', 'barcode']),
    data_vencimento: findFirstValue(boleto, ['data_vencimento', 'vencimento', 'dt_vencimento', 'dataVencimento']),
    valor: findFirstValue(boleto, ['valor', 'valor_boleto', 'valor_total', 'total']),
    pode_emitir: canIssue,
    mensagem: canIssue
      ? ''
      : 'Este boleto não está disponível para emissão pelo site, pois passou do prazo permitido para retirada da segunda via. Entre em contato com o setor financeiro da Novo Horizonte para atualizar seu boleto.',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  const baseUrl = process.env.HINOVA_BASE_URL || process.env.HINOVA_API_URL;
  const endpoint = process.env.HINOVA_BOLETOS_ENDPOINT || process.env.HINOVA_BOLETOS_URL;
  const apiUrl = joinUrl(baseUrl, endpoint);

  if (!apiUrl) {
    return res.status(500).json({ message: 'Configure HINOVA_BOLETOS_URL ou HINOVA_BASE_URL + HINOVA_BOLETOS_ENDPOINT.' });
  }

  try {
    const documento = onlyDigits(req.query?.documento);
    const associadoId = getCleanInput(req.query?.associadoId);
    const veiculoId = getCleanInput(req.query?.veiculoId);
    const placa = getCleanInput(req.query?.placa).toUpperCase();

    if (!veiculoId && !placa) {
      return res.status(400).json({ message: 'Informe o ID do veículo ou a placa.' });
    }

    const payload = {};
    const documentField = process.env.HINOVA_DOCUMENT_FIELD || 'documento';
    const associadoField = process.env.HINOVA_ASSOCIADO_ID_FIELD || 'associadoId';
    const vehicleField = process.env.HINOVA_VEHICLE_ID_FIELD || 'veiculoId';
    const plateField = process.env.HINOVA_PLATE_FIELD || 'placa';

    if (documento) payload[documentField] = documento;
    if (associadoId) payload[associadoField] = associadoId;
    if (veiculoId) payload[vehicleField] = veiculoId;
    if (placa) payload[plateField] = placa;

    const data = await requestHinova({
      url: apiUrl,
      method: process.env.HINOVA_BOLETOS_METHOD || 'GET',
      payload,
    });

    const rawBoletos = findArray(data, ['boletos', 'boleto', 'financeiro', 'parcelas', 'data', 'dados']);
    const boletos = rawBoletos.map((boleto) => normalizeBoleto(boleto));

    return res.status(200).json({ boletos, data });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || 'Erro ao consultar boletos na API da Hinova.',
      details: error.details,
    });
  }
}
