import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Download, FilterX, Plus, Search } from "lucide-react";
import { useApp, useOpcoes } from "@/app/contexto";
import { salvarArquivo } from "@/app/arquivos";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Campos";
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

function useDebounce<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

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
  const [busca, setBusca] = useState(params.get("busca") ?? "");
  const buscaDeb = useDebounce(busca, 250);
  const [ordenacao, setOrdenacao] = useState<Ordenacao>({ coluna: "prioridade", direcao: "asc" });
  const [pagina, setPagina] = useState(0);
  const [tamanho, setTamanho] = useState(25);

  useEffect(() => setBusca(params.get("busca") ?? ""), [params]);

  const filtros = useMemo<FiltrosCentral>(() => {
    const f: FiltrosCentral = { aba, busca: buscaDeb };
    for (const k of CHAVES_FILTRO) {
      const v = params.get(k);
      if (v) (f as unknown as Record<string, string>)[k] = v;
    }
    return f;
  }, [params, aba, buscaDeb]);

  useEffect(() => setPagina(0), [filtros]);

  const { dados, carregando } = useConsulta(() => api.consultarCentral(filtros, ordenacao, pagina, tamanho), [filtros, ordenacao, pagina, tamanho]);

  const setParam = (k: string, v?: string) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  const filtrosAtivos = CHAVES_FILTRO.filter((k) => params.get(k)).length;

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

        <div className="flex flex-wrap items-center gap-2 border-b border-borda px-4 py-3">
          <div className="relative min-w-[240px] flex-1">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-texto-fraco" />
            <input
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setParam("busca", e.target.value || undefined);
              }}
              placeholder="Pesquisar por código, fornecedor, CNPJ, objeto, JIRA ou projeto"
              className="h-8 w-full rounded-md border border-borda-forte pr-3 pl-9 text-[13px] focus:border-primaria-500 focus:outline-none focus:ring-2 focus:ring-primaria-100"
            />
          </div>
          <div className="contents">
            <Select compacto className="w-auto max-w-[200px]" rotulo="Fornecedor" opcoes={op.fornecedores} vazio="Fornecedor" value={params.get("fornecedorId") ?? ""} onChange={(e) => setParam("fornecedorId", e.target.value)} />
            <Select compacto className="w-auto max-w-[200px]" rotulo="Gestor" opcoes={op.gestores} vazio="Gestor" value={params.get("gestorId") ?? ""} onChange={(e) => setParam("gestorId", e.target.value)} />
            <Select compacto className="w-auto max-w-[200px]" rotulo="Analista" opcoes={op.analistas} vazio="Analista" value={params.get("analistaId") ?? ""} onChange={(e) => setParam("analistaId", e.target.value)} />
            <Select compacto className="w-auto max-w-[200px]" rotulo="Status" opcoes={statusOpcoes.map((s) => ({ valor: s, rotulo: s }))} vazio="Status" value={params.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value)} />
            <Select compacto className="w-auto max-w-[200px]" rotulo="Tipo de contrato" opcoes={op.tipos} vazio="Tipo de contrato" value={params.get("tipoContratoId") ?? ""} onChange={(e) => setParam("tipoContratoId", e.target.value)} />
            <Select
              compacto className="w-auto max-w-[200px]" rotulo="Tipo de processo"
              opcoes={TIPOS_PROCESSO.map((t) => ({ valor: t, rotulo: t }))}
              vazio="Tipo de processo"
              value={params.get("tipoProcesso") ?? ""}
              onChange={(e) => setParam("tipoProcesso", e.target.value)}
            />
            <Select
              compacto className="w-auto max-w-[200px]" rotulo="Vencimento"
              opcoes={[
                { valor: "30", rotulo: "Até 30 dias" },
                { valor: "60", rotulo: "Até 60 dias" },
                { valor: "90", rotulo: "Até 90 dias" },
                { valor: "180", rotulo: "Até 180 dias" },
                { valor: "vencidos", rotulo: "Vencidos" },
              ]}
              vazio="Vencimento"
              value={params.get("vencimento") ?? ""}
              onChange={(e) => setParam("vencimento", e.target.value)}
            />
            <Select
              compacto className="w-auto max-w-[200px]" rotulo="Renovação automática"
              opcoes={[
                { valor: "sim", rotulo: "Sim" },
                { valor: "nao", rotulo: "Não" },
              ]}
              vazio="Renovação automática"
              value={params.get("renovacaoAutomatica") ?? ""}
              onChange={(e) => setParam("renovacaoAutomatica", e.target.value)}
            />
            <Select compacto className="w-auto max-w-[200px]" rotulo="Moeda" opcoes={op.moedas} vazio="Moeda" value={params.get("moeda") ?? ""} onChange={(e) => setParam("moeda", e.target.value)} />
            <Select compacto className="w-auto max-w-[200px]" rotulo="Projeto" opcoes={op.projetos} vazio="Projeto" value={params.get("projeto") ?? ""} onChange={(e) => setParam("projeto", e.target.value)} />
            <Select compacto className="w-auto max-w-[200px]" rotulo="Cadastro" opcoes={[{ valor: "incompleto", rotulo: "A completar" }]} vazio="Cadastro" value={params.get("cadastro") ?? ""} onChange={(e) => setParam("cadastro", e.target.value)} />
            <div>
              <Button
                variante="fantasma"
                tamanho="sm"
                icone={<FilterX size={16} />}
                disabled={!filtrosAtivos}
                onClick={() => {
                  const n = new URLSearchParams();
                  if (params.get("aba")) n.set("aba", params.get("aba")!);
                  setParams(n, { replace: true });
                  setBusca("");
                }}
              >
                Limpar filtros{filtrosAtivos ? ` (${filtrosAtivos})` : ""}
              </Button>
            </div>
          </div>
        </div>

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
