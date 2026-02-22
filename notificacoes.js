const { registrarEvento } = require("./auditoria");

async function enviarNotificacao({ canal, destino, mensagem }) {
  const canalFinal = String(canal || "").trim().toLowerCase();
  const destinoFinal = String(destino || "").trim();
  const mensagemFinal = String(mensagem || "").trim();

  if (!canalFinal || !destinoFinal || !mensagemFinal) {
    throw new Error("Canal, destino e mensagem sao obrigatorios.");
  }

  const ticket = `ntf_${Date.now().toString(36)}`;
  registrarEvento({
    tipo: "notificacao_enviada",
    usuario: "sistema",
    detalhes: {
      canal: canalFinal,
      destino: destinoFinal,
      ticket,
      preview: mensagemFinal.slice(0, 140),
    },
  });

  return {
    ok: true,
    canal: canalFinal,
    destino: destinoFinal,
    ticket,
    enviadoEm: new Date().toISOString(),
  };
}

async function notificarResultadoEnvio({ destinatarios = [], resultado }) {
  if (!Array.isArray(destinatarios) || destinatarios.length === 0) {
    return { ok: true, enviadas: [], ignoradas: 0 };
  }

  const enviadas = [];
  let ignoradas = 0;
  const mensagem = `Resultado do protocolo ${resultado.protocolo}: ${resultado.status}`;

  for (const item of destinatarios) {
    const canal =
      typeof item === "object" && item !== null
        ? item.canal
        : String(item).startsWith("@")
          ? "telegram"
          : "email";

    const destino =
      typeof item === "object" && item !== null ? item.destino : String(item);

    if (!canal || !destino) {
      ignoradas += 1;
      continue;
    }

    try {
      const resposta = await enviarNotificacao({ canal, destino, mensagem });
      enviadas.push(resposta);
    } catch (_error) {
      ignoradas += 1;
    }
  }

  return {
    ok: true,
    enviadas,
    ignoradas,
  };
}

module.exports = {
  enviarNotificacao,
  notificarResultadoEnvio,
};
