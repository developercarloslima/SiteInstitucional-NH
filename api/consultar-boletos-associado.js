const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir a consulta na API da Hinova.';
const UPDATE_MESSAGE = 'Este boleto não está disponível para emissão pelo site, pois passou do prazo permitido para retirada da segunda via. Entre em contato com o setor financeiro da Novo Horizonte para atualizar seu boleto.';

function getCleanInput(value) {
  return String(value || '').trim();
}

function onlyDigits(value) {
  return getCleanInput(value).replace(/\D/g, '');
}

function isTrue(value) {
  return String(value || '').toLowerCase() === 'true';
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
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
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

async function requestHinova({ url, method = 'POST', payload = {} }) {
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

  while (cursor < today) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
  }

  return count;
}

function canIssueBoleto(dueDateValue) {
  const dueDate = parseDate(dueDateValue);
  if (!dueDate) return true;

  const limit = Number(process.env.BOLETO_MAX_BUSINESS_DAYS_AFTER_DUE || 5);
  return businessDaysAfterDueDate(dueDate) <= limit;
}

function findUrl(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return /^https?:\/\//i.test(trimmed) ? trimmed : '';
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrl(item);
      if (found) return found;
    }
    return '';
  }

  if (typeof value === 'object') {
    const preferred = [
      'pdf', 'url_pdf', 'link_pdf', 'boleto_pdf', 'arquivo_pdf',
      'url_boleto', 'link_boleto', 'segunda_via', 'url', 'link', 'arquivo'
    ];

    for (const key of preferred) {
      const found = findUrl(value[key]);
      if (found) return found;
    }
  }

  return '';
}

function looksLikeBoleto(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;

  const boletoFields = [
    'id_boleto', 'boleto_id', 'boleto', 'nosso_numero', 'linha_digitavel',
    'codigo_barras', 'cod_barras', 'codigoBarras', 'vencimento', 'data_vencimento',
    'dt_vencimento', 'valor_boleto', 'valor_titulo', 'url_boleto', 'link_boleto',
    'pdf', 'url_pdf', 'link_pdf'
  ];

  return boletoFields.some((field) => payload[field] !== undefined && payload[field] !== null && payload[field] !== '');
}

function getVehicleContext(payload, context = {}) {
  if (!payload || typeof payload !== 'object') return context;

  return {
    ...context,
    placa: findFirstValue(payload, ['placa', 'placa_veiculo', 'veiculo_placa']) || context.placa || '',
    veiculo: findFirstValue(payload, ['veiculo', 'modelo', 'modelo_veiculo', 'descricao_veiculo', 'nome_veiculo']) || context.veiculo || '',
  };
}

function collectBoletos(payload, context = {}, result = []) {
  if (!payload) return result;

  if (Array.isArray(payload)) {
    payload.forEach((item) => collectBoletos(item, context, result));
    return result;
  }

  if (typeof payload !== 'object') return result;

  const nextContext = getVehicleContext(payload, context);

  if (looksLikeBoleto(payload)) {
    result.push({ raw: payload, context: nextContext });
  }

  Object.values(payload).forEach((value) => {
    if (value && typeof value === 'object') {
      collectBoletos(value, nextContext, result);
    }
  });

  return result;
}

function normalizeBoleto(item) {
  const raw = item.raw || {};
  const context = item.context || {};

  const vencimento = findFirstValue(raw, [
    'vencimento', 'data_vencimento', 'dt_vencimento', 'dataVencimento', 'vencimento_boleto'
  ]);

  const disponivel = canIssueBoleto(vencimento);

  return {
    id: findFirstValue(raw, ['id_boleto', 'boleto_id', 'id', 'nosso_numero', 'numero_boleto']),
    placa: findFirstValue(raw, ['placa', 'placa_veiculo', 'veiculo_placa']) || context.placa || '',
    veiculo: findFirstValue(raw, ['veiculo', 'modelo', 'modelo_veiculo', 'descricao_veiculo', 'nome_veiculo']) || context.veiculo || '',
    valor: findFirstValue(raw, ['valor', 'valor_boleto', 'valor_titulo', 'valor_total', 'total']),
    vencimento,
    status: findFirstValue(raw, ['status', 'situacao', 'situacao_boleto']),
    pdf: findUrl(raw),
    codigoBarras: findFirstValue(raw, ['codigo_barras', 'cod_barras', 'codigoBarras', 'codigo_de_barras']),
    linhaDigitavel: findFirstValue(raw, ['linha_digitavel', 'linhaDigitavel', 'digitavel']),
    disponivel,
    mensagem: disponivel ? '' : UPDATE_MESSAGE,
  };
}

function dedupeBoletos(boletos) {
  const seen = new Set();

  return boletos.filter((boleto) => {
    const key = [
      boleto.id,
      boleto.placa,
      boleto.valor,
      boleto.vencimento,
      boleto.pdf,
      boleto.codigoBarras,
      boleto.linhaDigitavel,
    ].join('|');

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeAssociado(data, documento) {
  const source = data?.associado || data?.associados?.[0] || data?.cliente || data?.data || data || {};

  return {
    documento,
    nome: findFirstValue(source, ['nome', 'nome_associado', 'associado', 'razao_social', 'nome_cliente']) || 'Associado localizado',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      message: 'Método não permitido.',
    });
  }

  const apiUrl = process.env.HINOVA_API_URL || process.env.HINOVA_ASSOCIADO_URL;

  if (!apiUrl || apiUrl.includes('url-')) {
    return res.status(500).json({
      message: 'Falta configurar a URL da API da Hinova na variável HINOVA_API_URL.',
    });
  }

  if (!process.env.HINOVA_TOKEN && !process.env.HINOVA_USUARIO) {
    return res.status(500).json({
      message: 'Falta configurar o token da Hinova na variável HINOVA_TOKEN.',
    });
  }

  try {
    const { documento } = req.body || {};
    const cleanDocument = onlyDigits(documento);

    if (cleanDocument.length !== 11 && cleanDocument.length !== 14) {
      return res.status(400).json({
        message: 'Informe um CPF ou CNPJ válido.',
      });
    }

    const documentField = process.env.HINOVA_DOCUMENT_FIELD || 'cpf';
    const method = String(process.env.HINOVA_API_METHOD || 'POST').toUpperCase();

    const data = await requestHinova({
      url: apiUrl,
      method,
      payload: {
        [documentField]: cleanDocument,
      },
    });

    const boletos = dedupeBoletos(
      collectBoletos(data)
        .map(normalizeBoleto)
        .filter((boleto) => boleto.id || boleto.placa || boleto.valor || boleto.vencimento || boleto.pdf || boleto.codigoBarras || boleto.linhaDigitavel)
    );

    return res.status(200).json({
      message: boletos.length
        ? 'Boletos encontrados.'
        : 'Consulta realizada, mas nenhum boleto disponível foi encontrado para este CPF/CNPJ.',
      associado: normalizeAssociado(data, cleanDocument),
      boletos,
      ...(isTrue(process.env.HINOVA_DEBUG_RESPONSE) ? { debug: data } : {}),
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || DEFAULT_ERROR_MESSAGE,
      ...(isTrue(process.env.HINOVA_DEBUG_RESPONSE) ? { details: error.details } : {}),
    });
  }
}
