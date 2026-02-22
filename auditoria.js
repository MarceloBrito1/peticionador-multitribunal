const crypto = require("crypto");
const { readJson, writeJson } = require("./storage");

const AUDITORIA_FILE = "auditoria.json";
const MAX_EVENTOS = 5000;

function novoId() {
  return `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function registrarEvento({ tipo, usuario = "sistema", detalhes = {} }) {
  if (!tipo || typeof tipo !== "string") {
    throw new Error("O campo 'tipo' do evento de auditoria e obrigatorio.");
  }

  const eventos = readJson(AUDITORIA_FILE, []);
  const registro = {
    id: novoId(),
    timestamp: new Date().toISOString(),
    tipo,
    usuario,
    detalhes,
  };

  eventos.push(registro);
  writeJson(AUDITORIA_FILE, eventos.slice(-MAX_EVENTOS));
  return registro;
}

function listarEventos({ limit = 50 } = {}) {
  const quantidade = Math.max(1, Math.min(500, Number(limit) || 50));
  const eventos = readJson(AUDITORIA_FILE, []);
  return [...eventos].reverse().slice(0, quantidade);
}

function gerarResumo() {
  const eventos = readJson(AUDITORIA_FILE, []);
  const porTipo = {};

  for (const evento of eventos) {
    porTipo[evento.tipo] = (porTipo[evento.tipo] || 0) + 1;
  }

  return {
    totalEventos: eventos.length,
    porTipo,
    ultimoEvento: eventos.length ? eventos[eventos.length - 1] : null,
  };
}

module.exports = {
  gerarResumo,
  listarEventos,
  registrarEvento,
};
