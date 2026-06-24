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
BOLETO_MAX_DAYS_AFTER_DUE=6

HINOVA_AUTO_LOGIN=true
HINOVA_LOGIN_URL=https://sga.hinova.com.br/sga/sgav4_novohorizonte/index.php
HINOVA_LOGIN_USER=COLE_SEU_USUARIO_AQUI
HINOVA_LOGIN_PASSWORD=COLE_SUA_SENHA_AQUI
HINOVA_LOGIN_USER_FIELD=usuario
HINOVA_LOGIN_PASSWORD_FIELD=senha
```

> Observação: as rotas internas do SGA normalmente dependem do cookie da sessão logada. O ideal para produção é a Hinova fornecer uma API oficial por token para consulta de boletos.


- Boletos bloqueados por prazo exibem botão de ligação direta para o financeiro: 0800 590 0656.


## Regra de boleto vencido

Quando a consulta encontrar boleto vencido há mais de **6 dias corridos**, a regra é aplicada **individualmente por veículo/placa**:

- Para cada veículo, o sistema analisa somente os boletos daquele veículo.
- Se o veículo tiver boleto vencido acima do prazo, o site exibe apenas o boleto vencido mais antigo desse veículo e oculta os demais boletos da mesma placa.
- Se outro veículo do mesmo associado não tiver boleto vencido acima do prazo, todos os boletos disponíveis desse outro veículo continuam aparecendo normalmente.
- A regra é repetida veículo por veículo até finalizar todos os veículos do associado.
- O boleto bloqueado mostra a mensagem de atualização e o botão **Ligar 0800 590 0656**.

Configure o limite em:

```env
BOLETO_MAX_DAYS_AFTER_DUE=6
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
├── style.css
├── script.js
└── README.md
```

## Autor

Desenvolvido por **Carlos Lima**.


## Regra final por placa

A consulta agora trata cada placa separadamente:

- **Placa cancelada:** exibe somente a mensagem de placa cancelada, sem listar todos os boletos cancelados.
- **Placa com 2 ou mais boletos vencidos há mais de 6 dias:** exibe somente o boleto vencido mais antigo, marca como **Placa inativa** e orienta ligar para **0800 590 0656, opção 2**.
- **Placa com 1 boleto vencido há mais de 6 dias:** exibe somente esse boleto vencido e orienta regularizar no financeiro pelo **0800 590 0656, opção 2**.
- **Placa em dia:** exibe os boletos disponíveis para baixar pelo site.

Boletos cancelados, baixados ou pagos não aparecem como boletos disponíveis para download.


## Login automático no SGA

Além do `HINOVA_COOKIE`, a API agora aceita login automático. O fluxo é:

1. A API tenta consultar usando o cookie atual.
2. Se o SGA retornar tela de login, falha de autenticação ou uma sessão vazia, a API tenta acessar a tela de login.
3. Ela envia usuário e senha configurados nas variáveis de ambiente.
4. O cookie recebido é guardado temporariamente em memória e usado nas próximas consultas.

Configure no `.env.local` ou na Vercel:

```env
HINOVA_AUTO_LOGIN=true
HINOVA_LOGIN_URL=https://sga.hinova.com.br/sga/sgav4_novohorizonte/index.php
HINOVA_LOGIN_USER=COLE_SEU_USUARIO_AQUI
HINOVA_LOGIN_PASSWORD=COLE_SUA_SENHA_AQUI
HINOVA_LOGIN_USER_FIELD=usuario
HINOVA_LOGIN_PASSWORD_FIELD=senha
HINOVA_LOGIN_CACHE_MS=1200000
```

Se a tela de login tiver captcha, dupla autenticação ou algum campo obrigatório que não venha no formulário, o login automático pode falhar. Nesse caso, use `HINOVA_LOGIN_EXTRA_FIELDS` para informar campos adicionais ou mantenha o `HINOVA_COOKIE` atualizado manualmente.

**Importante:** nunca coloque usuário, senha, token ou cookie dentro do HTML/JS público. Use apenas `.env.local` no desenvolvimento e variáveis de ambiente na Vercel.
