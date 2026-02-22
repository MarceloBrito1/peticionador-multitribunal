const crypto = require("crypto");
const path = require("path");
const { spawn } = require("child_process");
const { registrarEvento } = require("./auditoria");
const { obterCredenciaisCertificado } = require("./certificado");
const { notificarResultadoEnvio } = require("./notificacoes");
const { extrairNumeroProcessoDoPdf } = require("./pdf_parser");
const { normalizarFluxoTjsp } = require("./tjsp_fluxo");
const { validarSessao } = require("./usuarios");

const ROBOS = {
  tjsp: "robo_tjsp.py",
  tjsp2: "robo_tjsp2.py",
  trf3: "robo_trf3.py",
  trt2: "robo_trt2.py",
};

const TRIBUNAL_LABEL = {
  tjsp: "TJSP",
  tjsp2: "TJSP 2 Grau",
  trf3: "TRF3",
  trt2: "TRT2",
};

function normalizarTribunal(tribunal) {
  return String(tribunal || "")
    .trim()
    .toLowerCase();
}

function gerarProtocolo(tribunal) {
  const prefixo = normalizarTribunal(tribunal).toUpperCase() || "GERAL";
  const data = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefixo}-${data}-${rand}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lerIntEnv(nome, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const bruto = String(process.env[nome] || "").trim();
  if (!bruto) {
    return fallback;
  }

  const parsed = Number.parseInt(bruto, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

function lerFloatEnv(nome, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const bruto = String(process.env[nome] || "").trim();
  if (!bruto) {
    return fallback;
  }

  const parsed = Number.parseFloat(bruto);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    return min;
  }
  if (parsed > max) {
    return max;
  }
  return parsed;
}

function obterTimeoutRoboMs(payload) {
  const padrao = payload?.modoExecucao === "real" ? 480000 : 45000;
  return lerIntEnv("PETICIONADOR_TIMEOUT_ROBO_MS", padrao, {
    min: 5000,
    max: 3600000,
  });
}

function obterPoliticaRetry(payload) {
  const modo = String(payload?.modoExecucao || "")
    .trim()
    .toLowerCase();
  const tentativasPadrao = modo === "real" ? 3 : 1;
  const tentativasMax = lerIntEnv(
    "PETICIONADOR_RETRY_MAX",
    tentativasPadrao,
    {
      min: 1,
      max: 8,
    }
  );
  const delayInicialMs = lerIntEnv("PETICIONADOR_RETRY_DELAY_MS", 2500, {
    min: 0,
    max: 120000,
  });
  const fatorBackoff = lerFloatEnv("PETICIONADOR_RETRY_BACKOFF_FACTOR", 2, {
    min: 1,
    max: 6,
  });
  const delayMaxMs = lerIntEnv("PETICIONADOR_RETRY_DELAY_MAX_MS", 60000, {
    min: 1000,
    max: 300000,
  });

  return {
    tentativasMax,
    delayInicialMs,
    fatorBackoff,
    delayMaxMs,
  };
}

function mensagemFalha(respostaRobo) {
  return String(respostaRobo?.mensagem || respostaRobo?.erroOriginal || "")
    .trim()
    .toLowerCase();
}

function falhaDefinitivaParaRetry(respostaRobo) {
  const msg = mensagemFalha(respostaRobo);
  if (!msg) {
    return false;
  }

  const definitivas = [
    "canal tjsp invalido",
    "fluxo e-saj",
    "fluxo eproc sem url",
    "certificado a1 nao informado",
    "arquivo da peticao nao informado",
    "arquivo da peticao nao encontrado",
    "nao foi possivel localizar campo de upload",
    "nao foi possivel localizar botao de protocolo",
    "numero do processo",
  ];
  return definitivas.some((token) => msg.includes(token));
}

function deveRepetirFalha(respostaRobo) {
  if (!respostaRobo || respostaRobo.ok) {
    return false;
  }
  if (falhaDefinitivaParaRetry(respostaRobo)) {
    return false;
  }
  return true;
}

function executarProcesso(comando, args, stdinPayload, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const processo = spawn(comando, args, {
      cwd: __dirname,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let finalizado = false;

    const timer = setTimeout(() => {
      if (!finalizado) {
        finalizado = true;
        processo.kill();
        reject(new Error(`Timeout ao executar: ${comando}`));
      }
    }, timeoutMs);

    processo.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    processo.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    processo.on("error", (error) => {
      if (!finalizado) {
        finalizado = true;
        clearTimeout(timer);
        reject(error);
      }
    });

    processo.on("close", (code) => {
      if (finalizado) {
        return;
      }
      finalizado = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(
          new Error(
            `Falha no robo (${comando}) com codigo ${code}. STDERR: ${stderr || "n/a"}`
          )
        );
        return;
      }

      resolve({ stdout, stderr });
    });

    if (stdinPayload) {
      processo.stdin.write(stdinPayload);
    }
    processo.stdin.end();
  });
}

