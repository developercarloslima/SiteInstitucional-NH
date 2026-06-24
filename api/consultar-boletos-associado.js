const DEFAULT_ASSOCIADO_URL = 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/carrega/carregaAssociados.php';
const DEFAULT_ASSOCIADO_DADOS_URL = 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/carrega/carregaAssociadoDados.php';
const DEFAULT_BOLETOS_URL = 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/carrega/carregaListaBoletoAJAX.php';
const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir a consulta no SGA/Hinova.';
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

function getEnv(name, fallback = '') {
  return process.env[name] || fallback;
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

  if (process.env.HINOVA_COOKIE) headers.Cookie = process.env.HINOVA_COOKIE;

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

function rebuildStringBoletoHtml(responseText = '') {
  const fragments = [];
  const singleQuoteRegex = /stringBoleto\s*\+=\s*'((?:\\'|[^'])*)';/gi;
  const doubleQuoteRegex = /stringBoleto\s*\+=\s*"((?:\\"|[^"])*)";/gi;

  for (const match of String(responseText).matchAll(singleQuoteRegex)) {
    fragments.push(jsStringUnescape(match[1] || ''));
  }

  for (const match of String(responseText).matchAll(doubleQuoteRegex)) {
    fragments.push(jsStringUnescape(match[1] || ''));
  }

  return fragments.join('');
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

async function consultarAssociadoDados(associado) {
  const associadoDadosBaseUrl = getEnv('HINOVA_ASSOCIADO_DADOS_URL', DEFAULT_ASSOCIADO_DADOS_URL);
  const keyField = getEnv('HINOVA_ASSOCIADO_DADOS_KEY_FIELD', 'key');
  const candidates = buildAssociadoDadosKeyCandidates(associado);
  const attempts = [];

  for (const key of candidates) {
    const url = new URL(associadoDadosBaseUrl);
    url.searchParams.set(keyField, key);

    const html = await fetchText(url.toString(), {
      method: 'GET',
      headers: buildHeaders({ referer: 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/associado/consultarAssociado.php' }),
    });

    const boletos = parseBoletosFinanceiroFromAssociadoDados(html, associadoDadosBaseUrl);
    const associadoAtualizado = updateAssociadoFromDados(associado, html);

    attempts.push({ key, tamanho: html.length, boletos: boletos.length, preview: html.slice(0, 1200) });

    if (boletos.length) {
      return { associado: associadoAtualizado, boletos, raw: html, key, attempts };
    }
  }

  return { associado, boletos: [], raw: '', key: candidates[0] || '', attempts };
}

async function localizarAssociado(documento) {
  const associadoSearchUrl = getEnv('HINOVA_ASSOCIADO_SEARCH_URL', DEFAULT_ASSOCIADO_URL);
  const associadoSearchField = getEnv('HINOVA_ASSOCIADO_SEARCH_FIELD', 'input');
  const url = new URL(associadoSearchUrl);
  url.searchParams.set(associadoSearchField, documento);

  const xml = await fetchText(url.toString(), {
    method: 'GET',
    headers: buildHeaders(),
  });

  const associado = parseAssociadoXml(xml, documento);
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

  const html = await fetchText(boletosListUrl, {
    method: 'POST',
    headers: buildHeaders({ form: true, referer: 'https://sga.hinova.com.br/sga/sgav4_novohorizonte/financeiro/listaBoleto.php' }),
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

    let dadosResult = { associado, boletos: [], raw: '', key: '', attempts: [] };
    if (!isTrue(process.env.HINOVA_DISABLE_ASSOCIADO_DADOS)) {
      dadosResult = await consultarAssociadoDados(associado);
    }

    let boletos = dadosResult.boletos || [];
    let listaResult = { boletos: [], raw: '', payload: '' };

    if (!boletos.length) {
      listaResult = await consultarBoletosListaAjax(dadosResult.associado || associado);
      boletos = listaResult.boletos;
    }

    const associadoFinal = dadosResult.associado || associado;

    return res.status(200).json({
      message: boletos.length
        ? 'Boletos encontrados.'
        : 'Associado localizado, mas nenhum boleto disponível foi encontrado para este CPF/CNPJ.',
      associado: {
        id: associadoFinal.id,
        nome: associadoFinal.nome,
        documento: associadoFinal.documento || cleanDocument,
        status: associadoFinal.status || '',
      },
      boletos,
      ...(isTrue(process.env.HINOVA_DEBUG_RESPONSE) ? {
        debug: {
          modo: boletos.length && dadosResult.boletos?.length ? 'carregaAssociadoDados' : 'fallback-listaBoletoAJAX',
          associadoRetorno: associadoRaw.slice(0, 1200),
          associadoDadosKeyUsada: dadosResult.key,
          associadoDadosTentativas: dadosResult.attempts,
          associadoDadosRetornoTamanho: dadosResult.raw?.length || 0,
          associadoDadosRetornoPreview: dadosResult.raw?.slice(0, 2400) || '',
          listaAjaxBoletosEncontrados: listaResult.boletos.length,
          listaAjaxPayload: listaResult.payload,
          listaAjaxRetornoTamanho: listaResult.raw.length,
          listaAjaxRetornoPreview: listaResult.raw.slice(0, 1200),
          boletosEncontrados: boletos.length,
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
