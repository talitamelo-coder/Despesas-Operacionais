"""
Converte as planilhas legadas (Controle_Contratos_v11 e Mobicare_Controladoria 2011) em um
arquivo de cópia de segurança do módulo de Gestão de Contratos (formato akross-contratos-backup).

Regras:
- Controle v11 é a fonte principal (controle atual). Mobicare 2011 é histórico.
- Linhas da Mobicare cujo fornecedor já existe no Controle v11 não viram contrato novo:
  o conteúdo é anexado às observações do contrato correspondente.
- O que a planilha não informa NÃO é inventado: fica vazio e aparece como "a completar".
- Suposições inevitáveis viram "confirmações pendentes" no próprio contrato.

Uso: python3 -I converter.py <controle.xlsm> <mobicare.xlsx> <base-config.json> <saida.json> <relatorio.xlsx>
"""
import sys, json, re, unicodedata, datetime, warnings, collections
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

warnings.filterwarnings("ignore")
HOJE = datetime.date(2026, 10, 15)
AGORA = datetime.datetime(2026, 10, 15, 12, 0, 0).isoformat() + "Z"

ctrl_path, mob_path, cfg_path, out_path, rel_path = sys.argv[1:6]
cfg = json.load(open(cfg_path, encoding="utf-8"))


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", s)).strip()


def digitos(s):
    return re.sub(r"\D", "", str(s or ""))


def texto(v):
    if v is None:
        return ""
    s = str(v).replace("\xa0", " ").strip()
    return "" if s.lower() in ("none", "n/a", "na", "--", "-", "") else s


def data_iso(v):
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    if isinstance(v, datetime.date):
        return v.isoformat()
    return ""


def num(v):
    try:
        return float(v) if v not in (None, "") else 0.0
    except (TypeError, ValueError):
        return 0.0


PARTICULAS = {"de", "da", "do", "das", "dos", "e"}


def nome_proprio(s):
    s = re.sub(r"\s+", " ", str(s).strip())
    if s.isupper() or s.islower():
        s = " ".join(w if w.lower() not in PARTICULAS else w.lower() for w in s.title().split())
    return s


def cnpj_valido(c):
    d = digitos(c)
    if len(d) != 14 or len(set(d)) == 1:
        return False
    def dv(base, pesos):
        r = sum(int(n) * p for n, p in zip(base, pesos)) % 11
        return 0 if r < 2 else 11 - r
    p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    d1 = dv(d[:12], p1)
    d2 = dv(d[:12] + str(d1), [6] + p1)
    return d.endswith(f"{d1}{d2}")


# ------------------------------------------------------------------ leitura
wbc = openpyxl.load_workbook(ctrl_path, data_only=True)
linhas_a = [(i, r) for i, r in enumerate(wbc["1. BASE DE DADOS"].iter_rows(min_row=3, values_only=True), start=3) if texto(r[2])]
listas = [r for r in wbc["4. LISTAS"].iter_rows(min_row=4, max_row=9, values_only=True)]

wbm = openpyxl.load_workbook(mob_path, data_only=True)
linhas_b = [(i, r) for i, r in enumerate(wbm["1. BASE CONTRATO"].iter_rows(min_row=4, values_only=True), start=4) if r[1] is not None]

# ------------------------------------------------------------------ usuários
usuarios = {}  # chave normalizada -> usuario


def usuario(nome, perfil="Gestor", diretor=False, email=""):
    nome = nome_proprio(nome)
    k = norm(nome)
    if not k:
        return None
    u = usuarios.get(k)
    if not u:
        u = {"id": f"u-{len(usuarios) + 1:03d}", "nome": nome, "email": email, "perfil": perfil, "ativo": True, "empresasIds": []}
        usuarios[k] = u
    else:
        # Prefere a grafia com acentos.
        if len(nome.encode("utf-8")) > len(u["nome"].encode("utf-8")):
            u["nome"] = nome
        if email and not u["email"]:
            u["email"] = email
    if diretor:
        u["diretor"] = True
    return u


