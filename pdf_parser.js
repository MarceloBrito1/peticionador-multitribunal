const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const CNJ_REGEX = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;
const CNJ_COMPACTO_REGEX = /\b\d{20}\b/g;

function normalizarNumeroProcesso(valor) {
  const numeros = String(valor || "").replace(/\D/g, "");
  if (numeros.length !== 20) {
    return String(valor || "").trim();
  }

  return `${numeros.slice(0, 7)}-${numeros.slice(7, 9)}.${numeros.slice(9, 13)}.${numeros.slice(13, 14)}.${numeros.slice(14, 16)}.${numeros.slice(16, 20)}`;
}

function extrairPorRegex(texto) {
  const cnjComMascara = texto.match(CNJ_REGEX);
  if (cnjComMascara && cnjComMascara.length > 0) {
    return normalizarNumeroProcesso(cnjComMascara[0]);
  }

  const cnjCompacto = texto.match(CNJ_COMPACTO_REGEX);
  if (cnjCompacto && cnjCompacto.length > 0) {
    return normalizarNumeroProcesso(cnjCompacto[0]);
  }

  return null;
}

async function extrairNumeroProcessoDoPdf(caminhoArquivo) {
  const absoluto = path.resolve(String(caminhoArquivo || "").trim());
  if (!absoluto) {
    throw new Error("Arquivo PDF nao informado.");
  }
  if (!fs.existsSync(absoluto)) {
    throw new Error(`Arquivo nao encontrado: ${absoluto}`);
  }
  if (path.extname(absoluto).toLowerCase() !== ".pdf") {
    throw new Error("O arquivo informado nao e PDF.");
  }

  const buffer = fs.readFileSync(absoluto);
  const parsed = await pdfParse(buffer);
  const texto = String(parsed.text || "");

  const numero = extrairPorRegex(texto) || extrairPorRegex(path.basename(absoluto));
  if (!numero) {
    throw new Error(
      "Nao foi possivel identificar numero de processo CNJ no PDF informado."
    );
  }
  return numero;
}

module.exports = {
  extrairNumeroProcessoDoPdf,
  normalizarNumeroProcesso,
};
