import json
import os
import random
import sys
import time
from datetime import datetime


TRIBUNAL = "TJSP2"
CANAIS_VALIDOS = {"eproc", "esaj"}


def carregar_payload() -> dict:
    bruto = sys.stdin.read().strip()
    if not bruto and len(sys.argv) > 1:
        bruto = sys.argv[1]

    if not bruto:
        return {}

    try:
        return json.loads(bruto)
    except json.JSONDecodeError:
        return {}


def texto_limpo(valor) -> str:
    return str(valor or "").strip()


def normalizar_canal(payload: dict) -> str:
    tjsp = payload.get("tjsp", {})
    canal = texto_limpo(payload.get("canalPeticionamento") or tjsp.get("canal")).lower()
    if not canal:
        canal = "eproc"
    if canal not in CANAIS_VALIDOS:
        raise ValueError("Canal TJSP invalido no payload. Use 'eproc' ou 'esaj'.")
    return canal


def montar_dados_acesso(payload: dict, canal: str) -> dict:
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
        login_url = ""

    return {
        "canal": canal,
        "entradaUrl": entrada_url,
        "portalUrl": portal_url,
        "serviceUrl": service_url,
        "loginUrl": login_url,
    }


def main() -> None:
    payload = carregar_payload()
    certificado = payload.get("certificado", {})

    if not certificado.get("arquivo") or not certificado.get("senha"):
        resposta = {
            "ok": False,
            "tribunal": TRIBUNAL,
            "mensagem": "Certificado A1 nao informado no payload.",
        }
        print(json.dumps(resposta, ensure_ascii=True))
        sys.exit(0)

    try:
        canal = normalizar_canal(payload)
        acesso = montar_dados_acesso(payload, canal)
    except ValueError as error:
        resposta = {
            "ok": False,
            "tribunal": TRIBUNAL,
            "protocolo": payload.get("protocolo"),
            "numeroProcesso": payload.get("numeroProcesso"),
            "mensagem": str(error),
        }
        print(json.dumps(resposta, ensure_ascii=True))
        sys.exit(0)

    time.sleep(0.25)
    referencia = f"{TRIBUNAL}-{random.randint(100000, 999999)}"

    resposta = {
        "ok": True,
        "tribunal": TRIBUNAL,
        "protocolo": payload.get("protocolo"),
        "numeroProcesso": payload.get("numeroProcesso"),
        "mensagem": "Peticao protocolada com sucesso no ambiente de simulacao.",
        "canalPeticionamento": canal,
        "acessoUtilizado": acesso,
        "referencia": referencia,
        "certificadoUsado": os.path.basename(certificado.get("arquivo", "")),
        "protocoladoEm": datetime.utcnow().isoformat() + "Z",
    }
    print(json.dumps(resposta, ensure_ascii=True))


if __name__ == "__main__":
    main()