talita = usuario("Talita Melo", perfil="Administrador", email="talita.melo@akross.com.br")
talita["id"] = "u-admin"
talita["area"] = "Suprimentos"
for r in listas:
    gestor, diretor_, eg, ed = r[7], r[8], r[9], r[10]
    if "@" not in f"{eg or ''}{ed or ''}":
        continue  # cabeçalho ou linha sem e-mail
    if texto(gestor):
        usuario(gestor, email=texto(eg))
    if texto(diretor_):
        usuario(diretor_, diretor=True, email=texto(ed))

# ------------------------------------------------------------------ empresas
nome_mobicare = collections.Counter(texto(r[2]).replace("Titular: ", "") for _, r in linhas_b if "mobile care" in norm(r[2])).most_common(1)[0][0]
empresas = [
    {"id": "e-akross", "nome": "Akross Plataformas Tecnológicas e Serviços Ltda", "cnpj": "", "ativo": True},
    {"id": "e-akross-ad", "nome": "Akross Ad Solutions e Publicidade Ltda", "cnpj": "", "ativo": True},
    {"id": "e-mobicare", "nome": nome_mobicare, "cnpj": "", "ativo": True},
]


def empresa_id(v):
    n = norm(v)
    if "mobile care" in n or "mobicare" in n:
        return "e-mobicare"
    if n in ("akross ad",) or "ad solutions" in n:
        return "e-akross-ad"
    if "akross" in n:
        return "e-akross"
    return None


# ------------------------------------------------------------------ tipos de contrato
tipos = {}
NOMES_TIPO = {
    "licenca software": "Licença de software",
    "licenca de software": "Licença de software",
    "infra estrutura cloud": "Infraestrutura cloud",
    "infraestrutura cloud": "Infraestrutura cloud",
    "servico": "Serviço",
    "produto": "Produto",
    "mao de obra": "Mão de obra",
    "telecomunicacao": "Telecomunicação",
    "locacao espaco": "Locação de espaço",
}


def tipo_id(v):
    nome = NOMES_TIPO.get(norm(v), nome_proprio(v) if texto(v) else "Não classificado")
    k = norm(nome)
    if k not in tipos:
        tipos[k] = {"id": f"t-{len(tipos) + 1:02d}", "nome": nome, "ativo": True}
    return tipos[k]["id"]


# ------------------------------------------------------------------ fornecedores
fornecedores = {}  # chave -> fornecedor
por_cnpj = {}


def chave_nome(nome):
    n = norm(nome)
    n = re.sub(r"\b(ltda|s a|sa|me|eireli|epp|ltd|inc|s s|servicos|tecnologia|tecnologias)\b", " ", n)
    return re.sub(r"\s+", " ", n).strip()[:14]


def fornecedor(nome, cnpj=""):
    nome = re.sub(r"\s*\n\s*", " / ", str(nome).strip()).strip(" /")
    d = digitos(cnpj)
    d = d if len(d) == 14 else ""
    if d and d in por_cnpj:
        return por_cnpj[d]
    k = chave_nome(nome)
    f = fornecedores.get(k)
    if not f:
        f = {"fornecedor_id": f"f-{len(fornecedores) + 1:03d}", "razaoSocial": nome, "nomeFantasia": nome, "statusCadastral": "Ativo"}
        fornecedores[k] = f
    if d and not f.get("cnpj"):
        f["cnpj"] = d
        por_cnpj[d] = f
    return f


# ------------------------------------------------------------------ contratos
contratos = []
relatorio = []
seq = collections.Counter()
auditoria = []


def codigo(ini, fim):
    ano = int((ini or fim or HOJE.isoformat())[:4])
    seq[ano] += 1
    return f"CT-{ano}-{seq[ano]:04d}"


INDICES = [("igp-di", "Outro"), ("igpdi", "Outro"), ("igp-m", "IGP-M"), ("igpm", "IGP-M"), ("ipca", "IPCA"), ("inpc", "INPC"), ("ipc-fipe", "IPC-Fipe"), ("dissidio", "Dissídio")]


