const menuToggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('.main-menu');

if (menuToggle && menu) {
  menuToggle.addEventListener('click', () => {
    const opened = menu.classList.toggle('open');
    menuToggle.classList.toggle('active', opened);
    menuToggle.setAttribute('aria-expanded', String(opened));
    document.body.classList.toggle('menu-open', opened);
  });

  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menu.classList.remove('open');
      menuToggle.classList.remove('active');
      menuToggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    });
  });
}

const navLinks = document.querySelectorAll('.main-menu a');
const localNavLinks = [...navLinks].filter((link) => {
  const href = link.getAttribute('href') || '';
  return href.startsWith('#') && href.length > 1;
});

const sections = localNavLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

function setActiveLink() {
  if (!sections.length) return;

  const current = sections.findLast((section) => section.offsetTop - 130 <= window.scrollY);
  if (!current) return;

  navLinks.forEach((link) => {
    const href = link.getAttribute('href') || '';
    link.classList.toggle('active', href === `#${current.id}`);
  });
}

window.addEventListener('scroll', setActiveLink, { passive: true });
setActiveLink();

const revealElements = document.querySelectorAll(
  '.section-heading, .benefit-card, .proof-strip, .step-card, .app-card, .contact-panel, .contact-form, .boleto-box, .boleto-page-card, .office-card, .footer-grid article'
);

revealElements.forEach((element) => element.classList.add('reveal'));

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  },
  { threshold: 0.12 }
);

revealElements.forEach((element) => observer.observe(element));

const cotacaoModal = document.querySelector('#cotacaoModal');
const cotacaoTriggers = document.querySelectorAll('.cotacao-trigger');
const cotacaoCloseButtons = document.querySelectorAll('[data-close-cotacao]');
const cotacaoForm = document.querySelector('#cotacaoForm');
const cotacaoFormMessage = document.querySelector('#cotacaoFormMessage');
const cotacaoPhone = document.querySelector('#cotacaoPhone');
const cotacaoPlate = document.querySelector('#cotacaoPlate');
let lastFocusedCotacaoTrigger = null;

function openCotacaoModal(event) {
  if (!cotacaoModal) return;

  event.preventDefault();
  lastFocusedCotacaoTrigger = event.currentTarget;

  cotacaoModal.classList.add('open');
  cotacaoModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('cotacao-modal-open');

  const firstInput = cotacaoModal.querySelector('input[name="Nome"]');
  if (firstInput) firstInput.focus();
}

function closeCotacaoModal() {
  if (!cotacaoModal) return;

  cotacaoModal.classList.remove('open');
  cotacaoModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('cotacao-modal-open');

  if (lastFocusedCotacaoTrigger) {
    lastFocusedCotacaoTrigger.focus();
  }
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function setFormMessage(messageElement, text, type = '') {
  if (!messageElement) return;
  messageElement.textContent = text;
  messageElement.dataset.status = type;
}

async function sendStaticForm(form, messageElement, successMessage) {
  const submitButton = form.querySelector('button[type="submit"]');
  const originalButtonText = submitButton ? submitButton.textContent : '';

  setFormMessage(messageElement, 'Enviando...', 'loading');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Enviando...';
  }

  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: {
        Accept: 'application/json',
      },
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || 'Não foi possível enviar o formulário.');
    }

    form.reset();
    setFormMessage(messageElement, successMessage, 'success');
  } catch (error) {
    setFormMessage(
      messageElement,
      'Não foi possível enviar agora. Verifique se o e-mail já foi confirmado no FormSubmit ou tente novamente.',
      'error'
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  }
}

if (cotacaoPhone) {
  cotacaoPhone.addEventListener('input', () => {
    cotacaoPhone.value = formatPhone(cotacaoPhone.value);
  });
}

if (cotacaoPlate) {
  cotacaoPlate.addEventListener('input', () => {
    cotacaoPlate.value = cotacaoPlate.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8);
  });
}

if (cotacaoForm && cotacaoFormMessage) {
  cotacaoForm.addEventListener('submit', (event) => {
    event.preventDefault();
    sendStaticForm(
      cotacaoForm,
      cotacaoFormMessage,
      'Cotação enviada com sucesso! Nossa equipe entrará em contato em breve.'
    );
  });
}

