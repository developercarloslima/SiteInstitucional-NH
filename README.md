# NH Proteção Veicular

Site institucional da **Novo Horizonte Proteção Veicular** com página inicial, escritórios, cotação e consulta de 2ª via de boleto.

## Integração de boletos

A consulta de boletos usa a **API oficial Hinova SGA V2**, sem cookie de navegador.

Fluxo principal:

1. O associado informa CPF/CNPJ na página `boleto.html`.
2. O backend autentica na API oficial usando `/usuario/autenticar`, ou usa `HINOVA_API_USER_TOKEN` quando configurado.
3. O backend consulta boletos pela rota `/listar/boleto-associado-veiculo` em blocos de até 180 dias.
4. Intervalos sem boleto retornados pela Hinova como `406` são ignorados e a busca continua no próximo período.
5. Os boletos são agrupados por placa/veículo.
6. A regra de exibição é aplicada por placa.

## Regra por placa

- Placa cancelada: exibe aviso de placa cancelada.
- Placa com 2 ou mais boletos vencidos há mais de 6 dias: exibe somente o boleto vencido mais antigo e informa placa inativa.
- Placa com 1 boleto vencido há mais de 6 dias: exibe somente esse boleto vencido e orienta regularização no financeiro.
- Placa sem atraso: lista os boletos disponíveis para baixar.
- Boletos pagos, baixados ou cancelados não são exibidos como disponíveis.

## Variáveis de ambiente

Use `.env` localmente. Em produção, configure as mesmas variáveis em **Vercel → Settings → Environment Variables**.

Principais variáveis:

```env
HINOVA_API_BASE_URL=https://api.hinova.com.br/api/sga/v2
HINOVA_API_TOKEN=TOKEN_GERADO_NO_SGA
HINOVA_API_USER=USUARIO_INTEGRACAO
HINOVA_API_PASSWORD=SENHA_INTEGRACAO
HINOVA_API_USER_TOKEN=TOKEN_USUARIO_AUTENTICADO

HINOVA_ASSOCIADO_CPF_PATH=/associado/buscar-por-permissao/{documento}/cpf

BOLETO_MAX_DAYS_AFTER_DUE=6
BOLETO_SEARCH_DAYS_PAST=180
BOLETO_SEARCH_DAYS_FUTURE=420
BOLETO_SEARCH_CHUNK_DAYS=180
HINOVA_DEBUG_RESPONSE=false
```

## Estrutura

```txt
├── api/
│   ├── consultar-boletos-associado.js
│   └── baixar-boleto.js
├── assets/
├── index.html
├── boleto.html
├── escritorios.html
├── script.js
├── style.css
├── .env
├── .gitignore
└── README.md
```

## Segurança

Não envie `.env` para o GitHub. O arquivo `.gitignore` já bloqueia `.env` e `.env*`.

## Autor

Desenvolvido por **Carlos Lima**.
