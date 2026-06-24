const DEFAULT_ERROR_MESSAGE = 'Não foi possível baixar o boleto no SGA/Hinova.';

function isTrue(value) {
  return String(value || '').toLowerCase() === 'true';
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

  if (process.env.HINOVA_COOKIE) {
    headers.Cookie = process.env.HINOVA_COOKIE;
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

  if (!process.env.HINOVA_COOKIE) {
    return res.status(500).json({
      message: 'Falta configurar HINOVA_COOKIE para baixar o boleto com a sessão do SGA.',
    });
  }

  try {
    const response = await fetch(boletoUrl, {
      method: 'GET',
      headers: buildHeaders(),
      redirect: 'follow',
    });

    const contentType = response.headers.get('content-type') || '';
    const buffer = Buffer.from(await response.arrayBuffer());

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

    if (textPreview && looksLikeAuthError(textPreview)) {
      return res.status(401).json({
        message: 'O SGA recusou a emissão do boleto. Atualize o HINOVA_COOKIE com uma sessão logada válida.',
        ...(isTrue(process.env.HINOVA_DEBUG_RESPONSE) ? { details: textPreview } : {}),
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