def reajuste_de(txt, data_base=""):
    t = texto(txt)
    if not t or norm(t) in ("nao", "nao ha", "sem reajuste"):
        return {"possui": False}
    n = t.lower().replace(" ", "")
    nn = unicodedata.normalize("NFD", n).encode("ascii", "ignore").decode()
    indice = next((v for k, v in INDICES if k.replace("-", "") in nn.replace("-", "")), "Outro")
    r = {"possui": True, "indice": indice, "periodicidadeMeses": 12}
    if data_base:
        r["dataBase"] = data_base
    return r


def novo_contrato(**kw):
    c = {
        "execucaoFinanceira": {"simulado": True},
        "origens": {"*": "importado"},
        "criadoEm": AGORA,
        "atualizadoEm": AGORA,
        "analistaId": talita["id"],
    }
    # Campos opcionais vazios são omitidos; obrigatórios (objeto etc.) ficam "" para aparecerem como "a completar".
    opcionais = {"projeto", "centroCusto", "observacoes", "diretorId", "saving", "confirmacoesPendentes", "external_id"}
    c.update({k: v for k, v in kw.items() if not (v is None or (k in opcionais and v in ("", [])))})
    return c


# ---------- Controle v11
contratos_a = []
for linha, r in linhas_a:
    confirmar = []
    emp = empresa_id(r[1])
    if not emp:
        emp = "e-akross"
        confirmar.append("Confirmar empresa (não informada na planilha)")
    f = fornecedor(r[2], r[3])
    ini, fim = data_iso(r[21]), data_iso(r[22])
    st = texto(r[26])
    status = {"Ativo": "Vigente", "Encerrado": "Encerrado"}.get(st)
    if not status:
        status = "Vigente"
        confirmar.append("Confirmar status (não informado na planilha)")
    moeda = "USD" if texto(r[7]) == "USD" else "BRL"
    anual_brl = num(r[14])
    proposto = num(r[15])
    if anual_brl <= 0 and proposto > 0:
        anual_brl = proposto
        confirmar.append("Valor anual veio do valor proposto (sem valor fechado na planilha)")
    ptax = num(r[8])
    cotacao = None
    valor = anual_brl
    if moeda == "USD":
        if ptax > 0:
            valor = round(anual_brl / ptax, 2)
            cotacao = {"valor": ptax, "data": ini or HOJE.isoformat(), "fonte": "PTAX", "observacao": "PTAX de referência da planilha Controle v11"}
        elif anual_brl > 0:
            moeda = "BRL"
            confirmar.append("Contrato em USD na planilha: valor registrado em BRL, sem cotação")
    per = texto(r[12])
    obs = []
    periodicidade = {"Mensal": "Mensal", "Anual": "Anual", "Trimestral": "Trimestral", "Semestral": "Semestral"}.get(per, "Mensal")
    renov_meses = None
    m = re.match(r"(\d+)\s*meses", per or "")
    if m:
        renov_meses = int(m.group(1))
        obs.append(f"Periodicidade na planilha: {per}")
    gest_nome = texto(r[30])
    gestor = usuario(gest_nome) if gest_nome else None
    if not gestor:
        gestor = talita
        confirmar.append("Gestor não informado na planilha (definido provisoriamente)")
    dir_nome = texto(r[31])
    diretor = usuario(dir_nome, diretor=True) if dir_nome else None
    multa = texto(r[28])
    if texto(r[32]):
        obs.append(f"Observação da negociação: {texto(r[32])}")
    if texto(r[33]):
        obs.append(f"Tipo de mudança (planilha): {texto(r[33])}")
    if texto(r[39]):
        obs.append(f"Tipo de contrato (planilha): {texto(r[39])}" + (f" — valor estimado mensal R$ {num(r[40]):,.2f}" if num(r[40]) else ""))
    # Saving: só com valor fechado e baseline informado na planilha.
    saving = None
    custo_ant, fechado = num(r[36]), num(r[14])
    base, tipo_base = (custo_ant, "Contrato anterior") if custo_ant > 0 else (proposto, "Proposta inicial") if proposto > 0 else (0, None)
    if fechado > 0 and base > 0:
        total = round(base - fechado, 2)
        origem = {"Troca de fornecedor": "Troca de fornecedor", "Renegociação de preço": "Negociação de preço", "Redução de licenças": "Redução de volume", "Mudança de moeda": "Negociação cambial"}.get(texto(r[33]))
        saving = {
            "tipoBaseline": tipo_base,
            "baselineAnual": round(base, 2),
            "valorNegociadoAnual": round(fechado, 2),
            "componentes": [{"origem": origem or "Negociação de preço", "valorAnual": total}] if total > 0 else [],
            "origemOportunidade": "Suprimentos",
        }
        if total > 0:
            confirmar.append("Confirmar origem do saving (importado como Suprimentos)")
    c = novo_contrato(
        contrato_id=f"c-a{linha:03d}",
        codigo=codigo(ini, fim),
        external_id=f"Controle v11 #{r[0]}" if r[0] is not None else f"Controle v11 linha {linha}",
        empresaId=emp,
        fornecedorId=f["fornecedor_id"],
        objeto=texto(r[4]),
        tipoContratoId=tipo_id(r[5]),
        gestorId=gestor["id"],
        diretorId=diretor["id"] if diretor else None,
        projeto=texto(r[6]),
        status=status,
        condicoes={k: v for k, v in {
            "moeda": moeda,
            "valorAnual": valor,
            "quantidade": int(num(r[9])) if num(r[9]) else None,
            "periodicidadePagamento": periodicidade,
            "condicaoPagamento": "",
            "cotacao": cotacao,
        }.items() if v is not None},
        vigencia={k: v for k, v in {
            "dataInicio": ini,
            "dataFim": fim,
            "tipoVigencia": "Prazo determinado",
            "avisoPrevioDias": int(num(r[23])) if num(r[23]) else 0,
            "renovacaoAutomatica": texto(r[25]) == "Sim",
            "prazoGestorDias": 30,
            "periodicidadeRenovacaoMeses": renov_meses,
        }.items() if v is not None},
        reajuste=reajuste_de(r[27], ini),
        rescisao={k: v for k, v in {"permite": True, "possuiMulta": bool(multa), "regra": multa or None}.items() if v is not None},
        saving=saving,
        observacoes="\n".join(obs),
        confirmacoesPendentes=confirmar,
    )
    contratos.append(c)
    contratos_a.append(c)
    relatorio.append([c["codigo"], "Controle v11", linha, f["razaoSocial"], c["objeto"], status, "Novo contrato"])

