import json
import os
import random
import sys
import time
from datetime import datetime


TRIBUNAL = "TRT2"


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

    time.sleep(0.25)
    referencia = f"{TRIBUNAL}-{random.randint(100000, 999999)}"

    resposta = {
        "ok": True,
        "tribunal": TRIBUNAL,
        "protocolo": payload.get("protocolo"),
        "numeroProcesso": payload.get("numeroProcesso"),
        "mensagem": "Peticao protocolada com sucesso no ambiente de simulacao.",
        "referencia": referencia,
        "certificadoUsado": os.path.basename(certificado.get("arquivo", "")),
        "protocoladoEm": datetime.utcnow().isoformat() + "Z",
    }
    print(json.dumps(resposta, ensure_ascii=True))


if __name__ == "__main__":
    main()
