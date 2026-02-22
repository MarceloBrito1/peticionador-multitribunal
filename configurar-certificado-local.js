const os = require("os");
const path = require("path");
const readline = require("readline");

process.env.PETICIONADOR_DATA_DIR =
  process.env.PETICIONADOR_DATA_DIR ||
  path.join(os.homedir(), "PeticionadorMultitribunalData");

const { salvarCertificado } = require("./certificado");

function askQuestion(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(String(answer || "").trim()));
  });
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const mutableStdout = new (require("stream").Writable)({
      write(_chunk, _encoding, callback) {
        callback();
      },
    });

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });

    process.stdout.write(prompt);
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(String(answer || ""));
    });
  });
}

async function main() {
  const caminhoArg = String(process.argv[2] || "").trim();
  const usuarioArg = String(process.argv[3] || "").trim() || "local-cli";

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    let caminhoArquivo = caminhoArg;
    if (!caminhoArquivo) {
      caminhoArquivo = await askQuestion(
        rl,
        "Caminho do certificado (.pfx/.p12): "
      );
    }
    rl.close();

    if (!caminhoArquivo) {
      throw new Error("Caminho do certificado nao informado.");
    }

    const senha = await askHidden("Senha do certificado (entrada oculta): ");
    if (!senha) {
      throw new Error("Senha nao informada.");
    }

    const status = salvarCertificado({
      caminhoArquivo,
      senha,
      usuario: usuarioArg,
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          mensagem: "Certificado configurado com sucesso no armazenamento local.",
          dataDir: process.env.PETICIONADOR_DATA_DIR,
          status,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          mensagem: error.message || "Falha ao configurar certificado.",
          dataDir: process.env.PETICIONADOR_DATA_DIR,
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    try {
      rl.close();
    } catch (_error) {}
  }
}

main();
