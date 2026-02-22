const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { readJson, resolveDataPath, writeJson } = require("./storage");
const { registrarEvento } = require("./auditoria");

const CERT_FILE = "certificado.json";
const CERT_KEY_FILE = "certificado.key";

function getOrCreateKey() {
  const keyPath = resolveDataPath(CERT_KEY_FILE);
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath);
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, key);
  return key;
}

function encryptSecret(secret) {
  const key = getOrCreateKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    content: encrypted.toString("base64"),
  };
}

function decryptSecret(payload) {
  const key = getOrCreateKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(payload.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.content, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function validarArquivoCertificado(caminhoArquivo) {
  const absoluto = path.resolve(String(caminhoArquivo || "").trim());
  if (!absoluto) {
    throw new Error("Caminho do certificado A1 e obrigatorio.");
  }
  if (!fs.existsSync(absoluto)) {
    throw new Error("Arquivo de certificado nao encontrado.");
  }

  const ext = path.extname(absoluto).toLowerCase();
  if (ext !== ".pfx" && ext !== ".p12") {
    throw new Error("Certificado invalido. Use arquivo .pfx ou .p12.");
  }
  return absoluto;
}

function copiarCertificadoParaDataDir(origem) {
  const dir = resolveDataPath("certificados");
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, "certificado_a1.pfx");
  fs.copyFileSync(origem, destino);
  return destino;
}

function salvarCertificado({ caminhoArquivo, senha, usuario = "sistema" }) {
  const origem = validarArquivoCertificado(caminhoArquivo);
  const senhaFinal = String(senha || "");
  if (!senhaFinal) {
    throw new Error("Senha do certificado e obrigatoria.");
  }

  const destino = copiarCertificadoParaDataDir(origem);
  const senhaCriptografada = encryptSecret(senhaFinal);

  const registro = {
    configurado: true,
    arquivo: destino,
    senhaCriptografada,
    atualizadoEm: new Date().toISOString(),
  };

  writeJson(CERT_FILE, registro);

  registrarEvento({
    tipo: "certificado_atualizado",
    usuario,
    detalhes: {
      arquivo: destino,
    },
  });

  return obterStatusCertificado();
}

function obterStatusCertificado() {
  const data = readJson(CERT_FILE, { configurado: false });
  if (!data.configurado) {
    return {
      configurado: false,
      arquivo: null,
      atualizadoEm: null,
    };
  }

  const existe = fs.existsSync(data.arquivo);
  return {
    configurado: existe,
    arquivo: existe ? data.arquivo : null,
    atualizadoEm: data.atualizadoEm || null,
  };
}

function obterCredenciaisCertificado() {
  const data = readJson(CERT_FILE, { configurado: false });
  if (!data.configurado || !data.senhaCriptografada || !data.arquivo) {
    throw new Error(
      "Certificado A1 nao configurado. Cadastre o certificado antes de protocolar."
    );
  }
  if (!fs.existsSync(data.arquivo)) {
    throw new Error(
      "Arquivo do certificado configurado nao foi encontrado. Reconfigure o certificado."
    );
  }

  return {
    arquivo: data.arquivo,
    senha: decryptSecret(data.senhaCriptografada),
  };
}

module.exports = {
  obterCredenciaisCertificado,
  obterStatusCertificado,
  salvarCertificado,
};