function parseRoboOutput(stdout, fallbackPayload) {
  const output = String(stdout || "").trim();
  if (!output) {
    return {
      ok: true,
      simulado: true,
      mensagem: "Robo executado sem retorno explicito.",
      protocolo: fallbackPayload.protocolo,
      tribunal: fallbackPayload.tribunal,
    };
  }

  const linhas = output.split(/\r?\n/).filter(Boolean);
  const ultimaLinha = linhas[linhas.length - 1];

  try {
    return JSON.parse(ultimaLinha);
  } catch (_error) {
    return {
      ok: true,
      simulado: true,
      mensagem: output.slice(0, 400),
      protocolo: fallbackPayload.protocolo,
      tribunal: fallbackPayload.tribunal,
    };
  }
}

async function executarRoboPython(scriptName, payload) {
  const scriptPath = path.join(__dirname, scriptName);
  const payloadSerializado = JSON.stringify(payload);
  const timeoutMs = obterTimeoutRoboMs(payload);
  const candidatos = [];

  if ((process.env.PYTHON_BIN || "").trim()) {
    candidatos.push({
      comando: process.env.PYTHON_BIN,
      args: [scriptPath],
    });
  }

  candidatos.push({ comando: "python", args: [scriptPath] });
  candidatos.push({ comando: "py", args: ["-3", scriptPath] });
  candidatos.push({ comando: "py", args: [scriptPath] });

  let ultimoErro = null;
  for (const candidato of candidatos) {
    try {
      const { stdout } = await executarProcesso(
        candidato.comando,
        candidato.args,
        payloadSerializado,
        timeoutMs
      );
      return parseRoboOutput(stdout, payload);
    } catch (error) {
      ultimoErro = error;
    }
  }

  return {
    ok: false,
    simulado: true,
    mensagem:
      "Nao foi possivel executar robo Python. Configure python/py no PATH ou PYTHON_BIN.",
    tribunal: payload.tribunal,
    protocolo: payload.protocolo,
    erroOriginal: ultimoErro ? ultimoErro.message : "Erro desconhecido",
  };
}

function validarEntrada({ tribunal, numeroProcesso, arquivo }) {
  const tribunalFinal = normalizarTribunal(tribunal);
  if (!tribunalFinal || !ROBOS[tribunalFinal]) {
    throw new Error("Tribunal invalido. Use: tjsp, tjsp2, trf3 ou trt2.");
  }
  if (!String(numeroProcesso || "").trim()) {
    throw new Error("Numero do processo e obrigatorio.");
  }
  if (!String(arquivo || "").trim()) {
    throw new Error("Arquivo e obrigatorio.");
  }

  return tribunalFinal;
}

function usaFluxoTjsp(tribunal) {
  return tribunal === "tjsp" || tribunal === "tjsp2";
}

