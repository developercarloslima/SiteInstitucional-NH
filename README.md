# NH Proteção Veicular

Site institucional da **Novo Horizonte Proteção Veicular** com página inicial, página de escritórios, formulário de cotação e fluxo de consulta da **2ª via de boleto**.

## Fluxo de boleto

A página `boleto.html` agora trabalha em 3 etapas:

1. O associado informa CPF/CNPJ.
2. O site busca o cadastro e lista os veículos vinculados.
3. O associado escolhe o veículo e o site consulta os boletos disponíveis.

Quando o boleto está disponível, o site mostra:

- botão para abrir o PDF;
- botão para copiar o código de barras/linha digitável.

Quando o boleto estiver vencido há mais de 5 dias úteis, o site orienta o associado a entrar em contato com o financeiro para atualização.

## Estrutura

```txt
├── index.html
├── boleto.html
├── escritorios.html
├── style.css
├── script.js
├── api/
│   ├── buscar-associado.js
│   ├── listar-veiculos.js
│   ├── consultar-boletos.js
│   └── segunda-via-boleto.js
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
HINOVA_BASE_URL=https://url-base-da-hinova
HINOVA_TOKEN=token-gerado
HINOVA_USUARIO=usuario-gerado
HINOVA_SENHA=senha-gerada

HINOVA_ASSOCIADO_URL=https://endpoint-post-buscar-associado
HINOVA_VEICULOS_URL=https://endpoint-get-listar-veiculos
HINOVA_BOLETOS_URL=https://endpoint-get-consultar-boletos

HINOVA_ASSOCIADO_METHOD=POST
HINOVA_VEICULOS_METHOD=GET
HINOVA_BOLETOS_METHOD=GET

HINOVA_AUTH_TYPE=bearer
HINOVA_AUTH_HEADER=Authorization
HINOVA_AUTH_PREFIX=Bearer

HINOVA_DOCUMENT_FIELD=documento
HINOVA_ASSOCIADO_ID_FIELD=associadoId
HINOVA_VEHICLE_ID_FIELD=veiculoId
HINOVA_PLATE_FIELD=placa
```

Caso a Hinova use nomes diferentes nos parâmetros, altere as variáveis `HINOVA_DOCUMENT_FIELD`, `HINOVA_ASSOCIADO_ID_FIELD`, `HINOVA_VEHICLE_ID_FIELD` e `HINOVA_PLATE_FIELD`.

## Como executar

Para testar apenas o layout, abra `index.html` com Live Server.

Para testar as rotas `/api`, use a Vercel ou um ambiente Node compatível com funções serverless.

## Autor

Desenvolvido por **Carlos Lima**.
