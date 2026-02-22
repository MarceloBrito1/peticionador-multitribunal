const state = {
  token: null,
  usuario: null,
  loteArquivos: [],
};

function $(id) {
  return document.getElementById(id);
}

function ehTribunalTjsp(tribunal) {
  return tribunal === "tjsp" || tribunal === "tjsp2";
}

function setFeedback(texto, tipo = "") {
  const el = $("auth-feedback");
  el.textContent = texto;
  el.className = tipo ? `feedback ${tipo}` : "feedback";
}

function setSessionMeta() {
  const el = $("session-meta");
  if (!state.usuario) {
    el.textContent = "Sem sessao ativa.";
    return;
  }
  el.textContent = `${state.usuario.nome} (${state.usuario.role}) - ${state.usuario.email}`;
}

function parseDestinatarios(raw) {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (item.startsWith("@")) {
        return { canal: "telegram", destino: item };
      }
      return { canal: "email", destino: item };
    });
}

function parseBool(raw, fallback = false) {
  const valor = String(raw || "")
    .trim()
    .toLowerCase();
  if (!valor) {
    return fallback;
  }
  return valor === "true" || valor === "1" || valor === "sim" || valor === "yes";
}

function formatDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("pt-BR");
}

function showAppArea(ativo) {
  $("auth-section").classList.toggle("hidden", ativo);
  $("app-section").classList.toggle("hidden", !ativo);
  $("logout-btn").classList.toggle("hidden", !ativo);
}

function atualizarCamposTjsp() {
  const envioEhTjsp = ehTribunalTjsp($("tribunal").value);
  $("envio-tjsp-campos").classList.toggle("hidden", !envioEhTjsp);
  if (!envioEhTjsp) {
    $("tjsp-link-acesso").value = "";
  }

  const loteEhTjsp = ehTribunalTjsp($("lote-tribunal").value);
  $("lote-tjsp-campos").classList.toggle("hidden", !loteEhTjsp);
  if (!loteEhTjsp) {
    $("lote-tjsp-link-acesso").value = "";
  }
}

