const ESAJ_ORIGEM = "https://esaj.tjsp.jus.br";
const ESAJ_SERVICO_PADRAO = "190090";

const EPROC_ENTRADA_PADRAO =
  "https://eproc-consulta.tjsp.jus.br/consulta_1g/externo_controlador.php?acao=tjsp@consulta_unificada_publica/consultar";
const EPROC_SERVICO_PADRAO = "https://eproc.tjsp.jus.br/eproc/";
const EPROC_SSO_HOST = "sso.tjsp.jus.br";
const EPROC_SSO_PATH = "/realms/eproc/protocol/openid-connect/auth";

const CANAIS_VALIDOS = new Set(["eproc", "esaj"]);

function decodeRepetido(valor, limite = 4) {
  let atual = String(valor || "");
  for (let i = 0; i < limite; i += 1) {
    try {
      const decodificado = decodeURIComponent(atual);
      if (decodificado === atual) {
        break;
      }
      atual = decodificado;
    } catch (_error) {
      break;
    }
  }
  return atual;
}

function normalizarCanal(canalPeticionamento) {
  const canal = String(canalPeticionamento || "")
    .trim()
    .toLowerCase();

  if (!canal) {
    return "";
  }
  if (!CANAIS_VALIDOS.has(canal)) {
    throw new Error("Canal TJSP invalido. Use 'eproc' ou 'esaj'.");
  }
  return canal;
}

function parseUrlSegura(linkAcesso) {
  const bruto = String(linkAcesso || "").trim();
  if (!bruto) {
    return null;
  }

  const candidatos = [];
  if (/^https?:\/\//i.test(bruto)) {
    candidatos.push(bruto);
  } else {
    candidatos.push(`https://${bruto}`);
  }
  candidatos.push(decodeRepetido(candidatos[0]));

  for (const candidato of candidatos) {
    try {
      return new URL(candidato);
    } catch (_error) {}
  }

  throw new Error("Link de acesso TJSP invalido.");
}

function inferirCanalPorLink(urlObj) {
  if (!urlObj) {
    return "";
  }
  const host = String(urlObj.hostname || "").toLowerCase();
  const path = String(urlObj.pathname || "").toLowerCase();
  if (host.includes("esaj.tjsp.jus.br") || host.includes("sajcas")) {
    return "esaj";
  }
  if (host === EPROC_SSO_HOST && path.startsWith("/realms/eproc/")) {
    return "eproc";
  }
  if (host.includes("eproc")) {
    return "eproc";
  }
  return "";
}

function ehLoginSsoEproc(urlObj) {
  if (!urlObj) {
    return false;
  }
  const host = String(urlObj.hostname || "").toLowerCase();
  const path = String(urlObj.pathname || "").toLowerCase();
  return host === EPROC_SSO_HOST && path.startsWith(EPROC_SSO_PATH);
}

function extrairModuloPeticionamento(pathname) {
  const path = String(pathname || "");
  const match = path.match(/^\/(petpg|petsg|petcr)(?:\/|$)/i);
  return match ? match[1].toLowerCase() : "";
}

function extrairTipoPeticao(pathname) {
  const path = String(pathname || "");
  const match = path.match(/\/peticoes\/(inicial|intermediaria)(?:\/|$)/i);
  return match ? match[1].toLowerCase() : "";
}

function extrairInstancia(urlObj) {
  if (!urlObj) {
    return "";
  }
  return String(urlObj.searchParams.get("instancia") || "")
    .trim()
    .toUpperCase();
}

function limparParametrosVolateis(urlObj) {
  const limpo = new URL(urlObj.toString());
  limpo.searchParams.delete("ticket");
  limpo.searchParams.delete("origemServidor");
  return limpo;
}

function extrairServicoParametro(valor) {
  const texto = decodeRepetido(valor).trim();
  if (!texto) {
    return null;
  }

  const matchNumerico = texto.match(/^(\d+)(?:\/api\/auth\/check)?$/i);
  if (matchNumerico) {
    return matchNumerico[1];
  }

  if (/^https?:\/\//i.test(texto)) {
    try {
      return extrairServicoDeLink(new URL(texto));
    } catch (_error) {
      return null;
    }
  }

  return null;
}

function extrairServicoDeLink(urlObj) {
  const servicoDireto = extrairServicoParametro(urlObj.searchParams.get("servico"));
  if (servicoDireto) {
    return servicoDireto;
  }

  const serviceParam = urlObj.searchParams.get("service");
  if (!serviceParam) {
    return null;
  }

  const serviceDecodificado = decodeRepetido(serviceParam);
  const servicoViaParametro = extrairServicoParametro(serviceDecodificado);
  if (servicoViaParametro) {
    return servicoViaParametro;
  }

  try {
    const serviceUrl = new URL(serviceDecodificado);
    return extrairServicoDeLink(serviceUrl);
  } catch (_error) {
    return null;
  }
}

function extrairServiceUrlDoRedirect(rawRedirectUri) {
  const texto = decodeRepetido(rawRedirectUri).trim();
  if (!texto) {
    return "";
  }

  try {
    const redirectUrl = new URL(texto);
    return `${redirectUrl.origin}/eproc/`;
  } catch (_error) {
    return "";
  }
}

function extrairModuloPeticionamentoDeLink(urlObj) {
  const moduloDireto = extrairModuloPeticionamento(urlObj.pathname);
  if (moduloDireto) {
    return moduloDireto;
  }

  const serviceParam = urlObj.searchParams.get("service");
  if (!serviceParam) {
    return "";
  }

  const serviceDecodificado = decodeRepetido(serviceParam);
  if (/^https?:\/\//i.test(serviceDecodificado)) {
    try {
      const serviceUrl = new URL(serviceDecodificado);
      return extrairModuloPeticionamento(serviceUrl.pathname);
    } catch (_error) {
      return "";
    }
  }

  return extrairModuloPeticionamento(serviceDecodificado);
}

