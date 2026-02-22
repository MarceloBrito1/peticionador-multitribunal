import json
import os
import random
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse


CANAIS_VALIDOS = {"eproc", "esaj"}
MODOS_VALIDOS = {"simulado", "real", "real_assistido"}

TIMEOUT_LOGIN_PADRAO_SEGUNDOS = 240
TIMEOUT_ETAPA_PADRAO_SEGUNDOS = 60
AUTO_SELECT_CERT_ARG = (
    '--auto-select-certificate-for-urls=[{"pattern":"https://*.tjsp.jus.br","filter":{}}]'
)


def carregar_payload() -> Dict[str, Any]:
    bruto = sys.stdin.read().strip()
    if not bruto and len(sys.argv) > 1:
        bruto = sys.argv[1]

    if not bruto:
        return {}

    try:
        return json.loads(bruto)
    except json.JSONDecodeError:
        return {}


def texto_limpo(valor: Any) -> str:
    return str(valor or "").strip()


def agora_iso_utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def bool_padrao(valor: Any, padrao: bool = False) -> bool:
    if isinstance(valor, bool):
        return valor
    texto = texto_limpo(valor).lower()
    if not texto:
        return padrao
    return texto in {"1", "true", "sim", "yes", "y", "on"}


def inteiro_env(nome: str, padrao: int) -> int:
    try:
        return int(os.environ.get(nome, "").strip() or padrao)
    except ValueError:
        return padrao


def normalizar_canal(payload: Dict[str, Any]) -> str:
    tjsp = payload.get("tjsp", {})
    canal = texto_limpo(payload.get("canalPeticionamento") or tjsp.get("canal")).lower()
    if not canal:
        canal = "eproc"
    if canal not in CANAIS_VALIDOS:
        raise ValueError("Canal TJSP invalido no payload. Use 'eproc' ou 'esaj'.")
    return canal


def normalizar_modo_execucao(payload: Dict[str, Any]) -> str:
    modo = texto_limpo(payload.get("modoExecucao")).lower() or "simulado"
    if modo not in MODOS_VALIDOS:
        raise ValueError("Modo de execucao invalido. Use 'simulado' ou 'real'.")
    if modo == "real_assistido":
        return "real"
    return modo


def montar_dados_acesso(payload: Dict[str, Any], canal: str) -> Dict[str, str]:
    tjsp = payload.get("tjsp", {})
    entrada_url = texto_limpo(tjsp.get("entradaUrl") or payload.get("linkAcessoNormalizado"))
    portal_url = texto_limpo(tjsp.get("portalUrl"))
    service_url = texto_limpo(tjsp.get("serviceUrl"))
    login_url = texto_limpo(tjsp.get("loginUrl"))

    if canal == "esaj":
        if not login_url:
            login_url = entrada_url
        if not entrada_url:
            entrada_url = login_url
        if not login_url:
            raise ValueError("Fluxo e-SAJ sem URL de login.")
        if not service_url:
            raise ValueError("Fluxo e-SAJ sem URL de service/auth-check.")
    else:
        if not entrada_url:
            raise ValueError("Fluxo eproc sem URL de entrada.")
        if not service_url:
            service_url = entrada_url
        if not login_url:
            login_url = entrada_url

    return {
        "canal": canal,
        "entradaUrl": entrada_url,
        "portalUrl": portal_url,
        "serviceUrl": service_url,
        "loginUrl": login_url,
    }


