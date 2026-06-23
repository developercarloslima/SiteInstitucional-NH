# NH Proteção Veicular

Site institucional da **Novo Horizonte Proteção Veicular** com página inicial, página de escritórios, formulário de cotação e consulta da **2ª via de boleto**.

## Fluxo de boleto atualizado

A página `boleto.html` agora segue o fluxo solicitado pelo cliente:

1. O associado informa CPF/CNPJ.
2. O site envia o CPF/CNPJ para uma única rota segura: `/api/consultar-boletos-associado`.
3. Essa rota consulta a API da Hinova/SGA usando o token protegido nas variáveis de ambiente.
4. A API retorna os boletos vinculados ao associado.
5. O site exibe cada boleto com placa, veículo, valor, vencimento, PDF e código de barras/linha digitável quando disponíveis.

Se o boleto estiver vencido há mais de **5 dias úteis**, o site orienta o associado a entrar em contato com o financeiro para atualização.

## Estrutura

```txt
├── index.html
├── boleto.html
├── escritorios.html
├── style.css
├── script.js
├── api/
│   └── consultar-boletos-associado.js
└── assets/
    ├── app-store-badge.png
    ├── carro-hero.png
    ├── favicon-nh.png
    ├── google-play-badge.png
    ├── logo-nh-oficial.png
    └── logo-nh-simbolo.png
```

## Variáveis de ambiente

Configure as variáveis na Vercel/hospedagem. Não coloque token, usuário ou senha no HTML, CSS, JavaScript público ou GitHub.

```txt
HINOVA_API_URL=https://url-da-api-da-hinova
HINOVA_API_METHOD=POST
HINOVA_TOKEN=token-gerado
HINOVA_AUTH_TYPE=bearer
HINOVA_AUTH_HEADER=Authorization
HINOVA_AUTH_PREFIX=Bearer
HINOVA_DOCUMENT_FIELD=cpf
BOLETO_MAX_BUSINESS_DAYS_AFTER_DUE=5
```

Se a Hinova informar que o CPF/CNPJ precisa ir em outro campo, altere `HINOVA_DOCUMENT_FIELD` para o nome correto, por exemplo `documento` ou `cpf_cnpj`.

## Arquivos removidos

As rotas antigas do fluxo em etapas foram removidas do projeto final:

- `buscar-associado.js`
- `listar-veiculos.js`
- `consultar-boletos.js`
- `segunda-via-boleto.js`

Agora o projeto usa somente:

```txt
api/consultar-boletos-associado.js
```

## Como executar

Para testar apenas o layout, abra `index.html` com Live Server.

Para testar as rotas `/api`, use a Vercel ou um ambiente Node compatível com funções serverless.

## Autor

Desenvolvido por **Carlos Lima**.
