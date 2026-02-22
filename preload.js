const { contextBridge, ipcRenderer } = require("electron");

async function invoke(channel, payload = {}) {
  const response = await ipcRenderer.invoke(channel, payload);
  if (!response || typeof response !== "object") {
    throw new Error("Resposta invalida do processo principal.");
  }
  if (!response.ok) {
    throw new Error(response.error || "Falha na operacao.");
  }
  return response.data;
}

contextBridge.exposeInMainWorld("peticionadorAPI", {
  register: (payload) => invoke("auth:register", payload),
  login: (payload) => invoke("auth:login", payload),
  logout: (payload) => invoke("auth:logout", payload),
  listUsers: (payload) => invoke("users:list", payload),
  listAuditoria: (payload) => invoke("auditoria:list", payload),
  getDashboard: (payload) => invoke("dashboard:stats", payload),
  enviarPeticao: (payload) => invoke("envio:enviar", payload),
  enviarLote: (payload) => invoke("envio:lote", payload),
  enviarLotePdfs: (payload) => invoke("envio:lote-pdfs", payload),
  certStatus: (payload) => invoke("certificado:status", payload),
  certSalvar: (payload) => invoke("certificado:salvar", payload),
  pickFile: () => invoke("dialog:pick-file"),
  pickPdfs: () => invoke("dialog:pick-pdfs"),
  pickCert: () => invoke("dialog:pick-cert"),
});