def executar_powershell(script: str, *args: str, timeout: int = 90) -> subprocess.CompletedProcess:
    comando = ["powershell", "-NoProfile", "-NonInteractive", "-Command", script, *args]
    return subprocess.run(
        comando,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def importar_certificado_a1_windows(caminho_arquivo: str, senha: str) -> Dict[str, Any]:
    if os.name != "nt":
        return {"importado": False, "thumbprint": "", "mensagem": "Importacao automatica suportada apenas no Windows."}

    if not bool_padrao(os.environ.get("PETICIONADOR_IMPORTAR_CERT_A1", "1"), True):
        return {"importado": False, "thumbprint": "", "mensagem": "Importacao automatica desabilitada por configuracao."}

    script = (
        "$ErrorActionPreference='Stop';"
        "$pfxPath=$args[0];"
        "$senha=$args[1];"
        "$secure=ConvertTo-SecureString -String $senha -AsPlainText -Force;"
        "$cert=Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation Cert:\\CurrentUser\\My -Password $secure -Exportable;"
        "if(-not $cert){ throw 'Falha ao importar certificado'; };"
        "$cert.Thumbprint"
    )

    resultado = executar_powershell(script, caminho_arquivo, senha, timeout=120)
    if resultado.returncode != 0:
        raise RuntimeError("Falha ao importar certificado A1 no Windows (CurrentUser\\My).")

    thumbprint = texto_limpo(resultado.stdout).splitlines()[0].strip() if resultado.stdout else ""
    return {
        "importado": True,
        "thumbprint": thumbprint,
        "mensagem": "Certificado A1 importado no repositorio local do usuario.",
    }


def remover_certificado_windows(thumbprint: str) -> None:
    if os.name != "nt":
        return
    thumb = texto_limpo(thumbprint)
    if not thumb:
        return
    if not bool_padrao(os.environ.get("PETICIONADOR_REMOVER_CERT_A1", "0"), False):
        return

    script = (
        "$ErrorActionPreference='Stop';"
        "$thumb=$args[0];"
        "$alvo='Cert:\\CurrentUser\\My\\'+$thumb;"
        "if(Test-Path $alvo){ Remove-Item -Path $alvo -Force; };"
        "Write-Output 'ok';"
    )
    executar_powershell(script, thumb, timeout=60)


def criar_driver_selenium(headless: bool) -> Tuple[Any, str]:
    try:
        from selenium import webdriver
        from selenium.common.exceptions import WebDriverException
        from selenium.webdriver.chrome.options import Options as ChromeOptions
        from selenium.webdriver.edge.options import Options as EdgeOptions
    except Exception as error:
        raise RuntimeError(
            "Selenium nao disponivel no Python atual. Instale: pip install selenium."
        ) from error

    erros: List[str] = []

    try:
        edge_opts = EdgeOptions()
        edge_opts.add_argument("--disable-gpu")
        edge_opts.add_argument("--window-size=1600,1100")
        edge_opts.add_argument("--disable-dev-shm-usage")
        edge_opts.add_argument(AUTO_SELECT_CERT_ARG)
        if headless:
            edge_opts.add_argument("--headless=new")
        driver = webdriver.Edge(options=edge_opts)
        return driver, "edge"
    except Exception as error:
        erros.append(f"edge: {error}")

    try:
        chrome_opts = ChromeOptions()
        chrome_opts.add_argument("--disable-gpu")
        chrome_opts.add_argument("--window-size=1600,1100")
        chrome_opts.add_argument("--disable-dev-shm-usage")
        chrome_opts.add_argument(AUTO_SELECT_CERT_ARG)
        if headless:
            chrome_opts.add_argument("--headless=new")
        driver = webdriver.Chrome(options=chrome_opts)
        return driver, "chrome"
    except Exception as error:
        erros.append(f"chrome: {error}")

    raise RuntimeError(
        "Nao foi possivel inicializar navegador Selenium (Edge/Chrome). "
        f"Detalhes: {' | '.join(erros)}"
    )


def login_concluido(url_atual: str, acesso: Dict[str, str]) -> bool:
    atual = texto_limpo(url_atual)
    if not atual:
        return False

    parsed = urlparse(atual)
    host = texto_limpo(parsed.hostname).lower()
    path = texto_limpo(parsed.path).lower()
    canal = acesso.get("canal")

    if canal == "esaj":
        return "/sajcas/login" not in path
    return host != "sso.tjsp.jus.br"


def aguardar_login(driver: Any, acesso: Dict[str, str], timeout_segundos: int) -> str:
    limite = time.time() + timeout_segundos
    ultimo_url = ""
    while time.time() < limite:
        try:
            ultimo_url = texto_limpo(driver.current_url)
        except Exception:
            ultimo_url = ""
        if login_concluido(ultimo_url, acesso):
            return ultimo_url
        time.sleep(1)

    raise RuntimeError(
        "Timeout aguardando conclusao do login com certificado digital no portal."
    )


def tentar_preencher_texto(driver: Any, seletores: List[str], valor: str) -> bool:
    if not valor:
        return False

    try:
        from selenium.webdriver.common.by import By
    except Exception:
        return False

    for seletor in seletores:
        elementos = driver.find_elements(By.CSS_SELECTOR, seletor)
        for elemento in elementos:
            try:
                if not elemento.is_enabled():
                    continue
                elemento.clear()
                elemento.send_keys(valor)
                return True
            except Exception:
                continue
    return False


def anexar_arquivo(driver: Any, caminho_arquivo: str) -> bool:
    try:
        from selenium.webdriver.common.by import By
    except Exception:
        return False

    destino = str(Path(caminho_arquivo).resolve())
    elementos = driver.find_elements(By.CSS_SELECTOR, "input[type='file']")
    for elemento in elementos:
        try:
            elemento.send_keys(destino)
            return True
        except Exception:
            continue
    return False


def clicar_botao_protocolar(driver: Any) -> Tuple[bool, str]:
    try:
        from selenium.webdriver.common.by import By
    except Exception:
        return False, ""

    textos_validos = ["protocolar", "peticionar", "enviar", "confirmar", "assinar"]
    textos_ignorar = ["cancelar", "voltar", "fechar", "limpar", "sair"]

    elementos = driver.find_elements(By.XPATH, "//button | //input[@type='submit' or @type='button']")
    for elemento in elementos:
        try:
            if not elemento.is_enabled():
                continue
            texto = texto_limpo(elemento.text or elemento.get_attribute("value")).lower()
            if not texto:
                continue
            if any(termo in texto for termo in textos_ignorar):
                continue
            if any(termo in texto for termo in textos_validos):
                elemento.click()
                return True, texto
        except Exception:
            continue

    return False, ""


def extrair_referencia_tela(driver: Any) -> str:
    try:
        from selenium.webdriver.common.by import By
    except Exception:
        return ""

    try:
        elementos = driver.find_elements(
            By.XPATH,
            "//*[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'protocolo')]",
        )
    except Exception:
        return ""

    for elemento in elementos:
        texto = texto_limpo(elemento.text)
        if texto:
            return texto[:220]
    return ""


def data_dir_local() -> Path:
    valor = texto_limpo(os.environ.get("PETICIONADOR_DATA_DIR"))
    if valor:
        base = Path(valor)
    else:
        base = Path.cwd() / "data"
    base.mkdir(parents=True, exist_ok=True)
    return base


def nome_seguro(nome: str) -> str:
    permitido = []
    for ch in texto_limpo(nome):
        if ch.isalnum() or ch in {"-", "_"}:
            permitido.append(ch)
        else:
            permitido.append("_")
    valor = "".join(permitido).strip("_")
    return valor or "arquivo"


def salvar_screenshot(driver: Any, protocolo: str, etapa: str) -> str:
    pasta = data_dir_local() / "automacao"
    pasta.mkdir(parents=True, exist_ok=True)
    arquivo = pasta / f"{nome_seguro(protocolo)}_{nome_seguro(etapa)}.png"
    try:
        driver.save_screenshot(str(arquivo))
        return str(arquivo)
    except Exception:
        return ""


def executar_fluxo_real(
    payload: Dict[str, Any],
    acesso: Dict[str, str],
    certificado: Dict[str, str],
) -> Dict[str, Any]:
    arquivo_peticao = texto_limpo(payload.get("arquivo"))
    if not arquivo_peticao:
        raise RuntimeError("Arquivo da peticao nao informado.")
    if not os.path.exists(arquivo_peticao):
        raise RuntimeError("Arquivo da peticao nao encontrado no disco local.")

    protocolo = texto_limpo(payload.get("protocolo")) or f"PROTOCOLO-{int(time.time())}"
    timeout_login = inteiro_env("PETICIONADOR_TIMEOUT_LOGIN_SEGUNDOS", TIMEOUT_LOGIN_PADRAO_SEGUNDOS)
    timeout_etapa = inteiro_env("PETICIONADOR_TIMEOUT_ETAPA_SEGUNDOS", TIMEOUT_ETAPA_PADRAO_SEGUNDOS)
    headless = bool_padrao(os.environ.get("PETICIONADOR_HEADLESS", "0"), False)
    confirmar_protocolo = bool_padrao(payload.get("confirmarProtocolo"), True)

    importacao = importar_certificado_a1_windows(
        texto_limpo(certificado.get("arquivo")),
        texto_limpo(certificado.get("senha")),
    )
    thumbprint = texto_limpo(importacao.get("thumbprint"))

    driver = None
    navegador = ""
    screenshots: List[str] = []
    try:
        driver, navegador = criar_driver_selenium(headless=headless)
        driver.set_page_load_timeout(timeout_etapa)
        driver.get(acesso["entradaUrl"])
        img = salvar_screenshot(driver, protocolo, "01_entrada")
        if img:
            screenshots.append(img)

        url_pos_login = aguardar_login(driver, acesso, timeout_login)
        destino = texto_limpo(acesso.get("portalUrl") or acesso.get("serviceUrl"))
        if destino and not url_pos_login.startswith(destino):
            driver.get(destino)
        time.sleep(2)
        img = salvar_screenshot(driver, protocolo, "02_pos_login")
        if img:
            screenshots.append(img)

        preencher_processo = tentar_preencher_texto(
            driver,
            [
                "input[name*='processo']",
                "input[id*='processo']",
                "input[name*='numero']",
                "input[id*='numero']",
                "input[placeholder*='processo']",
            ],
            texto_limpo(payload.get("numeroProcesso")),
        )

        preencher_descricao = tentar_preencher_texto(
            driver,
            [
                "textarea[name*='descricao']",
                "textarea[id*='descricao']",
                "textarea[name*='observ']",
                "textarea[id*='observ']",
            ],
            texto_limpo(payload.get("descricao")),
        )

        upload_ok = anexar_arquivo(driver, arquivo_peticao)
        img = salvar_screenshot(driver, protocolo, "03_formulario")
        if img:
            screenshots.append(img)

        if not upload_ok:
            raise RuntimeError("Nao foi possivel localizar campo de upload para anexar o PDF.")

        clique_ok = False
        botao = ""
        if confirmar_protocolo:
            clique_ok, botao = clicar_botao_protocolar(driver)
            if not clique_ok:
                raise RuntimeError(
                    "Nao foi possivel localizar botao de protocolo automaticamente."
                )
            time.sleep(3)
            img = salvar_screenshot(driver, protocolo, "04_pos_protocolo")
            if img:
                screenshots.append(img)

        referencia_tela = extrair_referencia_tela(driver)
        return {
            "navegador": navegador,
            "urlFinal": texto_limpo(driver.current_url),
            "preencheuNumeroProcesso": preencher_processo,
            "preencheuDescricao": preencher_descricao,
            "arquivoAnexado": upload_ok,
            "confirmarProtocolo": confirmar_protocolo,
            "botaoAcionado": botao,
            "referenciaTela": referencia_tela,
            "screenshots": screenshots,
        }
    finally:
        try:
            if driver is not None:
                driver.quit()
        finally:
            remover_certificado_windows(thumbprint)


def resposta_base(payload: Dict[str, Any], tribunal: str) -> Dict[str, Any]:
    return {
        "tribunal": tribunal,
        "protocolo": payload.get("protocolo"),
        "numeroProcesso": payload.get("numeroProcesso"),
    }


def executar_robo(payload: Dict[str, Any], tribunal: str) -> Dict[str, Any]:
    certificado = payload.get("certificado", {})
    if not certificado.get("arquivo") or not certificado.get("senha"):
        return {
            "ok": False,
            **resposta_base(payload, tribunal),
            "mensagem": "Certificado A1 nao informado no payload.",
        }

    try:
        canal = normalizar_canal(payload)
        modo = normalizar_modo_execucao(payload)
        acesso = montar_dados_acesso(payload, canal)
    except ValueError as error:
        return {
            "ok": False,
            **resposta_base(payload, tribunal),
            "mensagem": str(error),
        }

    if modo == "simulado":
        time.sleep(0.25)
        return {
            "ok": True,
            **resposta_base(payload, tribunal),
            "mensagem": "Peticao protocolada com sucesso no ambiente de simulacao.",
            "modoExecucao": "simulado",
            "canalPeticionamento": canal,
            "acessoUtilizado": acesso,
            "referencia": f"{tribunal}-{random.randint(100000, 999999)}",
            "certificadoUsado": os.path.basename(texto_limpo(certificado.get("arquivo"))),
            "protocoladoEm": agora_iso_utc(),
        }

    try:
        detalhes_execucao = executar_fluxo_real(payload, acesso, certificado)
        protocolado = bool(detalhes_execucao.get("confirmarProtocolo"))
        mensagem = (
            "Peticao protocolada no modo real."
            if protocolado
            else "Fluxo real executado ate pre-protocolo; confirmacao manual requerida."
        )
        return {
            "ok": protocolado,
            **resposta_base(payload, tribunal),
            "mensagem": mensagem,
            "modoExecucao": "real",
            "canalPeticionamento": canal,
            "acessoUtilizado": acesso,
            "detalhesExecucao": detalhes_execucao,
            "referencia": f"{tribunal}-{random.randint(100000, 999999)}",
            "certificadoUsado": os.path.basename(texto_limpo(certificado.get("arquivo"))),
            "protocoladoEm": agora_iso_utc(),
        }
    except Exception as error:
        return {
            "ok": False,
            **resposta_base(payload, tribunal),
            "mensagem": f"Falha no modo real: {texto_limpo(error)}",
            "modoExecucao": "real",
            "canalPeticionamento": canal,
            "acessoUtilizado": acesso,
            "referencia": f"{tribunal}-{random.randint(100000, 999999)}",
            "certificadoUsado": os.path.basename(texto_limpo(certificado.get("arquivo"))),
            "protocoladoEm": agora_iso_utc(),
        }
