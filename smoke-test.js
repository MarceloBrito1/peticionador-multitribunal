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

  const resultadoEsaj = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao-esaj.pdf",
    descricao: "Smoke test e-SAJ",
    canalPeticionamento: "esaj",
    linkAcesso:
      "https://esaj.tjsp.jus.br/esaj/?servico=190090%2Fapi%2Fauth%2Fcheck&ticket=ST-123&origemServidor=abc",
  });

  const resultadoEsajIntermediaria = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao-esaj-intermediaria.pdf",
    descricao: "Smoke test e-SAJ peticao intermediaria 1 instancia",
    canalPeticionamento: "esaj",
    linkAcesso:
      "https://esaj.tjsp.jus.br/petpg/peticoes/intermediaria/275858/9f841236-474c-4b1f-b356-763e08e17ec1?instancia=PG",
  });

  const resultadoEsajInicial = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao-esaj-inicial.pdf",
    descricao: "Smoke test e-SAJ peticao inicial 1 instancia",
    canalPeticionamento: "esaj",
    linkAcesso:
      "https://esaj.tjsp.jus.br/petpg/peticoes/inicial/275858/571d837e-d9b0-4cd8-b8c6-89ec0b964476?instancia=PG",
  });

  const resultadoEsajInicial2Instancia = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao-esaj-inicial-2g.pdf",
    descricao: "Smoke test e-SAJ peticao inicial 2 instancia",
    canalPeticionamento: "esaj",
    linkAcesso:
      "https://esaj.tjsp.jus.br/petsg/peticoes/inicial/275858/a6b3ad1f-d83a-4d0b-8fd6-1690635d36e1?instancia=SG",
  });

  const resultadoEsajInicial2InstanciaTjsp2 = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp2",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao-esaj-inicial-2g-tjsp2.pdf",
    descricao: "Smoke test e-SAJ peticao inicial 2 instancia via TJSP2",
    canalPeticionamento: "esaj",
    linkAcesso:
      "https://esaj.tjsp.jus.br/petsg/peticoes/inicial/275858/a6b3ad1f-d83a-4d0b-8fd6-1690635d36e1?instancia=SG",
  });

  const resultadoEsajIntermediaria2Instancia = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao-esaj-intermediaria-2g.pdf",
    descricao: "Smoke test e-SAJ peticao intermediaria 2 instancia",
    canalPeticionamento: "esaj",
    linkAcesso:
      "https://esaj.tjsp.jus.br/petsg/peticoes/intermediaria/275858/a34bdf2c-7cbb-4846-801d-b4d543ed362f?instancia=SG",
  });

  const resultadoEsajIntermediaria2InstanciaTjsp2 = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp2",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao-esaj-intermediaria-2g-tjsp2.pdf",
    descricao: "Smoke test e-SAJ peticao intermediaria 2 instancia via TJSP2",
    canalPeticionamento: "esaj",
    linkAcesso:
      "https://esaj.tjsp.jus.br/petsg/peticoes/intermediaria/275858/a34bdf2c-7cbb-4846-801d-b4d543ed362f?instancia=SG",
  });

  const resultadoEsajInicialColegioRecursal = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao-esaj-inicial-cr.pdf",
    descricao: "Smoke test e-SAJ peticao inicial colegio recursal",
    canalPeticionamento: "esaj",
    linkAcesso:
      "https://esaj.tjsp.jus.br/petcr/peticoes/inicial/275858/dfb90b07-5c4f-4e3a-87e0-6e9239faee10?instancia=CR",
  });

  const resultadoEsajInicialColegioRecursalTjsp2 = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp2",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao-esaj-inicial-cr-tjsp2.pdf",
    descricao: "Smoke test e-SAJ peticao inicial colegio recursal via TJSP2",
    canalPeticionamento: "esaj",
    linkAcesso:
      "https://esaj.tjsp.jus.br/petcr/peticoes/inicial/275858/dfb90b07-5c4f-4e3a-87e0-6e9239faee10?instancia=CR",
  });

  const resultadoEsajIntermediariaColegioRecursal = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao-esaj-intermediaria-cr.pdf",
    descricao: "Smoke test e-SAJ peticao intermediaria colegio recursal",
    canalPeticionamento: "esaj",
    linkAcesso:
      "https://esaj.tjsp.jus.br/petcr/peticoes/intermediaria/275858/72e08758-d277-4cb5-8ba6-e739f8189c83?instancia=CR",
  });

  const resultadoEsajIntermediariaColegioRecursalTjsp2 = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp2",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao-esaj-intermediaria-cr-tjsp2.pdf",
    descricao: "Smoke test e-SAJ peticao intermediaria colegio recursal via TJSP2",
    canalPeticionamento: "esaj",
    linkAcesso:
      "https://esaj.tjsp.jus.br/petcr/peticoes/intermediaria/275858/72e08758-d277-4cb5-8ba6-e739f8189c83?instancia=CR",
  });

  const resultadoEprocSso = await envio.enviarPeticao({
    token: login.token,
    tribunal: "tjsp",
    numeroProcesso: "0001234-56.2024.8.26.0100",
    arquivo: "C:/tmp/peticao-eproc-sso.pdf",
    descricao: "Smoke test eproc SSO",
    canalPeticionamento: "eproc",
    linkAcesso:
      "https://sso.tjsp.jus.br/realms/eproc/protocol/openid-connect/auth?kc_idp_hint=tjsp&eproc_client_id=eproc1g.tjsp.jus.br&response_type=code&redirect_uri=https%3A%2F%2Feproc1g.tjsp.jus.br%2Feproc%2Fexterno_controlador.php%3Facao%3DSSO%2Fcallback&client_id=eproc1g.tjsp.jus.br&nonce=382d9ed11ee94cc0bfcdebaafbadaa27&state=043d6716a7a3eda76c72b1c74b1fc35d&scope=profile+openid",
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
        envioEsaj: {
          ok: resultadoEsaj.ok,
          status: resultadoEsaj.status,
          canal: resultadoEsaj.canalPeticionamento,
          link: resultadoEsaj.linkAcessoNormalizado,
          protocolo: resultadoEsaj.protocolo,
        },
        envioEsajIntermediaria: {
          ok: resultadoEsajIntermediaria.ok,
          status: resultadoEsajIntermediaria.status,
          canal: resultadoEsajIntermediaria.canalPeticionamento,
          link: resultadoEsajIntermediaria.linkAcessoNormalizado,
          protocolo: resultadoEsajIntermediaria.protocolo,
        },
        envioEsajInicial: {
          ok: resultadoEsajInicial.ok,
          status: resultadoEsajInicial.status,
          canal: resultadoEsajInicial.canalPeticionamento,
          link: resultadoEsajInicial.linkAcessoNormalizado,
          protocolo: resultadoEsajInicial.protocolo,
        },
        envioEsajInicial2Instancia: {
          ok: resultadoEsajInicial2Instancia.ok,
          status: resultadoEsajInicial2Instancia.status,
          canal: resultadoEsajInicial2Instancia.canalPeticionamento,
          link: resultadoEsajInicial2Instancia.linkAcessoNormalizado,
          protocolo: resultadoEsajInicial2Instancia.protocolo,
        },
        envioEsajInicial2InstanciaTjsp2: {
          ok: resultadoEsajInicial2InstanciaTjsp2.ok,
          status: resultadoEsajInicial2InstanciaTjsp2.status,
          tribunal: resultadoEsajInicial2InstanciaTjsp2.tribunal,
          canal: resultadoEsajInicial2InstanciaTjsp2.canalPeticionamento,
          link: resultadoEsajInicial2InstanciaTjsp2.linkAcessoNormalizado,
          protocolo: resultadoEsajInicial2InstanciaTjsp2.protocolo,
        },
        envioEsajIntermediaria2Instancia: {
          ok: resultadoEsajIntermediaria2Instancia.ok,
          status: resultadoEsajIntermediaria2Instancia.status,
          canal: resultadoEsajIntermediaria2Instancia.canalPeticionamento,
          link: resultadoEsajIntermediaria2Instancia.linkAcessoNormalizado,
          protocolo: resultadoEsajIntermediaria2Instancia.protocolo,
        },
        envioEsajIntermediaria2InstanciaTjsp2: {
          ok: resultadoEsajIntermediaria2InstanciaTjsp2.ok,
          status: resultadoEsajIntermediaria2InstanciaTjsp2.status,
          tribunal: resultadoEsajIntermediaria2InstanciaTjsp2.tribunal,
          canal: resultadoEsajIntermediaria2InstanciaTjsp2.canalPeticionamento,
          link: resultadoEsajIntermediaria2InstanciaTjsp2.linkAcessoNormalizado,
          protocolo: resultadoEsajIntermediaria2InstanciaTjsp2.protocolo,
        },
        envioEsajInicialColegioRecursal: {
          ok: resultadoEsajInicialColegioRecursal.ok,
          status: resultadoEsajInicialColegioRecursal.status,
          canal: resultadoEsajInicialColegioRecursal.canalPeticionamento,
          link: resultadoEsajInicialColegioRecursal.linkAcessoNormalizado,
          protocolo: resultadoEsajInicialColegioRecursal.protocolo,
        },
        envioEsajInicialColegioRecursalTjsp2: {
          ok: resultadoEsajInicialColegioRecursalTjsp2.ok,
          status: resultadoEsajInicialColegioRecursalTjsp2.status,
          tribunal: resultadoEsajInicialColegioRecursalTjsp2.tribunal,
          canal: resultadoEsajInicialColegioRecursalTjsp2.canalPeticionamento,
          link: resultadoEsajInicialColegioRecursalTjsp2.linkAcessoNormalizado,
          protocolo: resultadoEsajInicialColegioRecursalTjsp2.protocolo,
        },
        envioEsajIntermediariaColegioRecursal: {
          ok: resultadoEsajIntermediariaColegioRecursal.ok,
          status: resultadoEsajIntermediariaColegioRecursal.status,
          canal: resultadoEsajIntermediariaColegioRecursal.canalPeticionamento,
          link: resultadoEsajIntermediariaColegioRecursal.linkAcessoNormalizado,
          protocolo: resultadoEsajIntermediariaColegioRecursal.protocolo,
        },
        envioEsajIntermediariaColegioRecursalTjsp2: {
          ok: resultadoEsajIntermediariaColegioRecursalTjsp2.ok,
          status: resultadoEsajIntermediariaColegioRecursalTjsp2.status,
          tribunal: resultadoEsajIntermediariaColegioRecursalTjsp2.tribunal,
          canal: resultadoEsajIntermediariaColegioRecursalTjsp2.canalPeticionamento,
          link: resultadoEsajIntermediariaColegioRecursalTjsp2.linkAcessoNormalizado,
          protocolo: resultadoEsajIntermediariaColegioRecursalTjsp2.protocolo,
        },
        envioEprocSso: {
          ok: resultadoEprocSso.ok,
          status: resultadoEprocSso.status,
          canal: resultadoEprocSso.canalPeticionamento,
          link: resultadoEprocSso.linkAcessoNormalizado,
          protocolo: resultadoEprocSso.protocolo,
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
