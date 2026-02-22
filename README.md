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

## Instalar e executar

```bash
npm install
npm start
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

1. Faça login.
2. Abra o card `Certificado A1`.
3. Selecione o `.pfx/.p12`.
4. Informe a senha e salve.

O arquivo e copiado para a pasta local de dados e a senha fica criptografada.

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
