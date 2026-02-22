const fs = require("fs");
const path = require("path");

process.env.PETICIONADOR_DATA_DIR = path.join(__dirname, ".local-smoke-data");

const usuarios = require("./usuarios");
const certificado = require("./certificado");
const envio = require("./enviar_multitribunal");
const auditoria = require("./auditoria");

async function run() {
  fs.mkdirSync(process.env.PETICIONADOR_DATA_DIR, { recursive: true });

  const certMockPath = path.join(process.env.PETICIONADOR_DATA_DIR, "mock-cert.pfx");
  fs.writeFileSync(certMockPath, "CERTIFICADO MOCK", "utf8");

  usuarios.ensureAdminUser();
  const login = usuarios.autenticar({
    email: usuarios.ADMIN_EMAIL,
    senha: usuarios.ADMIN_PASSWORD,
  });

  certificado.salvarCertificado({
    caminhoArquivo: certMockPath,
    senha: "senha-mock",
    usuario: login.usuario.email,
  });

  const resultado = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao.pdf",
    descricao: "Smoke test",
    destinatarios: [{ canal: "email", destino: "dev@local" }],
  });

  const resumo = auditoria.gerarResumo();
  console.log(
    JSON.stringify(
      {
        login: login.usuario.email,
        certificado: certificado.obterStatusCertificado(),
        envio: {
          ok: resultado.ok,
          status: resultado.status,
          protocolo: resultado.protocolo,
        },
        totalEventos: resumo.totalEventos,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
