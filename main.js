const os = require("os");
const path = require("path");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");

process.env.PETICIONADOR_DATA_DIR =
  process.env.PETICIONADOR_DATA_DIR ||
  path.join(os.homedir(), "PeticionadorMultitribunalData");

const auditoria = require("./auditoria");
const certificado = require("./certificado");
const envio = require("./enviar_multitribunal");
const usuarios = require("./usuarios");

function wrapIpc(handler) {
  return async (_event, payload = {}) => {
    try {
      const data = await handler(payload);
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: error.message || "Erro interno." };
    }
  };
}

function requireSession(token) {
  const sessao = usuarios.validarSessao(token);
  if (!sessao) {
    throw new Error("Sessao invalida ou expirada.");
  }
  return sessao;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 980,
    minHeight: 720,
    title: "Peticionador Multitribunal",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle(
  "auth:register",
  wrapIpc(async (payload) => usuarios.cadastrarUsuario(payload))
);
ipcMain.handle(
  "auth:login",
  wrapIpc(async (payload) => usuarios.autenticar(payload))
);
ipcMain.handle(
  "auth:logout",
  wrapIpc(async ({ token }) => usuarios.encerrarSessao(token))
);

ipcMain.handle(
  "users:list",
  wrapIpc(async ({ token }) => {
    const sessao = requireSession(token);
    if (sessao.usuario.role !== "admin") {
      throw new Error("Apenas administradores podem listar usuarios.");
    }
    return usuarios.listarUsuarios();
  })
);

ipcMain.handle(
  "auditoria:list",
  wrapIpc(async ({ token, limit }) => {
    requireSession(token);
    return auditoria.listarEventos({ limit });
  })
);

ipcMain.handle(
  "dashboard:stats",
  wrapIpc(async ({ token }) => {
    requireSession(token);
    return auditoria.gerarResumo();
  })
);

ipcMain.handle("envio:enviar", wrapIpc((payload) => envio.enviarPeticao(payload)));
ipcMain.handle("envio:lote", wrapIpc((payload) => envio.enviarLote(payload)));
ipcMain.handle(
  "envio:lote-pdfs",
  wrapIpc((payload) => envio.enviarLotePorPdfs(payload))
);

ipcMain.handle(
  "certificado:status",
  wrapIpc(async ({ token }) => {
    requireSession(token);
    return certificado.obterStatusCertificado();
  })
);

ipcMain.handle(
  "certificado:salvar",
  wrapIpc(async ({ token, caminhoArquivo, senha }) => {
    const sessao = requireSession(token);
    return certificado.salvarCertificado({
      caminhoArquivo,
      senha,
      usuario: sessao.usuario.email,
    });
  })
);

ipcMain.handle(
  "dialog:pick-file",
  wrapIpc(async () => {
    const result = await dialog.showOpenDialog({
      title: "Selecionar arquivo para peticionamento",
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  })
);

ipcMain.handle(
  "dialog:pick-pdfs",
  wrapIpc(async () => {
    const result = await dialog.showOpenDialog({
      title: "Selecionar PDFs para envio em lote",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }
    return result.filePaths;
  })
);

ipcMain.handle(
  "dialog:pick-cert",
  wrapIpc(async () => {
    const result = await dialog.showOpenDialog({
      title: "Selecionar certificado A1",
      properties: ["openFile"],
      filters: [{ name: "Certificado A1", extensions: ["pfx", "p12"] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  })
);

app.whenReady().then(() => {
  usuarios.ensureAdminUser();
  auditoria.registrarEvento({
    tipo: "app_iniciada",
    usuario: "sistema",
    detalhes: {
      versao: app.getVersion(),
      plataforma: process.platform,
      dataDir: process.env.PETICIONADOR_DATA_DIR,
    },
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