function renderStats(resumo) {
  const stats = [
    { label: "Eventos", value: resumo.totalEventos || 0 },
    { label: "Login", value: resumo.porTipo?.login || 0 },
    { label: "Envio iniciado", value: resumo.porTipo?.envio_iniciado || 0 },
    { label: "Envio concluido", value: resumo.porTipo?.envio_concluido || 0 },
  ];

  const host = $("stats-cards");
  host.innerHTML = "";

  for (const stat of stats) {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<div class="label">${stat.label}</div><div class="value">${stat.value}</div>`;
    host.appendChild(card);
  }

  window.graficos.renderResumoChart($("grafico-resumo"), resumo.porTipo || {});
}

function renderAuditoria(eventos) {
  const tbody = $("auditoria-body");
  tbody.innerHTML = "";

  if (!eventos.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="4" class="muted">Sem eventos.</td>`;
    tbody.appendChild(row);
    return;
  }

  for (const evento of eventos) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatDateTime(evento.timestamp)}</td>
      <td>${evento.tipo}</td>
      <td>${evento.usuario}</td>
      <td><code>${JSON.stringify(evento.detalhes || {})}</code></td>
    `;
    tbody.appendChild(row);
  }
}

function renderUsuarios(usuarios) {
  const card = $("usuarios-card");
  if (state.usuario?.role !== "admin") {
    card.classList.add("hidden");
    return;
  }

  card.classList.remove("hidden");
  const lista = $("usuarios-lista");
  lista.innerHTML = "";
  for (const usuario of usuarios) {
    const li = document.createElement("li");
    li.textContent = `${usuario.nome} - ${usuario.email} (${usuario.role})`;
    lista.appendChild(li);
  }
}

async function carregarPainel() {
  const [resumo, eventos] = await Promise.all([
    window.peticionadorAPI.getDashboard({ token: state.token }),
    window.peticionadorAPI.listAuditoria({ token: state.token, limit: 25 }),
  ]);
  renderStats(resumo);
  renderAuditoria(eventos);
}

async function carregarUsuarios() {
  if (state.usuario?.role !== "admin") {
    renderUsuarios([]);
    return;
  }
  const usuarios = await window.peticionadorAPI.listUsers({ token: state.token });
  renderUsuarios(usuarios);
}

function setEnvioOutput(payload) {
  $("envio-resultado").textContent = JSON.stringify(payload, null, 2);
}

function setLoteOutput(payload) {
  $("lote-resultado").textContent = JSON.stringify(payload, null, 2);
}

function setCertStatus(payload, tipo = "success") {
  const el = $("cert-status");
  if (!payload || !payload.configurado) {
    el.className = "feedback error";
    el.textContent = "Certificado A1 nao configurado.";
    return;
  }
  el.className = `feedback ${tipo}`;
  el.textContent = `Certificado ativo: ${payload.arquivo} (atualizado em ${formatDateTime(payload.atualizadoEm)})`;
}

async function carregarStatusCertificado() {
  try {
    const status = await window.peticionadorAPI.certStatus({ token: state.token });
    setCertStatus(status, "success");
  } catch (error) {
    setCertStatus(null, "error");
    $("cert-status").textContent = error.message;
  }
}

async function onLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    email: form.email.value,
    senha: form.senha.value,
  };

  try {
    const resposta = await window.peticionadorAPI.login(payload);
    state.token = resposta.token;
    state.usuario = resposta.usuario;
    setSessionMeta();
    setFeedback("Login realizado com sucesso.", "success");
    showAppArea(true);
    await Promise.all([
      carregarPainel(),
      carregarUsuarios(),
      carregarStatusCertificado(),
    ]);
  } catch (error) {
    setFeedback(error.message, "error");
  }
}

async function onRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    nome: form.nome.value,
    email: form.email.value,
    senha: form.senha.value,
    role: form.role.value,
  };

  try {
    await window.peticionadorAPI.register(payload);
    setFeedback("Usuario cadastrado. Agora faca login.", "success");
    form.reset();
  } catch (error) {
    setFeedback(error.message, "error");
  }
}

async function onLogout() {
  if (state.token) {
    await window.peticionadorAPI.logout({ token: state.token });
  }
  state.token = null;
  state.usuario = null;
  state.loteArquivos = [];
  $("lote-arquivos").value = "";
  $("lote-contagem").textContent = "";
  setSessionMeta();
  showAppArea(false);
}

async function onPickFile() {
  try {
    const arquivo = await window.peticionadorAPI.pickFile();
    if (arquivo) {
      $("arquivo").value = arquivo;
    }
  } catch (error) {
    setEnvioOutput({ erro: error.message });
  }
}

async function onPickCert() {
  try {
    const arquivo = await window.peticionadorAPI.pickCert();
    if (arquivo) {
      $("cert-arquivo").value = arquivo;
    }
  } catch (error) {
    setCertStatus(null, "error");
    $("cert-status").textContent = error.message;
  }
}

async function onSalvarCert(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    token: state.token,
    caminhoArquivo: form.arquivo.value,
    senha: form.senha.value,
  };

  try {
    const status = await window.peticionadorAPI.certSalvar(payload);
    setCertStatus(status, "success");
    form.senha.value = "";
  } catch (error) {
    setCertStatus(null, "error");
    $("cert-status").textContent = error.message;
  }
}

async function onPickPdfs() {
  try {
    const arquivos = await window.peticionadorAPI.pickPdfs();
    state.loteArquivos = arquivos;
    $("lote-arquivos").value = arquivos.join("; ");
    $("lote-contagem").textContent = `${arquivos.length} PDF(s) selecionado(s).`;
  } catch (error) {
    setLoteOutput({ erro: error.message });
  }
}

async function onEnviar(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const ehTjsp = ehTribunalTjsp(form.tribunal.value);
  const payload = {
    token: state.token,
    tribunal: form.tribunal.value,
    numeroProcesso: form.numeroProcesso.value,
    arquivo: form.arquivo.value,
    descricao: form.descricao.value,
    canalPeticionamento: ehTjsp ? form.canalPeticionamento.value : "",
    linkAcesso: ehTjsp ? form.linkAcesso.value : "",
    modoExecucao: ehTjsp ? form.modoExecucao.value : "simulado",
    confirmarProtocolo: ehTjsp ? parseBool(form.confirmarProtocolo.value, true) : true,
    destinatarios: parseDestinatarios(form.destinatarios.value),
  };

  try {
    const resultado = await window.peticionadorAPI.enviarPeticao(payload);
    setEnvioOutput(resultado);
    await carregarPainel();
  } catch (error) {
    setEnvioOutput({ erro: error.message });
  }
}

async function onEnviarLote(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const ehTjsp = ehTribunalTjsp(form.tribunal.value);
  const payload = {
    token: state.token,
    tribunal: form.tribunal.value,
    arquivos: state.loteArquivos,
    descricao: form.descricao.value,
    canalPeticionamento: ehTjsp ? form.canalPeticionamento.value : "",
    linkAcesso: ehTjsp ? form.linkAcesso.value : "",
    modoExecucao: ehTjsp ? form.modoExecucao.value : "simulado",
    confirmarProtocolo: ehTjsp ? parseBool(form.confirmarProtocolo.value, true) : true,
    destinatarios: parseDestinatarios(form.destinatarios.value),
  };

  try {
    const resultado = await window.peticionadorAPI.enviarLotePdfs(payload);
    setLoteOutput(resultado);
    await carregarPainel();
  } catch (error) {
    setLoteOutput({ erro: error.message });
  }
}

async function init() {
  $("login-form").addEventListener("submit", onLogin);
  $("register-form").addEventListener("submit", onRegister);
  $("logout-btn").addEventListener("click", onLogout);
  $("envio-form").addEventListener("submit", onEnviar);
  $("lote-form").addEventListener("submit", onEnviarLote);
  $("cert-form").addEventListener("submit", onSalvarCert);
  $("arquivo-btn").addEventListener("click", onPickFile);
  $("lote-arquivos-btn").addEventListener("click", onPickPdfs);
  $("cert-arquivo-btn").addEventListener("click", onPickCert);
  $("refresh-dashboard").addEventListener("click", carregarPainel);
  $("refresh-auditoria").addEventListener("click", carregarPainel);
  $("refresh-usuarios").addEventListener("click", carregarUsuarios);
  $("tribunal").addEventListener("change", atualizarCamposTjsp);
  $("lote-tribunal").addEventListener("change", atualizarCamposTjsp);
  atualizarCamposTjsp();
  setSessionMeta();
}

window.addEventListener("DOMContentLoaded", init);