cotacaoTriggers.forEach((trigger) => {
  trigger.addEventListener('click', openCotacaoModal);
});

cotacaoCloseButtons.forEach((button) => {
  button.addEventListener('click', closeCotacaoModal);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && cotacaoModal?.classList.contains('open')) {
    closeCotacaoModal();
  }
});

const contactForm = document.querySelector('#contactForm');
const contactFormMessage = document.querySelector('#contactFormMessage');

if (contactForm && contactFormMessage) {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    sendStaticForm(
      contactForm,
      contactFormMessage,
      'Dados enviados com sucesso! Nossa equipe entrará em contato em breve.'
    );
  });
}


// Consulta da 2ª via de boleto em etapas: CPF/CNPJ -> veículos -> boletos
const boletoBuscaForm = document.querySelector('#boletoBuscaForm');
const boletoDocumento = document.querySelector('#boletoDocumento');
const boletoFormMessage = document.querySelector('#boletoFormMessage');
const boletoAssociadoArea = document.querySelector('#boletoAssociadoArea');
const boletoAssociadoNome = document.querySelector('#boletoAssociadoNome');
const boletoVeiculosArea = document.querySelector('#boletoVeiculosArea');
const boletoVehicleList = document.querySelector('#boletoVehicleList');
const boletoBoletosArea = document.querySelector('#boletoBoletosArea');
const boletoSelectedVehicle = document.querySelector('#boletoSelectedVehicle');
const boletoList = document.querySelector('#boletoList');
const boletoNovaBusca = document.querySelector('#boletoNovaBusca');

let boletoState = {
  documento: '',
  associado: null,
  veiculos: [],
  veiculoSelecionado: null,
};

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatDocument(value) {
  const digits = onlyDigits(value).slice(0, 14);

  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function setBoletoMessage(text, type = '') {
  if (!boletoFormMessage) return;
  boletoFormMessage.textContent = text;
  boletoFormMessage.dataset.status = type;
}

function setBoletoStep(step) {
  document.querySelectorAll('[data-step-indicator]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.stepIndicator === step);
  });
}

function setElementHidden(element, hidden = true) {
  if (!element) return;
  element.hidden = hidden;
}

function resetBoletoFlow() {
  boletoState = {
    documento: '',
    associado: null,
    veiculos: [],
    veiculoSelecionado: null,
  };

  if (boletoBuscaForm) boletoBuscaForm.reset();
  if (boletoVehicleList) boletoVehicleList.innerHTML = '';
  if (boletoList) boletoList.innerHTML = '';
  if (boletoAssociadoNome) boletoAssociadoNome.textContent = 'Associado';
  if (boletoSelectedVehicle) boletoSelectedVehicle.textContent = 'Veículo selecionado';

  setElementHidden(boletoAssociadoArea, true);
  setElementHidden(boletoVeiculosArea, true);
  setElementHidden(boletoBoletosArea, true);
  setBoletoMessage('', '');
  setBoletoStep('documento');
  boletoDocumento?.focus();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Não foi possível concluir a solicitação.');
  }

  return data;
}

function getAssociadoId(associado) {
  return associado?.id || associado?.id_associado || associado?.codigo_associado || associado?.codigo || associado?.idCliente || '';
}

function getAssociadoNome(associado) {
  return associado?.nome || associado?.nome_associado || associado?.associado || associado?.razao_social || 'Associado encontrado';
}

function getVeiculoId(veiculo) {
  return veiculo?.id || veiculo?.id_veiculo || veiculo?.codigo_veiculo || veiculo?.codigo || veiculo?.idVeiculo || '';
}

function getVeiculoLabel(veiculo) {
  const placa = veiculo?.placa || veiculo?.Placa || 'Sem placa';
  const modelo = veiculo?.modelo || veiculo?.Modelo || veiculo?.veiculo || veiculo?.descricao || veiculo?.marca_modelo || '';
  const ano = veiculo?.ano || veiculo?.ano_modelo || '';
  return [placa, modelo, ano].filter(Boolean).join(' • ');
}