async function enviarPeticao({
  token,
  tribunal,
  numeroProcesso,
  arquivo,
  descricao = "",
  canalPeticionamento = "",
  linkAcesso = "",
  modoExecucao = "",
  confirmarProtocolo = true,
  destinatarios = [],
}) {
  const sessao = validarSessao(token);
  if (!sessao) {
    throw new Error("Sessao invalida ou expirada.");
  }

  const certificado = obterCredenciaisCertificado();
  const tribunalFinal = validarEntrada({ tribunal, numeroProcesso, arquivo });
  const protocolo = gerarProtocolo(tribunalFinal);
  const fluxoTjsp = usaFluxoTjsp(tribunalFinal)
    ? normalizarFluxoTjsp({ canalPeticionamento, linkAcesso })
    : null;

  const payloadRobo = {
    protocolo,
    tribunal: tribunalFinal,
    numeroProcesso: String(numeroProcesso).trim(),
    arquivo: String(arquivo).trim(),
    descricao: String(descricao || "").trim(),
    usuario: sessao.usuario.email,
    modoExecucao: String(modoExecucao || "").trim().toLowerCase() || "simulado",
    confirmarProtocolo: Boolean(confirmarProtocolo),
    certificado: {
      arquivo: certificado.arquivo,
      senha: certificado.senha,
    },
    timestamp: new Date().toISOString(),
  };

  if (fluxoTjsp) {
    payloadRobo.canalPeticionamento = fluxoTjsp.canal;
    payloadRobo.linkAcessoNormalizado = fluxoTjsp.linkAcessoNormalizado;
    payloadRobo.tjsp = {
      canal: fluxoTjsp.canal,
      entradaUrl: fluxoTjsp.entradaUrl,
      portalUrl: fluxoTjsp.portalUrl,
      serviceUrl: fluxoTjsp.serviceUrl,
      loginUrl: fluxoTjsp.loginUrl,
      fluxo: fluxoTjsp.fluxo || {},
    };
  }

  registrarEvento({
    tipo: "envio_iniciado",
    usuario: sessao.usuario.email,
    detalhes: {
      protocolo,
      tribunal: tribunalFinal,
      numeroProcesso: payloadRobo.numeroProcesso,
      certificado: path.basename(certificado.arquivo),
      canalPeticionamento: fluxoTjsp ? fluxoTjsp.canal : null,
      linkAcessoNormalizado: fluxoTjsp ? fluxoTjsp.linkAcessoNormalizado : null,
      fluxoTjsp: fluxoTjsp ? fluxoTjsp.fluxo || null : null,
      modoExecucao: payloadRobo.modoExecucao,
      confirmarProtocolo: payloadRobo.confirmarProtocolo,
    },
  });

  const politicaRetry = obterPoliticaRetry(payloadRobo);
  let respostaRobo = null;
  let tentativaAtual = 0;
  const historicoTentativas = [];
  let delayAtual = politicaRetry.delayInicialMs;

  for (let tentativa = 1; tentativa <= politicaRetry.tentativasMax; tentativa += 1) {
    tentativaAtual = tentativa;
    registrarEvento({
      tipo: "envio_tentativa_iniciada",
      usuario: sessao.usuario.email,
      detalhes: {
        protocolo,
        tribunal: tribunalFinal,
        tentativa,
        tentativasMax: politicaRetry.tentativasMax,
        modoExecucao: payloadRobo.modoExecucao,
      },
    });

    respostaRobo = await executarRoboPython(ROBOS[tribunalFinal], payloadRobo);
    historicoTentativas.push({
      tentativa,
      ok: Boolean(respostaRobo.ok),
      mensagem: String(respostaRobo.mensagem || "").slice(0, 500),
      statusExecucao: respostaRobo.statusExecucao || null,
      timestamp: new Date().toISOString(),
    });

    if (respostaRobo.ok || tentativa >= politicaRetry.tentativasMax) {
      break;
    }
    if (!deveRepetirFalha(respostaRobo)) {
      break;
    }

    registrarEvento({
      tipo: "envio_tentativa_reprocesso",
      usuario: sessao.usuario.email,
      detalhes: {
        protocolo,
        tribunal: tribunalFinal,
        tentativaFalhou: tentativa,
        proximaTentativa: tentativa + 1,
        delayMs: delayAtual,
        mensagem: String(respostaRobo.mensagem || "").slice(0, 300),
      },
    });

    if (delayAtual > 0) {
      await delay(delayAtual);
      delayAtual = Math.min(
        Math.round(delayAtual * politicaRetry.fatorBackoff),
        politicaRetry.delayMaxMs
      );
    }
  }

  respostaRobo = respostaRobo || {
    ok: false,
    mensagem: "Robo sem resposta valida.",
    tribunal: tribunalFinal,
    protocolo,
  };
  respostaRobo.tentativaAtual = tentativaAtual;
  respostaRobo.tentativasExecutadas = historicoTentativas.length;
  respostaRobo.historicoTentativas = historicoTentativas;

  const status = respostaRobo.ok ? "sucesso" : "falha";

  const resultado = {
    ok: Boolean(respostaRobo.ok),
    status,
    protocolo,
    tribunal: tribunalFinal,
    tribunalLabel: TRIBUNAL_LABEL[tribunalFinal],
    numeroProcesso: payloadRobo.numeroProcesso,
    canalPeticionamento: fluxoTjsp ? fluxoTjsp.canal : null,
    linkAcessoNormalizado: fluxoTjsp ? fluxoTjsp.linkAcessoNormalizado : null,
    fluxoTjsp: fluxoTjsp ? fluxoTjsp.fluxo || null : null,
    modoExecucao: payloadRobo.modoExecucao,
    confirmarProtocolo: payloadRobo.confirmarProtocolo,
    tentativasExecutadas: historicoTentativas.length,
    tentativaFinal: tentativaAtual,
    respostaRobo,
    concluidoEm: new Date().toISOString(),
  };

  registrarEvento({
    tipo: resultado.ok ? "envio_concluido" : "envio_falhou",
    usuario: sessao.usuario.email,
    detalhes: {
      protocolo: resultado.protocolo,
      status: resultado.status,
      tribunal: resultado.tribunal,
      numeroProcesso: resultado.numeroProcesso,
      tentativasExecutadas: resultado.tentativasExecutadas,
      tentativaFinal: resultado.tentativaFinal,
    },
  });

  const notificacoes = await notificarResultadoEnvio({
    destinatarios,
    resultado,
  });

  return {
    ...resultado,
    notificacoes,
  };
}

