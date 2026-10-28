import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Download, Filter, Plus, X } from "lucide-react";
import { useApp, useOpcoes } from "@/app/contexto";
import { salvarArquivo } from "@/app/arquivos";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, type OpcaoSelect } from "@/components/ui/Campos";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Paginacao, Tabela, type Coluna } from "@/components/ui/Tabela";
import { Tabs } from "@/components/ui/Tabs";
import { PrioridadeBadge, StatusBadge } from "@/components/ui/status";
import { ABAS_CENTRAL, type AbaCentral } from "@/domain/rules/central";
import { etapasDoProcesso, opcoesFluxo, TIPOS_PROCESSO } from "@/domain/rules/fluxo";
import { formatarData } from "@/domain/datas";
import { formatarMoeda } from "@/domain/formatacao";
import { useConsulta } from "@/hooks/useConsulta";
import { api, type ColunaOrdenavel, type FiltrosCentral, type LinhaCentral, type Ordenacao } from "@/services";

const CHAVES_FILTRO = ["fornecedorId", "gestorId", "analistaId", "status", "tipoContratoId", "tipoProcesso", "vencimento", "renovacaoAutomatica", "moeda", "projeto", "cadastro"] as const;
const STATUS_CONTRATO = ["Vigente", "Suspenso", "Encerrado", "Rescindido"];

function csvDaPagina(linhas: LinhaCentral[]): string {
  const cab = ["Código", "Fornecedor", "Empresa", "Objeto", "Gestor", "Analista", "Valor mensal (BRL)", "Valor anual (BRL)", "Data fim", "Status", "Próxima ação"];
  const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const corpo = linhas.map((l) => [l.codigo, l.fornecedor, l.empresa, l.objeto, l.gestorCompleto, l.analistaCompleto, l.valorMensalBRL?.toFixed(2).replace(".", ","), l.valorAnualBRL?.toFixed(2).replace(".", ","), formatarData(l.dataFim), l.status, l.proximaAcao].map(esc).join(";"));
  return "\uFEFF" + [cab.map(esc).join(";"), ...corpo].join("\n");
}