function montarUrlsEsaj(servico) {
  const servicoEnc = encodeURIComponent(servico);
  const portalUrl = `${ESAJ_ORIGEM}/esaj/?servico=${servicoEnc}`;
  const serviceUrl = `${ESAJ_ORIGEM}/esaj/api/auth/check?servico=${servicoEnc}`;
  const loginUrl = `${ESAJ_ORIGEM}/sajcas/login?service=${encodeURIComponent(serviceUrl)}`;

  return {
    entradaUrl: loginUrl,
    portalUrl,
    serviceUrl,
    loginUrl,
  };
}

function montarFluxoPeticionamentoEsaj(linkUrl, modulo) {
  const limpo = limparParametrosVolateis(linkUrl);
  const tipoPeticao = extrairTipoPeticao(limpo.pathname);
  const instancia = extrairInstancia(limpo);
  const serviceUrl = `${ESAJ_ORIGEM}/${modulo}/j_spring_cas_security_check`;
  const loginUrl = `${ESAJ_ORIGEM}/sajcas/login?service=${encodeURIComponent(serviceUrl)}`;

  let portalUrl = limpo.toString();
  if (limpo.pathname.toLowerCase() === "/sajcas/login") {
    portalUrl = `${ESAJ_ORIGEM}/${modulo}/`;
  }

  return {
    canal: "esaj",
    entradaUrl: loginUrl,
    portalUrl,
    serviceUrl,
    loginUrl,
    linkAcessoNormalizado: loginUrl,
    linkOriginalNormalizado: limpo.toString(),
    fluxo: {
      familia: "esaj",
      tipo: tipoPeticao || "peticionamento",
      modulo,
      instancia,
    },
  };
}

function normalizarFluxoEsaj(linkUrl) {
  let servico = ESAJ_SERVICO_PADRAO;
  let linkOriginalNormalizado = "";

  if (linkUrl) {
    const linkLimpo = limparParametrosVolateis(linkUrl);
    linkOriginalNormalizado = linkLimpo.toString();
    const moduloPeticionamento = extrairModuloPeticionamentoDeLink(linkLimpo);
    if (moduloPeticionamento) {
      return montarFluxoPeticionamentoEsaj(linkLimpo, moduloPeticionamento);
    }
    servico = extrairServicoDeLink(linkLimpo) || servico;
  }

  const urls = montarUrlsEsaj(servico);
  return {
    canal: "esaj",
    ...urls,
    linkAcessoNormalizado: urls.loginUrl,
    linkOriginalNormalizado,
    fluxo: {
      familia: "esaj",
      tipo: "consulta",
      servico,
      modulo: "esaj",
    },
  };
}

function normalizarFluxoEproc(linkUrl) {
  if (linkUrl && inferirCanalPorLink(linkUrl) === "esaj") {
    throw new Error("Link e-SAJ informado para canal TJSP eproc.");
  }

  let entradaUrl = EPROC_ENTRADA_PADRAO;
  let linkOriginalNormalizado = "";
  let loginUrl = "";
  let serviceUrl = EPROC_SERVICO_PADRAO;
  let fluxo = {
    familia: "eproc",
    tipo: "portal",
    origem: "padrao",
    host: "eproc.tjsp.jus.br",
  };
  if (linkUrl) {
    const linkLimpo = limparParametrosVolateis(linkUrl);
    entradaUrl = linkLimpo.toString();
    linkOriginalNormalizado = linkLimpo.toString();
    if (ehLoginSsoEproc(linkLimpo)) {
      loginUrl = entradaUrl;
      serviceUrl =
        extrairServiceUrlDoRedirect(linkLimpo.searchParams.get("redirect_uri")) ||
        serviceUrl;
      let redirectHost = "";
      try {
        const redirectRaw = decodeRepetido(linkLimpo.searchParams.get("redirect_uri") || "");
        redirectHost = new URL(redirectRaw).hostname.toLowerCase();
      } catch (_error) {}
      fluxo = {
        familia: "eproc",
        tipo: "sso",
        origem: "sso.tjsp.jus.br",
        host: redirectHost || linkLimpo.hostname.toLowerCase(),
      };
    } else if (String(linkLimpo.hostname || "").toLowerCase().includes("eproc")) {
      serviceUrl = `${linkLimpo.origin}/eproc/`;
      fluxo = {
        familia: "eproc",
        tipo: "direto",
        origem: linkLimpo.hostname.toLowerCase(),
        host: linkLimpo.hostname.toLowerCase(),
      };
    }
  }

  return {
    canal: "eproc",
    entradaUrl,
    portalUrl: "",
    serviceUrl,
    loginUrl,
    linkAcessoNormalizado: entradaUrl,
    linkOriginalNormalizado,
    fluxo,
  };
}

function normalizarFluxoTjsp({
  canalPeticionamento = "",
  linkAcesso = "",
} = {}) {
  const canalInformado = normalizarCanal(canalPeticionamento);
  const linkUrl = parseUrlSegura(linkAcesso);
  const canalInferido = inferirCanalPorLink(linkUrl);

  if (canalInformado && canalInferido && canalInformado !== canalInferido) {
    throw new Error(
      `Canal TJSP '${canalInformado}' nao corresponde ao link informado (${canalInferido}).`
    );
  }

  const canalFinal = canalInformado || canalInferido || "eproc";
  if (canalFinal === "esaj") {
    return normalizarFluxoEsaj(linkUrl);
  }

  return normalizarFluxoEproc(linkUrl);
}

module.exports = {
  normalizarFluxoTjsp,
};