async function enviarLote({ token, itens = [] }) {
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new Error("Lote vazio.");
  }

  const resultados = [];
  for (const item of itens) {
    const resultado = await enviarPeticao({ token, ...item });
    resultados.push(resultado);
  }

  return {
    ok: resultados.every((item) => item.ok),
    total: resultados.length,
    resultados,
  };
}

async function enviarLotePorPdfs({
  token,
  tribunal,
  arquivos = [],
  descricao = "",
  canalPeticionamento = "",
  linkAcesso = "",
  modoExecucao = "",
  confirmarProtocolo = true,
  destinatarios = [],
}) {
  const sessao = validarSessao(token);
  if (!sessao) {
    throw new Error("Sessao invalida ou expirada.");
  }
  if (!Array.isArray(arquivos) || arquivos.length === 0) {
    throw new Error("Selecione ao menos um PDF.");
  }

  const resultados = [];
  for (const arquivo of arquivos) {
    try {
      const numeroProcesso = await extrairNumeroProcessoDoPdf(arquivo);
      const resultadoEnvio = await enviarPeticao({
        token,
        tribunal,
        numeroProcesso,
        arquivo,
        descricao,
        canalPeticionamento,
        linkAcesso,
        modoExecucao,
        confirmarProtocolo,
        destinatarios,
      });
      resultados.push({
        ok: true,
        arquivo,
        numeroProcesso,
        resultadoEnvio,
      });
    } catch (error) {
      registrarEvento({
        tipo: "envio_pdf_falhou",
        usuario: sessao.usuario.email,
        detalhes: {
          arquivo,
          erro: error.message,
        },
      });
      resultados.push({
        ok: false,
        arquivo,
        erro: error.message,
      });
    }
  }

  return {
    ok: resultados.every((item) => item.ok),
    total: resultados.length,
    sucesso: resultados.filter((item) => item.ok).length,
    falha: resultados.filter((item) => !item.ok).length,
    resultados,
  };
}

module.exports = {
  enviarLote,
  enviarLotePorPdfs,
  enviarPeticao,
};