# ---------- Mobicare 2011
idx_a_por_fornecedor = collections.defaultdict(list)
for c in contratos_a:
    idx_a_por_fornecedor[c["fornecedorId"]].append(c)


def palavras(s):
    return {w for w in norm(s).split() if len(w) > 3}


anexados = 0
for linha, r in linhas_b:
    cod, emp_txt, forn_txt, desc, obj, vig, ini_v, fim_v, renov, cancel, preco, pag, reaj, multa, anal, gest, dire, cc, _tipo, cnpj = r[1:21]
    d = digitos(cnpj)
    f_existente = por_cnpj.get(d) if len(d) == 14 else None
    if not f_existente:
        f_existente = fornecedores.get(chave_nome(re.sub(r"\s*\n\s*", " / ", str(forn_txt).strip())))
    historico = [f"Mobicare 2011 cód. {cod}: {texto(desc)}"]
    for rot, v in [("Objeto", obj), ("Vigência", vig), ("Início", data_iso(ini_v) or texto(ini_v) if isinstance(ini_v, (datetime.datetime, datetime.date)) else ""), ("Fim", data_iso(fim_v)), ("Renovação", renov), ("Cancelamento", cancel), ("Preço/valor", preco), ("Pagamento", pag), ("Reajuste", reaj), ("Multa", multa), ("Centro de custo", cc)]:
        if texto(v):
            historico.append(f"{rot}: {texto(v)}")
    if r[21] or r[22]:
        historico.append(f"SLA: disponibilidade {r[21] or '—'}; atendimento {texto(r[22]) or '—'}")
    anal_nome = nome_proprio(texto(anal)) if texto(anal) else ""
    if anal_nome and norm(anal_nome) != norm("Talita Melo"):
        historico.append(f"Analista na planilha: {anal_nome}")

    if f_existente and idx_a_por_fornecedor.get(f_existente["fornecedor_id"]):
        # Mesmo fornecedor do controle atual: anexa como histórico ao contrato mais parecido.
        alvo = max(idx_a_por_fornecedor[f_existente["fornecedor_id"]], key=lambda c: len(palavras(c["objeto"]) & palavras(f"{desc} {obj}")))
        alvo["observacoes"] = (alvo.get("observacoes", "") + ("\n\n" if alvo.get("observacoes") else "") + "\n".join(historico)).strip()
        if len(d) == 14 and not f_existente.get("cnpj"):
            f_existente["cnpj"] = d
            por_cnpj[d] = f_existente
        if texto(cc) and not alvo.get("centroCusto"):
            alvo["centroCusto"] = texto(cc)
        anexados += 1
        relatorio.append([alvo["codigo"], "Mobicare 2011", linha, alvo and f_existente["razaoSocial"], texto(obj) or texto(desc), "—", "Anexado como histórico ao contrato do Controle v11"])
        continue

    confirmar = []
    f = fornecedor(forn_txt, cnpj)
    ini, fim = data_iso(ini_v), data_iso(fim_v)
    indeterminado = "indetermin" in norm(vig)
    if fim and datetime.date.fromisoformat(fim) >= HOJE:
        status = "Vigente"
    else:
        status = "Encerrado"
        if not fim:
            confirmar.append("Confirmar status: contrato do histórico Mobicare sem data de fim (importado como Encerrado)")
    gest_nome = texto(gest)
    gestor = usuario(gest_nome) if gest_nome and norm(gest_nome) not in ("sim", "nao", "s", "n") else None
    if not gestor:
        gestor = talita
        confirmar.append("Gestor não identificado na planilha (definido provisoriamente)")
    diretor = usuario(texto(dire), diretor=True) if texto(dire) else None
    emp = empresa_id(emp_txt) or "e-mobicare"
    multa_txt = texto(multa)
    regra = " | ".join(x for x in [texto(cancel), f"Multa: {multa_txt}" if multa_txt else ""] if x)
    c = novo_contrato(
        contrato_id=f"c-b{linha:03d}",
        codigo=codigo(ini, fim),
        external_id=f"Mobicare 2011 #{cod}",
        empresaId=emp,
        fornecedorId=f["fornecedor_id"],
        objeto=texto(obj) or texto(desc),
        tipoContratoId=tipo_id(None),
        gestorId=gestor["id"],
        diretorId=diretor["id"] if diretor else None,
        centroCusto=texto(cc),
        status=status,
        condicoes={"moeda": "BRL", "valorAnual": 0, "periodicidadePagamento": "Mensal", "condicaoPagamento": texto(pag)},
        vigencia={
            "dataInicio": ini,
            "dataFim": fim,
            "tipoVigencia": "Prazo indeterminado" if indeterminado and not fim else "Prazo determinado",
            "avisoPrevioDias": 0,
            "renovacaoAutomatica": "autom" in norm(renov),
            "prazoGestorDias": 30,
        },
        reajuste=reajuste_de(reaj, ini),
        rescisao={k: v for k, v in {"permite": True, "possuiMulta": bool(multa_txt), "regra": regra or None}.items() if v is not None},
        observacoes="\n".join(historico),
        confirmacoesPendentes=confirmar,
    )
    contratos.append(c)
    relatorio.append([c["codigo"], "Mobicare 2011", linha, f["razaoSocial"], c["objeto"], status, "Novo contrato"])

