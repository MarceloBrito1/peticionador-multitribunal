# Peticionador Multitribunal

Aplicativo Electron com:

- Login/cadastro local de usuarios com RBAC.
- Auditoria de eventos.
- Envio de peticoes por tribunal (robos Python).
- Envio em lote por PDFs com extracao automatica do numero CNJ.
- Cadastro local de certificado A1 (.pfx/.p12) com senha criptografada.

## Requisitos

- Node.js 18+
- Python 3+ no PATH (`python` ou `py`) para executar robos
- Selenium no Python (`pip install selenium`)
- Microsoft Edge ou Google Chrome instalados no Windows

## Instalar e executar

```bash
npm install
npm start
```

Dependencias Python:

```bash
pip install -r requirements.txt
```

Usuario admin padrao:

- Email: `admin@peticionador.local`
- Senha: `admin123`

## Pasta local fora do OneDrive

Por padrao os dados sao gravados em:

- `C:\Users\<usuario>\PeticionadorMultitribunalData`

Pode sobrescrever com a variavel:

- `PETICIONADOR_DATA_DIR`

## Fluxo de certificado A1

1. Faca login.
2. Abra o card `Certificado A1`.
3. Selecione o `.pfx/.p12`.
4. Informe a senha e salve.

O arquivo e copiado para a pasta local de dados e a senha fica criptografada.
A senha do certificado fica somente em armazenamento local do aplicativo e nunca deve ser enviada para servicos externos.

## TJSP com dois canais (eproc e e-SAJ)

No tribunal `TJSP`, o envio aceita dois canais de entrada:

- `eproc`
- `esaj`

Nos formularios de envio unico e lote por PDFs (para `TJSP` e `TJSP 2 Grau`) existe:

- Seletor `Canal TJSP`.
- Seletor `Modo de execucao` (`real` ou `simulado`).
- Seletor `Confirmar protocolo automaticamente`.
- Campo opcional `Link de acesso TJSP`.

Regras implementadas:

- O app normaliza links de login do e-SAJ (`/sajcas/login?service=...`) e links com `servico=.../api/auth/check`.
- O app reconhece login SSO do eproc (`https://sso.tjsp.jus.br/realms/eproc/protocol/openid-connect/auth?...`) e extrai o destino `redirect_uri` para definir o `serviceUrl`.
- O app reconhece links de peticionamento (`/petpg`, `/petsg`, `/petcr`), incluindo peticao inicial e intermediaria de 1 instancia (`/petpg/peticoes/inicial/...` e `/petpg/peticoes/intermediaria/...`), peticao inicial/intermediaria de 2 instancia (`/petsg/peticoes/inicial/...` e `/petsg/peticoes/intermediaria/...`) e peticao inicial/intermediaria de colegio recursal (`/petcr/peticoes/inicial/...` e `/petcr/peticoes/intermediaria/...`).
- Parametros temporarios como `ticket` e `origemServidor` sao removidos.
- O canal selecionado deve bater com o dominio do link informado (`esaj` ou `eproc`).
- No canal `esaj`, o robo recebe URLs normalizadas de `login`, `service/auth-check` e portal.
- No canal `eproc`, o robo recebe URL de entrada do eproc normalizada.

## Automacao real (Selenium)

No modo `real`, os robos `robo_tjsp.py` e `robo_tjsp2.py`:

- Importam o certificado A1 no repositorio `CurrentUser\My` do Windows (local).
- Iniciam navegador Selenium (Edge, com fallback para Chrome).
- Aplicam auto-selecao de certificado para dominios `*.tjsp.jus.br`.
- Aguardam login com certificado, acessam o destino e tentam:
  - Preencher numero do processo.
  - Preencher descricao.
  - Anexar PDF.
  - Clicar no botao de protocolo (quando `Confirmar protocolo automaticamente = Sim`).
- Salvam screenshots locais em `PETICIONADOR_DATA_DIR\automacao`.
- Salvam relatorio local por protocolo em `PETICIONADOR_DATA_DIR\automacao\*_execucao.json` (sem senha do certificado).
- Tentam abrir comprovante/recibo, extraem numero oficial do protocolo na tela e salvam evidencia HTML/PDF local.

Variaveis opcionais de ambiente para ajuste:

- `PETICIONADOR_IMPORTAR_CERT_A1=1` (padrao) para importar o PFX automaticamente.
- `PETICIONADOR_REMOVER_CERT_A1=1` para remover o certificado importado ao final do robo.
- `PETICIONADOR_TIMEOUT_LOGIN_SEGUNDOS=240` para timeout de login.
- `PETICIONADOR_TIMEOUT_ETAPA_SEGUNDOS=60` para timeout de navegacao por etapa.
- `PETICIONADOR_HEADLESS=0` (padrao) para execucao visivel do navegador.
- `PETICIONADOR_BROWSER=auto|edge|chrome` para forcar navegador.
- `PETICIONADOR_ABRIR_COMPROVANTE=1` (padrao) para tentar abrir tela de comprovante apos o clique de protocolo.
- `PETICIONADOR_TIMEOUT_ROBO_MS` para timeout total do processo Python (padrao maior no modo `real`).

## Retry automatico

Para reduzir falhas transientes, o envio pode repetir automaticamente no mesmo protocolo:

- `PETICIONADOR_RETRY_MAX` (padrao: `3` no modo real, `1` no simulado).
- `PETICIONADOR_RETRY_DELAY_MS` (padrao: `2500`).
- `PETICIONADOR_RETRY_BACKOFF_FACTOR` (padrao: `2`).
- `PETICIONADOR_RETRY_DELAY_MAX_MS` (padrao: `60000`).

Cada tentativa fica registrada na auditoria (`envio_tentativa_iniciada` e `envio_tentativa_reprocesso`).

## Lote por PDFs

1. Abra o card `Lote por PDFs`.
2. Selecione varios PDFs.
3. Escolha o tribunal destino.
4. Clique em `Protocolar lote`.

O sistema extrai o numero CNJ de cada PDF e envia cada arquivo no respectivo processo.

## Smoke test

```bash
npm run smoke
```
