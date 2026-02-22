const fs = require("fs");
const path = require("path");

function cloneDefault(value) {
  return JSON.parse(JSON.stringify(value));
}

function getDataDir() {
  const configured = (process.env.PETICIONADOR_DATA_DIR || "").trim();
  const baseDir = configured || path.join(process.cwd(), "data");
  fs.mkdirSync(baseDir, { recursive: true });
  return baseDir;
}

function resolveDataPath(fileName) {
  return path.join(getDataDir(), fileName);
}

function ensureJsonFile(fileName, defaultValue) {
  const filePath = resolveDataPath(fileName);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), "utf8");
  }
  return filePath;
}

function readJson(fileName, defaultValue) {
  const initialValue = cloneDefault(defaultValue);
  const filePath = ensureJsonFile(fileName, initialValue);

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) {
      return cloneDefault(defaultValue);
    }
    return JSON.parse(raw);
  } catch (_error) {
    const resetValue = cloneDefault(defaultValue);
    fs.writeFileSync(filePath, JSON.stringify(resetValue, null, 2), "utf8");
    return resetValue;
  }
}

function writeJson(fileName, value) {
  const filePath = resolveDataPath(fileName);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
  return filePath;
}

module.exports = {
  getDataDir,
  readJson,
  resolveDataPath,
  writeJson,
};
