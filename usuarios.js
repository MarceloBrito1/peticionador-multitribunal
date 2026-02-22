const crypto = require("crypto");
const { readJson, writeJson } = require("./storage");
const { registrarEvento } = require("./auditoria");

const USUARIOS_FILE = "usuarios.json";
const SESSOES_FILE = "sessoes.json";
const ADMIN_EMAIL = "admin@peticionador.local";
const ADMIN_PASSWORD = "admin123";

function hashSenha(senha) {
  return crypto.createHash("sha256").update(String(senha)).digest("hex");
}

function emailNormalizado(email) {
  return String(email || "").trim().toLowerCase();
}

function semSenha(usuario) {
  const { senhaHash, ...dadosPublicos } = usuario;
  return dadosPublicos;
}

function ensureAdminUser() {
  const usuarios = readJson(USUARIOS_FILE, []);
  const jaExiste = usuarios.some((usuario) => usuario.email === ADMIN_EMAIL);
  if (jaExiste) {
    return;
  }

  usuarios.push({
    id: `usr_${Date.now()}`,
    nome: "Administrador",
    email: ADMIN_EMAIL,
    senhaHash: hashSenha(ADMIN_PASSWORD),
    role: "admin",
    ativo: true,
    criadoEm: new Date().toISOString(),
  });

  writeJson(USUARIOS_FILE, usuarios);
}

function cadastrarUsuario({ nome, email, senha, role = "operador" }) {
  ensureAdminUser();

  const nomeFinal = String(nome || "").trim();
  const emailFinal = emailNormalizado(email);
  const senhaFinal = String(senha || "");

  if (!nomeFinal) {
    throw new Error("Nome e obrigatorio.");
  }
  if (!emailFinal.includes("@")) {
    throw new Error("Email invalido.");
  }
  if (senhaFinal.length < 6) {
    throw new Error("Senha deve ter ao menos 6 caracteres.");
  }

  const usuarios = readJson(USUARIOS_FILE, []);
  const existe = usuarios.some((usuario) => usuario.email === emailFinal);
  if (existe) {
    throw new Error("Ja existe usuario com esse email.");
  }

  const usuario = {
    id: `usr_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
    nome: nomeFinal,
    email: emailFinal,
    senhaHash: hashSenha(senhaFinal),
    role: role === "admin" ? "admin" : "operador",
    ativo: true,
    criadoEm: new Date().toISOString(),
  };

  usuarios.push(usuario);
  writeJson(USUARIOS_FILE, usuarios);
  registrarEvento({
    tipo: "usuario_criado",
    usuario: emailFinal,
    detalhes: { role: usuario.role },
  });

  return semSenha(usuario);
}

function autenticar({ email, senha }) {
  ensureAdminUser();
  const emailFinal = emailNormalizado(email);
  const senhaFinal = String(senha || "");
  const usuarios = readJson(USUARIOS_FILE, []);

  const usuario = usuarios.find(
    (item) => item.email === emailFinal && item.ativo !== false
  );
  if (!usuario || usuario.senhaHash !== hashSenha(senhaFinal)) {
    throw new Error("Credenciais invalidas.");
  }

  const token = crypto.randomBytes(24).toString("hex");
  const agora = Date.now();
  const expiraEm = new Date(agora + 1000 * 60 * 60 * 12).toISOString();
  const sessoes = readJson(SESSOES_FILE, []);

  sessoes.push({
    token,
    userId: usuario.id,
    criadoEm: new Date(agora).toISOString(),
    expiraEm,
  });

  writeJson(
    SESSOES_FILE,
    sessoes.filter((sessao) => new Date(sessao.expiraEm).getTime() > agora)
  );

  registrarEvento({
    tipo: "login",
    usuario: usuario.email,
    detalhes: { role: usuario.role },
  });

  return {
    token,
    expiraEm,
    usuario: semSenha(usuario),
  };
}

function validarSessao(token) {
  ensureAdminUser();
  const tokenFinal = String(token || "").trim();
  if (!tokenFinal) {
    return null;
  }

  const agora = Date.now();
  const sessoes = readJson(SESSOES_FILE, []);
  const sessoesAtivas = sessoes.filter(
    (sessao) => new Date(sessao.expiraEm).getTime() > agora
  );

  if (sessoesAtivas.length !== sessoes.length) {
    writeJson(SESSOES_FILE, sessoesAtivas);
  }

  const sessao = sessoesAtivas.find((item) => item.token === tokenFinal);
  if (!sessao) {
    return null;
  }

  const usuarios = readJson(USUARIOS_FILE, []);
  const usuario = usuarios.find(
    (item) => item.id === sessao.userId && item.ativo !== false
  );
  if (!usuario) {
    return null;
  }

  return {
    token: tokenFinal,
    expiraEm: sessao.expiraEm,
    usuario: semSenha(usuario),
  };
}

function encerrarSessao(token) {
  const tokenFinal = String(token || "").trim();
  if (!tokenFinal) {
    return { ok: true };
  }

  const sessoes = readJson(SESSOES_FILE, []);
  const novasSessoes = sessoes.filter((sessao) => sessao.token !== tokenFinal);

  if (novasSessoes.length !== sessoes.length) {
    writeJson(SESSOES_FILE, novasSessoes);
  }

  return { ok: true };
}

function listarUsuarios() {
  ensureAdminUser();
  return readJson(USUARIOS_FILE, []).map(semSenha);
}

module.exports = {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  autenticar,
  cadastrarUsuario,
  encerrarSessao,
  ensureAdminUser,
  listarUsuarios,
  validarSessao,
};