function getBoletoPdfUrl(boleto) {
  return boleto?.pdf || boleto?.url_pdf || boleto?.url_boleto || boleto?.link || boleto?.url || boleto?.boleto || '';
}

function getCodigoBarras(boleto) {
  return boleto?.codigo_barras || boleto?.linha_digitavel || boleto?.linhaDigitavel || boleto?.codigo || boleto?.barcode || '';
}

function formatDateBR(value) {
  if (!value) return 'Não informado';

  const raw = String(value);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;

  const date = new Date(raw.includes('T') ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString('pt-BR');
}

function getBoletoVencimento(boleto) {
  return boleto?.data_vencimento || boleto?.vencimento || boleto?.dt_vencimento || boleto?.dataVencimento || boleto?.data || '';
}

async function copyToClipboard(text) {
  if (!text) return;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function renderVeiculos(veiculos) {
  if (!boletoVehicleList) return;
  boletoVehicleList.innerHTML = '';

  if (!veiculos.length) {
    boletoVehicleList.innerHTML = `
      <div class="boleto-empty-state">
        Nenhum veículo foi encontrado para este CPF/CNPJ. Confira os dados digitados ou entre em contato com a Novo Horizonte.
      </div>
    `;
    return;
  }

  veiculos.forEach((veiculo, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'boleto-vehicle-card';
    button.innerHTML = `
      <i class="fa-solid fa-car-side" aria-hidden="true"></i>
      <span>
        <strong>${getVeiculoLabel(veiculo)}</strong>
        <small>Clique para consultar boletos</small>
      </span>
    `;

    button.addEventListener('click', () => consultarBoletos(veiculo));
    boletoVehicleList.appendChild(button);
  });
}

function renderBoletos(boletos) {
  if (!boletoList) return;
  boletoList.innerHTML = '';

  if (!boletos.length) {
    boletoList.innerHTML = `
      <div class="boleto-empty-state">
        Nenhum boleto em aberto foi encontrado para este veículo.
      </div>
    `;
    return;
  }

  boletos.forEach((boleto, index) => {
    const canEmitir = boleto.pode_emitir !== false && boleto.emitivel !== false && boleto.disponivel !== false;
    const pdfUrl = getBoletoPdfUrl(boleto);
    const codigoBarras = getCodigoBarras(boleto);
    const vencimento = getBoletoVencimento(boleto);
    const valor = boleto.valor || boleto.valor_boleto || boleto.valor_total || '';
    const mensagemBloqueio = boleto.mensagem || boleto.message || 'Este boleto não está disponível para emissão pelo site, pois passou do prazo permitido para retirada da segunda via. Entre em contato com o setor financeiro da Novo Horizonte para atualizar seu boleto.';

    const item = document.createElement('article');
    item.className = `boleto-item ${canEmitir ? '' : 'boleto-item--blocked'}`;
    item.innerHTML = `
      <div class="boleto-item__info">
        <small>Boleto ${index + 1}</small>
        <strong>Vencimento: ${formatDateBR(vencimento)}</strong>
        ${valor ? `<span>Valor: ${valor}</span>` : ''}
        ${codigoBarras ? `<code>${codigoBarras}</code>` : ''}
        ${!canEmitir ? `<p class="boleto-block-message">${mensagemBloqueio}</p>` : ''}
      </div>
      <div class="boleto-item__actions">
        ${canEmitir && pdfUrl ? `<a class="primary-button" href="${pdfUrl}" target="_blank" rel="noopener">Abrir PDF</a>` : ''}
        ${canEmitir && codigoBarras ? `<button class="secondary-button boleto-copy-button" type="button">Copiar código</button>` : ''}
        ${!canEmitir ? `<a class="secondary-button" href="https://wa.me/558221800532?text=Olá,%20preciso%20atualizar%20a%202ª%20via%20do%20meu%20boleto." target="_blank" rel="noopener">Falar com financeiro</a>` : ''}
      </div>
    `;

    const copyButton = item.querySelector('.boleto-copy-button');
    copyButton?.addEventListener('click', async () => {
      try {
        await copyToClipboard(codigoBarras);
        copyButton.textContent = 'Código copiado!';
        setTimeout(() => {
          copyButton.textContent = 'Copiar código';
        }, 2200);
      } catch {
        setBoletoMessage('Não foi possível copiar o código. Selecione e copie manualmente.', 'error');
      }
    });

    boletoList.appendChild(item);
  });
}

async function buscarCadastro(documento) {
  setBoletoMessage('Buscando cadastro...', 'loading');
  setBoletoStep('documento');

  const data = await requestJson('/api/buscar-associado', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documento }),
  });

  boletoState.associado = data.associado || data.data || data;
  boletoState.documento = documento;

  if (boletoAssociadoNome) {
    boletoAssociadoNome.textContent = getAssociadoNome(boletoState.associado);
  }

  setElementHidden(boletoAssociadoArea, false);
  await listarVeiculos();
}

