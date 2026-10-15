import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, KeyRound, Plus, Upload, UserPlus, Wallet } from "lucide-react";
import { useApp } from "@/app/contexto";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Aviso, Carregando, Kpi } from "@/components/ui/Diversos";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabela } from "@/components/ui/Tabela";
import { Tabs } from "@/components/ui/Tabs";
import { alertasLicencas, colaboradorVisivel, resumoProduto, type ResumoProduto } from "@/domain/rules/licencas";
import { formatarData } from "@/domain/datas";
import { formatarMoeda, formatarNumero } from "@/domain/formatacao";
import type { Colaborador, Contrato, ProdutoLicenca } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api, type DadosLicencas } from "@/services";
import { AtribuirModal, ColaboradorModal, novoProduto, ProdutoLicencaModal } from "./formularios";
import { LinhasTelefonicas, PorPessoa, PorProduto } from "./vistas";

const ABAS = [
  { id: "visao", rotulo: "Visão geral" },
  { id: "produto", rotulo: "Por produto" },
  { id: "pessoa", rotulo: "Por pessoa" },
  { id: "linhas", rotulo: "Linhas telefônicas" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export interface Contexto {
  dados: DadosLicencas;
  contratos: Contrato[];
  resumos: Map<string, ResumoProduto>;
  podeGerir: boolean;
  editarProduto: (p: ProdutoLicenca) => void;
  editarColaborador: (c: Colaborador) => void;
  atribuir: (p: ProdutoLicenca) => void;
  irPara: (aba: Aba, chave?: string) => void;
  codigoContrato: (id?: string) => Contrato | undefined;
}

/** Controle de licenças: quem usa o que foi contratado. Não altera contratos. */
export function Licencas() {
  const { pode, usuario, executar, notificar } = useApp();
  const [params, setParams] = useSearchParams();
  const aba = (params.get("aba") as Aba) || "visao";
  const podeGerir = pode("gerir_licencas");
  const podeVerArea = pode("ver_licencas_da_area");
  const { dados: bruto, carregando } = useConsulta(() => api.listarLicencas(), []);
  const { dados: contratos } = useConsulta(() => api.listarContratos(), []);
  const [produtoEdit, setProdutoEdit] = useState<ProdutoLicenca>();
  const [colabEdit, setColabEdit] = useState<Colaborador>();
  const [atribuirEm, setAtribuirEm] = useState<ProdutoLicenca>();

  // Gestor vê só pessoas da própria área (dados pessoais — LGPD).
  const dados = useMemo<DadosLicencas | undefined>(() => {
    if (!bruto) return undefined;
    if (podeGerir) return bruto;
    const visiveis = new Set(bruto.colaboradores.filter((c) => colaboradorVisivel(c, usuario, false)).map((c) => c.id));
    return { ...bruto, colaboradores: bruto.colaboradores.filter((c) => visiveis.has(c.id)), atribuicoes: bruto.atribuicoes.filter((a) => visiveis.has(a.colaboradorId)) };
  }, [bruto, podeGerir, usuario]);

  const resumos = useMemo(() => new Map((dados?.produtos ?? []).map((p) => [p.id, resumoProduto(p, dados!.atribuicoes)])), [dados]);
  const porContrato = useMemo(() => new Map((contratos ?? []).map((c) => [c.contrato_id, c])), [contratos]);

  if (!podeGerir && !podeVerArea) return <Aviso tom="alerta" titulo="Acesso restrito">O controle de licenças é acessado por Administrador, Suprimentos, TI e gestores (somente a própria área).</Aviso>;
  if (carregando && !dados) return <Carregando />;
  if (!dados) return null;

  const ctx: Contexto = {
    dados,
    contratos: contratos ?? [],
    resumos,
    podeGerir,
    editarProduto: setProdutoEdit,
    editarColaborador: setColabEdit,
    atribuir: setAtribuirEm,
    irPara: (a, chave) => setParams(chave ? { aba: a, item: chave } : { aba: a }),
    codigoContrato: (id) => (id ? porContrato.get(id) : undefined),
  };

  const importar = async (f: File) => {
    const r = await executar(async () => api.importarLicencas(await f.text(), usuario.id));
    if (r) notificar(`Importação concluída: ${r.produtos} produtos, ${r.colaboradores} colaboradores, ${r.atribuicoes} atribuições. ${r.vinculadosAContrato} produtos ligados a contratos; ${r.semContrato} para vincular.`);
  };

  return (
    <>
      <PageHeader
        titulo="Controle de Licenças"
        descricao={podeGerir ? "Quem usa o que foi contratado. Os contratos não são alterados aqui." : `Licenças das pessoas da sua área${usuario.area ? ` (${usuario.area})` : ""}.`}
        acoes={
          podeGerir ? (
            <>
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-borda-forte bg-superficie px-4 text-sm font-medium hover:bg-fundo">
                <Upload size={16} /> Importar licenças
                <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => (e.target.files?.[0] && importar(e.target.files[0]), (e.target.value = ""))} />
              </label>
              <Button variante="secundario" icone={<UserPlus size={16} />} onClick={() => setColabEdit({ id: "", nome: "", tipo: "Pessoa", ativo: true })}>Novo colaborador</Button>
              <Button icone={<Plus size={16} />} onClick={() => setProdutoEdit(novoProduto())}>Novo produto</Button>
            </>
          ) : undefined
        }
      />
      {!podeGerir && !usuario.area && <div className="mb-4"><Aviso tom="alerta">Seu usuário não tem área cadastrada; peça ao Administrador para preencher em Usuários e perfis.</Aviso></div>}
      <Tabs className="mb-4" abas={[...ABAS]} ativa={aba} onChange={(a) => setParams({ aba: a })} />
      {aba === "visao" && <VisaoGeral ctx={ctx} />}
      {aba === "produto" && <PorProduto ctx={ctx} selecionado={params.get("item") ?? undefined} />}
      {aba === "pessoa" && <PorPessoa ctx={ctx} selecionado={params.get("item") ?? undefined} />}
      {aba === "linhas" && <LinhasTelefonicas ctx={ctx} />}

      <ProdutoLicencaModal produto={produtoEdit} contratos={contratos ?? []} onFechar={() => setProdutoEdit(undefined)} />
      <ColaboradorModal colaborador={colabEdit} onFechar={() => setColabEdit(undefined)} />
      <AtribuirModal produto={atribuirEm} colaboradores={dados.colaboradores} onFechar={() => setAtribuirEm(undefined)} />
    </>
  );
}

function VisaoGeral({ ctx }: { ctx: Contexto }) {
  const { dados, resumos } = ctx;
  const ativos = dados.produtos.filter((p) => p.situacao === "Ativo");
  const cancelados = dados.produtos.filter((p) => p.situacao !== "Ativo");
  const soma = (f: (r: ResumoProduto) => number | undefined, cat?: string) => ativos.filter((p) => !cat || p.categoria === cat).reduce((a, p) => a + (f(resumos.get(p.id)!) ?? 0), 0);
  const alertas = alertasLicencas(dados.produtos, dados.atribuicoes, dados.colaboradores);
  const semConversao = ativos.filter((p) => resumos.get(p.id)!.custoMensalBRL === undefined);
  const nomeProduto = new Map(dados.produtos.map((p) => [p.id, p]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rotulo="Licenças contratadas" valor={formatarNumero(soma((r) => r.contratadas, "Software"))} detalhe={`${ativos.filter((p) => p.categoria === "Software").length} produtos de software`} icone={<KeyRound size={18} />} />
        <Kpi rotulo="Em uso / livres" valor={<span>{formatarNumero(soma((r) => r.emUso, "Software"))} <span className="text-texto-fraco">/</span> {formatarNumero(soma((r) => r.livres, "Software"))}</span>} detalhe={`${soma((r) => r.excedente)} acima do contratado`} icone={<KeyRound size={18} />} tom={soma((r) => r.excedente) ? "alerta" : "neutro"} />
        <Kpi rotulo="Custo anual (BRL)" valor={formatarMoeda(soma((r) => r.custoAnualBRL), "BRL", true)} detalhe={`Com IOF e impostos: ${formatarMoeda(soma((r) => r.custoAnualComImpostosBRL), "BRL", true)}`} icone={<Wallet size={18} />} />
        <Kpi rotulo="Custo ocioso por ano" valor={formatarMoeda(soma((r) => r.custoOciosoAnualBRL), "BRL", true)} detalhe="Licenças pagas sem ninguém usando" icone={<AlertTriangle size={18} />} tom={soma((r) => r.custoOciosoAnualBRL) ? "alerta" : "neutro"} />
      </div>
      {semConversao.length > 0 && <Aviso tom="alerta">{semConversao.length} produto(s) em moeda estrangeira sem cotação: o custo em reais não entra nos totais ({semConversao.map((p) => p.nome).join(", ")}).</Aviso>}

      {alertas.length > 0 && (
        <Card>
          <CardHeader titulo={`Alertas (${alertas.length})`} subtitulo="Excesso de usuários, licenças ociosas, vencimentos próximos e pessoas inativas com licença" />
          <ul className="max-h-72 divide-y divide-borda overflow-y-auto">
            {alertas.map((a, i) => (
              <li key={i}>
                <button
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-fundo"
                  onClick={() => (a.produtoId ? ctx.irPara("produto", a.produtoId) : a.colaboradorId ? ctx.irPara("pessoa", a.colaboradorId) : undefined)}
                >
                  <Badge tom={a.gravidade === "Crítico" ? "critico" : "alerta"}>{a.tipo}</Badge>
                  <span className="min-w-0 flex-1">{a.mensagem}</span>
                  {a.produtoId && nomeProduto.get(a.produtoId)?.categoria === "Linha telefônica" && <span className="text-xs text-texto-fraco">linhas</span>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader titulo="Produtos licenciados" subtitulo="Clique em um produto para ver quem usa" />
        <Tabela<ProdutoLicenca>
          densa
          minLargura="min-w-[1100px]"
          linhas={[...ativos].sort((a, b) => (resumos.get(b.id)!.custoAnualBRL ?? 0) - (resumos.get(a.id)!.custoAnualBRL ?? 0))}
          chave={(p) => p.id}
          onLinha={(p) => ctx.irPara("produto", p.id)}
          vazio="Nenhum produto cadastrado. Use “Novo produto” ou “Importar licenças”."
          colunas={[
            { id: "n", titulo: "Produto", render: (p) => <span><span className="font-medium">{p.nome}</span><span className="block text-xs text-texto-suave">{p.fornecedorNome}{p.categoria === "Linha telefônica" ? " · linhas" : ""}</span></span> },
            {
              id: "c",
              titulo: "Contrato",
              render: (p) => {
                const c = ctx.codigoContrato(p.contrato_id);
                return c ? <Link onClick={(e) => e.stopPropagation()} to={`/contratos/${c.contrato_id}`} className="font-semibold whitespace-nowrap text-primaria-800 hover:underline">{c.codigo}</Link> : <Badge tom="alerta">Sem contrato</Badge>;
              },
            },
            { id: "q", titulo: "Contratadas", alinhamento: "direita", render: (p) => <span className="tabular">{resumos.get(p.id)!.contratadas}</span> },
            { id: "u", titulo: "Em uso", alinhamento: "direita", render: (p) => (p.controlePorUsuario === false ? <span className="text-xs text-texto-fraco" title="Uso não controlado por pessoa">não controlado</span> : <span className="tabular">{resumos.get(p.id)!.emUso}</span>) },
            {
              id: "l",
              titulo: "Livres",
              alinhamento: "direita",
              render: (p) => {
                const r = resumos.get(p.id)!;
                return r.excedente ? <Badge tom="critico">+{r.excedente} acima</Badge> : <span className="tabular">{r.livres}</span>;
              },
            },
            {
              id: "pct",
              titulo: "Uso",
              largura: "120px",
              render: (p) => {
                const pct = Math.min(100, resumos.get(p.id)!.percentualUso);
                return (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-fundo"><div className={`h-1.5 rounded-full ${resumos.get(p.id)!.excedente ? "bg-critico-600" : pct < 70 ? "bg-alerta-600" : "bg-primaria-600"}`} style={{ width: `${pct}%` }} /></div>
                    <span className="w-9 text-right text-xs tabular">{Math.round(resumos.get(p.id)!.percentualUso)}%</span>
                  </div>
                );
              },
            },
            { id: "cu", titulo: "Licença/mês", alinhamento: "direita", render: (p) => <span className="tabular">{p.categoria === "Linha telefônica" ? "—" : formatarMoeda(resumos.get(p.id)!.custoUnitarioMensalBRL)}</span> },
            { id: "ca", titulo: "Custo anual", alinhamento: "direita", render: (p) => <span className="tabular">{formatarMoeda(resumos.get(p.id)!.custoAnualBRL)}</span> },
            { id: "co", titulo: "Ocioso/ano", alinhamento: "direita", render: (p) => { const v = resumos.get(p.id)!.custoOciosoAnualBRL ?? 0; return <span className={`tabular ${v ? "text-alerta-600" : "text-texto-fraco"}`}>{v ? formatarMoeda(v) : "—"}</span>; } },
            { id: "v", titulo: "Vencimento", render: (p) => <span className="whitespace-nowrap tabular">{p.vencimento ? formatarData(p.vencimento) : p.vencimentoTexto ?? "—"}</span> },
            { id: "pend", titulo: "", render: (p) => (p.confirmacoesPendentes?.length ? <span title={p.confirmacoesPendentes.join("; ")}><Badge tom="alerta">Confirmar</Badge></span> : null) },
          ]}
        />
      </Card>

      {cancelados.length > 0 && (
        <Card>
          <CardHeader titulo="Cancelados e downgrades" subtitulo="Histórico — não entram nos totais" />
          <Tabela<ProdutoLicenca>
            densa
            linhas={cancelados}
            chave={(p) => p.id}
            onLinha={ctx.podeGerir ? ctx.editarProduto : undefined}
            colunas={[
              { id: "n", titulo: "Produto", render: (p) => p.nome },
              { id: "s", titulo: "Situação", render: (p) => <Badge>{p.situacao}</Badge> },
              { id: "u", titulo: "Utilização", render: (p) => <span className="text-xs text-texto-suave">{p.utilizacao ?? "—"}</span> },
              { id: "r", titulo: "Responsável", render: (p) => p.responsavel ?? "—" },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