export function CentralContratos() {
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const { pode, executar, cad } = useApp();
  const statusOpcoes = [...STATUS_CONTRATO, ...etapasDoProcesso({ tipo: "Nova contratação" }, opcoesFluxo(cad.config))];
  const op = useOpcoes();
  const aba = (params.get("aba") as AbaCentral) || "Todos";
  const busca = params.get("busca") ?? "";
  const [filtroAberto, setFiltroAberto] = useState(false);
  const [ordenacao, setOrdenacao] = useState<Ordenacao>({ coluna: "prioridade", direcao: "asc" });
  const [pagina, setPagina] = useState(0);
  const [tamanho, setTamanho] = useState(25);

  const filtros = useMemo<FiltrosCentral>(() => {
    const f: FiltrosCentral = { aba, busca };
    for (const k of CHAVES_FILTRO) {
      const v = params.get(k);
      if (v) (f as unknown as Record<string, string>)[k] = v;
    }
    return f;
  }, [params, aba, busca]);

  useEffect(() => setPagina(0), [filtros]);

  const { dados, carregando } = useConsulta(() => api.consultarCentral(filtros, ordenacao, pagina, tamanho), [filtros, ordenacao, pagina, tamanho]);

  const setParam = (k: string, v?: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  // Filtros da tela "Filtrar" (agrupados como no filtro de lançamentos do ERP).
  const camposFiltro: CampoFiltro[] = [
    { grupo: "Contrato", chave: "fornecedorId", rotulo: "Fornecedor", opcoes: op.fornecedores },
    { grupo: "Contrato", chave: "tipoContratoId", rotulo: "Tipo de contrato", opcoes: op.tipos },
    { grupo: "Contrato", chave: "projeto", rotulo: "Projeto", opcoes: op.projetos },
    { grupo: "Contrato", chave: "moeda", rotulo: "Moeda", opcoes: op.moedas, vazio: "Todas" },
    { grupo: "Responsáveis", chave: "gestorId", rotulo: "Gestor", opcoes: op.gestores },
    { grupo: "Responsáveis", chave: "analistaId", rotulo: "Analista", opcoes: op.analistas },
    { grupo: "Situação", chave: "status", rotulo: "Status", opcoes: statusOpcoes.map((x) => ({ valor: x, rotulo: x })) },
    { grupo: "Situação", chave: "tipoProcesso", rotulo: "Tipo de processo", opcoes: TIPOS_PROCESSO.map((t) => ({ valor: t, rotulo: t })) },
    { grupo: "Situação", chave: "cadastro", rotulo: "Cadastro", opcoes: [{ valor: "incompleto", rotulo: "A completar" }] },
    {
      grupo: "Prazos",
      chave: "vencimento",
      rotulo: "Vencimento",
      vazio: "Qualquer",
      opcoes: [
        { valor: "30", rotulo: "Até 30 dias" },
        { valor: "60", rotulo: "Até 60 dias" },
        { valor: "90", rotulo: "Até 90 dias" },
        { valor: "180", rotulo: "Até 180 dias" },
        { valor: "vencidos", rotulo: "Vencidos" },
      ],
    },
    { grupo: "Prazos", chave: "renovacaoAutomatica", rotulo: "Renovação automática", vazio: "Todas", opcoes: [{ valor: "sim", rotulo: "Sim" }, { valor: "nao", rotulo: "Não" }] },
  ];
  const ativos = [
    ...(busca ? [{ chave: "busca", texto: `Pesquisa: “${busca}”` }] : []),
    ...camposFiltro.filter((c) => params.get(c.chave)).map((c) => ({ chave: c.chave, texto: `${c.rotulo}: ${c.opcoes.find((o) => o.valor === params.get(c.chave))?.rotulo ?? params.get(c.chave)}` })),
  ];
  const aplicarFiltros = (valores: Record<string, string>) => {
    const n = new URLSearchParams();
    if (params.get("aba")) n.set("aba", params.get("aba")!);
    for (const [k, v] of Object.entries(valores)) if (v.trim()) n.set(k, v.trim());
    setParams(n, { replace: true });
  };

  const ordenar = (coluna: string) =>
    setOrdenacao((o) => ({ coluna: coluna as ColunaOrdenavel, direcao: o.coluna === coluna && o.direcao === "asc" ? "desc" : "asc" }));

  const colunas: Coluna<LinhaCentral>[] = [
    {
      id: "codigo",
      titulo: "Código",
      ordenavel: true,
      render: (l) => (
        <span title={l.jira_key ? `JIRA ${l.jira_key}` : undefined}>
          <Link to={l.link} onClick={(e) => e.stopPropagation()} className="font-semibold text-primaria-800 hover:underline">
            {l.codigo}
          </Link>
          {l.jira_key && <span className="ml-1.5 text-[11px] text-texto-fraco">{l.jira_key}</span>}
        </span>
      ),
    },
    { id: "fornecedor", titulo: "Fornecedor", ordenavel: true, maxLargura: "max-w-[140px]", dica: (l) => l.fornecedor, render: (l) => l.fornecedor },
    { id: "objeto", titulo: "Objeto", ordenavel: true, maxLargura: "max-w-[180px]", dica: (l) => l.objeto, render: (l) => l.objeto },
    { id: "gestor", titulo: "Gestor", ordenavel: true, maxLargura: "max-w-[90px]", dica: (l) => l.gestor, render: (l) => l.gestor },
    { id: "analista", titulo: "Analista", ordenavel: true, maxLargura: "max-w-[90px]", dica: (l) => l.analista, render: (l) => l.analista },
    {
      id: "valorMensal",
      titulo: "Valor mensal",
      ordenavel: true,
      alinhamento: "direita",
      render: (l) => (
        <span className="tabular">
          {formatarMoeda(l.valorMensalBRL)}
          {l.moeda !== "BRL" && <span className="ml-1 text-[10px] font-semibold text-info-600">{l.moeda}</span>}
        </span>
      ),
    },
    {
      id: "valorAnual",
      titulo: "Valor anual",
      ordenavel: true,
      alinhamento: "direita",
      render: (l) => (
        <span className="tabular">
          {formatarMoeda(l.valorAnualBRL)}
          {l.moeda !== "BRL" && <span className="ml-1 text-[10px] font-semibold text-info-600">{l.moeda}</span>}
        </span>
      ),
    },
    {
      id: "dataFim",
      titulo: "Data fim",
      ordenavel: true,
      render: (l) => (
        <span className="tabular">
          {formatarData(l.dataFim)}
          {l.diasAteVencimento !== undefined && l.status === "Vigente" && l.diasAteVencimento >= 0 && l.diasAteVencimento <= 120 && (
            <span className={`ml-1.5 text-[11px] ${l.diasAteVencimento <= 30 ? "text-critico-600" : "text-alerta-600"}`}>{l.diasAteVencimento} d</span>
          )}
        </span>
      ),
    },
    {
      id: "status",
      titulo: "Status",
      ordenavel: true,
      maxLargura: "max-w-[130px]",
      dica: (l) => [l.status, l.situacao, l.pendenciasCadastro.length ? `A completar: ${l.pendenciasCadastro.join(", ")}` : ""].filter(Boolean).join(" · "),
      render: (l) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusBadge status={l.status} />
          {l.situacao && <span className="text-[11px] text-info-600">{l.situacao}</span>}
          {l.pendenciasCadastro.length > 0 && (
            <span title={`Cadastro a completar: ${l.pendenciasCadastro.join(", ")}`} className="text-[11px] font-medium text-alerta-600">
              A completar ({l.pendenciasCadastro.length})
            </span>
          )}
        </span>
      ),
    },
    {
      id: "prioridade",
      titulo: "Próxima ação",
      ordenavel: true,
      maxLargura: "max-w-[180px]",
      dica: (l) => l.proximaAcao,
      render: (l) => (
        <>
          {l.prioridade !== "Normal" && <span className="mr-1.5"><PrioridadeBadge prioridade={l.prioridade} /></span>}
          <span className="text-xs text-texto-suave">{l.proximaAcao}</span>
        </>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        titulo="Central de Contratos"
        descricao="Contratos de fornecedores, processos em contratação e ações pendentes em um só lugar."
        acoes={
          <>
            <Button variante="secundario" icone={<Download size={16} />} disabled={!dados?.linhas.length} onClick={() => dados && executar(() => salvarArquivo("central-de-contratos.csv", csvDaPagina(dados.linhas)))}>
              Exportar página
            </Button>
            {pode("editar_processo") && (
              <Button icone={<Plus size={16} />} onClick={() => navegar("/processos/novo")}>
                Novo processo
              </Button>
            )}
          </>
        }
      />

      <Card>
        <Tabs
          className="px-2"
          abas={ABAS_CENTRAL.map((a) => ({ id: a, rotulo: a, contador: dados?.contagemPorAba[a] }))}
          ativa={aba}
          onChange={(a) => setParam("aba", a === "Todos" ? undefined : a)}
        />

        {/* Filtros ficam numa tela própria; aqui só o botão e o que está aplicado. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-borda px-4 py-2">
          <Button tamanho="sm" variante={ativos.length ? "primario" : "secundario"} icone={<Filter size={14} />} onClick={() => setFiltroAberto(true)}>
            Filtrar{ativos.length ? ` (${ativos.length})` : ""}
          </Button>
          {ativos.map((a) => (
            <span key={a.chave} className="inline-flex h-7 items-center gap-1 rounded-full border border-primaria-200 bg-primaria-50 pr-1 pl-2.5 text-xs text-primaria-800">
              {a.texto}
              <button onClick={() => setParam(a.chave)} className="rounded-full p-0.5 hover:bg-primaria-100" aria-label={`Remover filtro ${a.texto}`}>
                <X size={12} />
              </button>
            </span>
          ))}
          {ativos.length > 0 && (
            <button className="text-xs text-texto-suave hover:text-texto hover:underline" onClick={() => aplicarFiltros({})}>
              Limpar filtros
            </button>
          )}
          <span className="ml-auto text-xs text-texto-suave tabular">{dados ? `${dados.total} registro(s)` : ""}</span>
        </div>
        {filtroAberto && (
          <FiltroCentral
            campos={camposFiltro}
            iniciais={Object.fromEntries([["busca", busca], ...camposFiltro.map((c) => [c.chave, params.get(c.chave) ?? ""])])}
            onAplicar={(v) => (aplicarFiltros(v), setFiltroAberto(false))}
            onFechar={() => setFiltroAberto(false)}
          />
        )}

        <Tabela
          colunas={colunas}
          linhas={dados?.linhas ?? []}
          chave={(l) => l.id}
          ordenacao={ordenacao}
          onOrdenar={ordenar}
          onLinha={(l) => navegar(l.link)}
          carregando={carregando && !dados}
          densa
          vazio="Nenhum contrato ou processo para os filtros selecionados."
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 px-4 text-xs text-texto-suave">
            Linhas por página
            <select value={tamanho} onChange={(e) => (setTamanho(Number(e.target.value)), setPagina(0))} className="h-7 rounded border border-borda px-1">
              {[25, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <div className="flex-1">
            <Paginacao pagina={pagina} total={dados?.total ?? 0} tamanho={tamanho} onPagina={setPagina} />
          </div>
        </div>
      </Card>
    </>
  );
}

interface CampoFiltro {
  grupo: "Contrato" | "Responsáveis" | "Situação" | "Prazos";
  chave: (typeof CHAVES_FILTRO)[number];
  rotulo: string;
  opcoes: OpcaoSelect[];
  vazio?: string;
}

/** Tela de filtro: campos agrupados em quadros; só vale ao clicar em Aplicar. */
function FiltroCentral({ campos, iniciais, onAplicar, onFechar }: { campos: CampoFiltro[]; iniciais: Record<string, string>; onAplicar: (v: Record<string, string>) => void; onFechar: () => void }) {
  const [v, setV] = useState(iniciais);
  const grupos = [...new Set(campos.map((c) => c.grupo))];
  return (
    <Modal
      aberto
      largura="xl"
      titulo="Filtro de contratos"
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="fantasma" className="mr-auto" onClick={() => setV(Object.fromEntries(Object.keys(v).map((k) => [k, ""])))}>Limpar</Button>
          <Button variante="secundario" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => onAplicar(v)}>Aplicar</Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onAplicar(v);
        }}
      >
        <Input rotulo="Pesquisa" autoFocus placeholder="Código, fornecedor, CNPJ, objeto, JIRA ou projeto" value={v.busca ?? ""} onChange={(e) => setV({ ...v, busca: e.target.value })} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {grupos.map((g) => (
            <fieldset key={g} className="rounded-md border border-borda px-3 pt-1 pb-3">
              <legend className="px-1 text-xs font-semibold text-texto-suave">{g}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {campos.filter((c) => c.grupo === g).map((c) => (
                  <Select key={c.chave} rotulo={c.rotulo} opcoes={c.opcoes} vazio={c.vazio ?? "Todos"} value={v[c.chave] ?? ""} onChange={(e) => setV({ ...v, [c.chave]: e.target.value })} />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
