const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.PETICIONADOR_DATA_DIR =
  process.env.PETICIONADOR_DATA_DIR ||
  path.join(os.homedir(), "PeticionadorMultitribunalData");

const certificado = require("./certificado");

function run(command, args = []) {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      windowsHide: true,
    });
    return {
      ok: result.status === 0,
      status: result.status,
      stdout: String(result.stdout || "").trim(),
      stderr: String(result.stderr || "").trim(),
    };
  } catch (error) {
    return {
      ok: false,
      status: -1,
      stdout: "",
      stderr: error.message,
    };
  }
}

function detectPython() {
  const candidatos = [
    { cmd: process.env.PYTHON_BIN || "", args: ["-V"] },
    { cmd: "python", args: ["-V"] },
    { cmd: "py", args: ["-3", "-V"] },
    { cmd: "py", args: ["-V"] },
  ].filter((item) => String(item.cmd || "").trim());

  for (const candidato of candidatos) {
    const res = run(candidato.cmd, candidato.args);
    if (res.ok) {
      const versao = res.stdout || res.stderr || "";
      return {
        ok: true,
        command: candidato.cmd,
        argsVersion: candidato.args,
        version: versao,
      };
    }
  }

  return {
    ok: false,
    command: "",
    argsVersion: [],
    version: "",
  };
}

function checkSelenium(pyCommand) {
  if (!pyCommand) {
    return { ok: false, detail: "Python nao encontrado." };
  }

  const res = run(pyCommand, [
    "-c",
    "import importlib.util; print(bool(importlib.util.find_spec('selenium')))",
  ]);
  if (!res.ok) {
    return { ok: false, detail: res.stderr || "Falha ao validar selenium." };
  }
  const flag = String(res.stdout || "").trim().toLowerCase();
  return {
    ok: flag === "true",
    detail: flag === "true" ? "selenium instalado" : "selenium nao instalado",
  };
}

function checkBrowsers() {
  const edge = run("where", ["msedge"]);
  const chrome = run("where", ["chrome"]);
  const edgeDefaults = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter((item) => fs.existsSync(item));
  const chromeDefaults = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter((item) => fs.existsSync(item));

  const edgeWhere = edge.ok
    ? edge.stdout
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const chromeWhere = chrome.ok
    ? chrome.stdout
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const edgePaths = Array.from(new Set(edgeWhere.concat(edgeDefaults)));
  const chromePaths = Array.from(new Set(chromeWhere.concat(chromeDefaults)));

  return {
    edge: edgePaths.length > 0,
    chrome: chromePaths.length > 0,
    edgePath: edgePaths[0] || "",
    chromePath: chromePaths[0] || "",
    edgePaths,
    chromePaths,
  };
}

function checkDataDir() {
  const dataDir = String(process.env.PETICIONADOR_DATA_DIR || "").trim();
  const exists = fs.existsSync(dataDir);
  return {
    path: dataDir,
    exists,
  };
}

function main() {
  const py = detectPython();
  const selenium = checkSelenium(py.command);
  const browsers = checkBrowsers();
  const cert = certificado.obterStatusCertificado();
  const dataDir = checkDataDir();

  const checks = [
    { key: "python", ok: py.ok, detail: py.version || "python nao encontrado" },
    { key: "selenium", ok: selenium.ok, detail: selenium.detail },
    {
      key: "browser",
      ok: browsers.edge || browsers.chrome,
      detail: `edge=${browsers.edge} chrome=${browsers.chrome}`,
    },
    {
      key: "certificado",
      ok: Boolean(cert.configurado),
      detail: cert.configurado ? cert.arquivo : "certificado nao configurado",
    },
  ];

  const okGeral = checks.every((item) => item.ok);
  const payload = {
    ok: okGeral,
    checks,
    python: py,
    selenium,
    browsers,
    certificado: cert,
    dataDir,
    sugestoes: [
      !py.ok ? "Instale Python 3 e deixe no PATH." : null,
      py.ok && !selenium.ok ? "Execute: pip install -r requirements.txt" : null,
      !browsers.edge && !browsers.chrome
        ? "Instale Microsoft Edge ou Google Chrome."
        : null,
      !cert.configurado
        ? "Configure o certificado A1 no card 'Certificado A1' do app."
        : null,
    ].filter(Boolean),
  };

  console.log(JSON.stringify(payload, null, 2));
}

main();