async function listarVeiculos() {
  const associadoId = getAssociadoId(boletoState.associado);
  const params = new URLSearchParams({ documento: boletoState.documento });
  if (associadoId) params.set('associadoId', associadoId);

  setBoletoMessage('Listando veículos vinculados ao cadastro...', 'loading');

  const data = await requestJson(`/api/listar-veiculos?${params.toString()}`);
  const veiculos = data.veiculos || data.data || [];

  boletoState.veiculos = Array.isArray(veiculos) ? veiculos : [];
  renderVeiculos(boletoState.veiculos);

  setElementHidden(boletoVeiculosArea, false);
  setElementHidden(boletoBoletosArea, true);
  setBoletoStep('veiculos');
  setBoletoMessage('Cadastro encontrado. Agora selecione o veículo.', 'success');
}

async function consultarBoletos(veiculo) {
  boletoState.veiculoSelecionado = veiculo;
  const associadoId = getAssociadoId(boletoState.associado);
  const veiculoId = getVeiculoId(veiculo);
  const placa = veiculo?.placa || veiculo?.Placa || '';

  const params = new URLSearchParams({ documento: boletoState.documento });
  if (associadoId) params.set('associadoId', associadoId);
  if (veiculoId) params.set('veiculoId', veiculoId);
  if (placa) params.set('placa', placa);

  setBoletoMessage('Consultando boletos do veículo...', 'loading');
  setBoletoStep('boletos');

  const data = await requestJson(`/api/consultar-boletos?${params.toString()}`);
  const boletos = data.boletos || data.data || [];

  if (boletoSelectedVehicle) boletoSelectedVehicle.textContent = getVeiculoLabel(veiculo);

  renderBoletos(Array.isArray(boletos) ? boletos : []);
  setElementHidden(boletoBoletosArea, false);
  setBoletoMessage('Consulta finalizada.', 'success');
}

if (boletoDocumento) {
  boletoDocumento.addEventListener('input', () => {
    boletoDocumento.value = formatDocument(boletoDocumento.value);
  });
}

if (boletoBuscaForm) {
  boletoBuscaForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitButton = boletoBuscaForm.querySelector('button[type="submit"]');
    const originalButtonText = submitButton ? submitButton.textContent : 'Buscar cadastro';
    const documento = onlyDigits(boletoDocumento?.value || '');

    if (documento.length !== 11 && documento.length !== 14) {
      setBoletoMessage('Informe um CPF ou CNPJ válido.', 'error');
      boletoDocumento?.focus();
      return;
    }

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Buscando...';
      }

      setElementHidden(boletoAssociadoArea, true);
      setElementHidden(boletoVeiculosArea, true);
      setElementHidden(boletoBoletosArea, true);
      if (boletoVehicleList) boletoVehicleList.innerHTML = '';
      if (boletoList) boletoList.innerHTML = '';

      await buscarCadastro(documento);
    } catch (error) {
      setBoletoMessage(error.message || 'Não foi possível consultar agora. Tente novamente em instantes.', 'error');
      setBoletoStep('documento');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
      }
    }
  });
}

boletoNovaBusca?.addEventListener('click', resetBoletoFlow);
