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