# ------------------------------------------------------------------ auditoria
for c in contratos:
    auditoria.append({
        "id": f"a-imp-{c['contrato_id']}",
        "entidade": "contrato",
        "entidadeId": c["contrato_id"],
        "usuarioId": talita["id"],
        "data": AGORA,
        "acao": "Contrato importado de planilha",
        "campo": "external_id",
        "valorNovo": c["external_id"],
    })

# ------------------------------------------------------------------ estado
config = cfg["configuracao"]
config["listasAuxiliares"]["Projetos"] = sorted({c["projeto"] for c in contratos if c.get("projeto")})
estado = {
    "versao": cfg["versao"],
    "modo": "real",
    "usuarios": list(usuarios.values()),
    "empresas": empresas,
    "fornecedores": list(fornecedores.values()),
    "tiposContrato": list(tipos.values()),
    "contratos": contratos,
    "processos": [],
    "documentos": [],
    "auditoria": auditoria,
    "configuracao": config,
}
json.dump({"formato": "akross-contratos-backup", "geradoEm": AGORA, "estado": estado}, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ------------------------------------------------------------------ relatório
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "Importação"
cab = ["Código no sistema", "Planilha de origem", "Linha na planilha", "Fornecedor", "Objeto", "Status importado", "Resultado"]
ws.append(cab)
for linha in relatorio:
    ws.append(linha)
ws2 = wb.create_sheet("A completar")
ws2.append(["Código no sistema", "Fornecedor", "Status", "Itens a completar / confirmar"])
f_por_id = {f["fornecedor_id"]: f for f in fornecedores.values()}
t_por_id = {t["id"]: t["nome"] for t in tipos.values()}
pend_total = 0
for c in contratos:
    p = []
    if not c["vigencia"].get("dataInicio"):
        p.append("Data de início")
    if not c["vigencia"].get("dataFim") and c["vigencia"]["tipoVigencia"] == "Prazo determinado":
        p.append("Data de fim")
    if not c["condicoes"]["valorAnual"] > 0:
        p.append("Valor anual")
    if c["condicoes"]["moeda"] != "BRL" and not c["condicoes"].get("cotacao"):
        p.append("Cotação da moeda")
    if not f_por_id[c["fornecedorId"]].get("cnpj"):
        p.append("CNPJ do fornecedor")
    if t_por_id[c["tipoContratoId"]] == "Não classificado":
        p.append("Tipo de contrato")
    p += c.get("confirmacoesPendentes", [])
    if p:
        pend_total += 1
        ws2.append([c["codigo"], f_por_id[c["fornecedorId"]]["razaoSocial"], c["status"], "; ".join(p)])
for w in (ws, ws2):
    for cell in w[1]:
        cell.font = Font(name="Arial", bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="0A2C66")
    for row in w.iter_rows(min_row=2):
        for cell in row:
            cell.font = Font(name="Arial")
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    w.freeze_panes = "A2"
for col, larg in zip("ABCDEFG", [16, 16, 10, 40, 50, 14, 40]):
    ws.column_dimensions[col].width = larg
for col, larg in zip("ABCD", [16, 40, 12, 90]):
    ws2.column_dimensions[col].width = larg
wb.save(rel_path)

st = collections.Counter(c["status"] for c in contratos)
print(json.dumps({
    "linhas_controle": len(linhas_a),
    "linhas_mobicare": len(linhas_b),
    "contratos_criados": len(contratos),
    "mobicare_anexados_como_historico": anexados,
    "status": st,
    "contratos_com_pendencia": pend_total,
    "usuarios": len(usuarios),
    "usuarios_com_email": sum(1 for u in usuarios.values() if u["email"]),
    "fornecedores": len(fornecedores),
    "fornecedores_com_cnpj": sum(1 for f in fornecedores.values() if f.get("cnpj")),
    "tipos": [t["nome"] for t in tipos.values()],
    "empresas": [e["nome"] for e in empresas],
}, ensure_ascii=False, indent=1))
