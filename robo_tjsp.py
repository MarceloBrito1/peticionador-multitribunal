import json

from robo_tjsp_base import carregar_payload, executar_robo


TRIBUNAL = "TJSP"


def main() -> None:
    payload = carregar_payload()
    resposta = executar_robo(payload, TRIBUNAL)
    print(json.dumps(resposta, ensure_ascii=True))


if __name__ == "__main__":
    main()
