# NH Proteção Veicular

Site institucional da **Novo Horizonte Proteção Veicular** com página inicial, escritórios, cotação e consulta de 2ª via de boleto.

## Fluxo de boleto atualizado

A consulta agora usa o fluxo observado no SGA:

1. O associado informa CPF/CNPJ.
2. A rota `/api/consultar-boletos-associado` consulta `carregaAssociados.php` para localizar o associado e obter o ID.
3. A API gera automaticamente a `key` usada pelo SGA com o mesmo algoritmo `fCriptografa(id, 'INT')`.
4. A API consulta `carregaAssociadoDados.php`, rota que carrega a área **Financeiro** da tela `associado/consultarAssociado.php`.
5. O HTML/JavaScript retornado é lido e os boletos são extraídos de `stringBoleto`.
6. Cada boleto recebe um link interno `/api/baixar-boleto`, para baixar o PDF usando o cookie do backend sem expor a sessão ao usuário.
7. Se essa rota não retornar boletos, a API tenta o fallback `carregaListaBoletoAJAX.php`.

## Variáveis de ambiente

Use `.env.local` no desenvolvimento e configure as mesmas variáveis na Vercel em **Settings → Environment Variables**.

```env
HINOVA_ASSOCIADO_SEARCH_URL=https://sga.hinova.com.br/sga/sgav4_novohorizonte/carrega/carregaAssociados.php
HINOVA_ASSOCIADO_SEARCH_FIELD=input

HINOVA_ASSOCIADO_DADOS_URL=https://sga.hinova.com.br/sga/sgav4_novohorizonte/carrega/carregaAssociadoDados.php
HINOVA_ASSOCIADO_DADOS_KEY_FIELD=key
# Opcional: use somente para testar uma key fixa capturada no Network
# HINOVA_ASSOCIADO_DADOS_FIXED_KEY=MTQ2NzY1MDgzNzQw

HINOVA_BOLETOS_LIST_URL=https://sga.hinova.com.br/sga/sgav4_novohorizonte/carrega/carregaListaBoletoAJAX.php
HINOVA_BOLETO_SITUACOES=1,2,3,4,999

HINOVA_TOKEN=COLE_SEU_TOKEN_AQUI
HINOVA_AUTH_HEADER=Authorization
HINOVA_AUTH_PREFIX=none
HINOVA_COOKIE=COLE_AQUI_O_COOKIE_DO_SGA_LOGADO

HINOVA_BOLETO_LAYOUT=C
HINOVA_BOLETO_LOTE=Y
HINOVA_BOLETO_MENSAGEM=Y
HINOVA_BOLETO_DESCONTO=N

HINOVA_DEBUG_RESPONSE=true
BOLETO_MAX_BUSINESS_DAYS_AFTER_DUE=5
```

> Observação: as rotas internas do SGA normalmente dependem do cookie da sessão logada. O ideal para produção é a Hinova fornecer uma API oficial por token para consulta de boletos.

## Estrutura

```txt
├── api/
│   ├── consultar-boletos-associado.js
│   └── baixar-boleto.js
├── assets/
├── index.html
├── boleto.html
├── escritorios.html
├── style.css
├── script.js
└── README.md
```

## Autor

Desenvolvido por **Carlos Lima**.
