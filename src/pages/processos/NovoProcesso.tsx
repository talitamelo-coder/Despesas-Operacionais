import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, CloudUpload, Download, FilePlus2, RefreshCw, Repeat, Search, Wrench } from "lucide-react";
import { useApp, useOpcoes } from "@/app/contexto";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { GradeValores, Input, InputNumero, Select, Textarea, Valor } from "@/components/ui/Campos";
import { Aviso, Etapas } from "@/components/ui/Diversos";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { OrigemTag } from "@/components/ui/status";
import { cn } from "@/components/ui/cn";
import { valorAnualBRL } from "@/domain/rules/cambio";
import { requisitosInicio } from "@/domain/rules/fluxo";
import { herdarDeContrato } from "@/domain/rules/heranca";
import { formatarData } from "@/domain/datas";
import { formatarCnpj, formatarMoeda, formatarNumero, normalizarBusca } from "@/domain/formatacao";
import type { Contrato, DemandaJira, OrigemOportunidade, ProcessoContratacao, TipoProcesso, ValidacaoSuprimentos } from "@/domain/types";
import { CHAVES_JIRA_DEMONSTRACAO } from "@/integrations/jira";
import { useConsulta } from "@/hooks/useConsulta";
import { api } from "@/services";

const TIPOS: { tipo: TipoProcesso; icone: typeof FilePlus2; descricao: string }[] = [
  { tipo: "Nova contratação", icone: FilePlus2, descricao: "A partir de uma demanda do JIRA. Dados chegam como pré-cadastro." },
  { tipo: "Renovação", icone: RefreshCw, descricao: "Novo contrato com o mesmo fornecedor, herdando os dados do vigente." },
  { tipo: "Substituição de fornecedor", icone: Repeat, descricao: "Novo processo para trocar o fornecedor de um contrato vigente." },
  { tipo: "Aditivo", icone: Wrench, descricao: "Alteração de escopo, quantidade ou prazo de um contrato vigente." },
  { tipo: "Renegociação", icone: RefreshCw, descricao: "Revisão de condições comerciais sem trocar o fornecedor." },
];

const PASSOS = ["Tipo", "Origem", "Dados do processo", "Revisão"];

type Rascunho = Partial<ProcessoContratacao>;

/** Assistente de abertura de processo — salva rascunho automaticamente e exige campos por etapa. */
export function NovoProcesso() {
  const [params] = useSearchParams();
  const navegar = useNavigate();
  const { usuario, pode, executar, cad, fornecedor, nomeUsuario, nomeEmpresa } = useApp();
  const op = useOpcoes();
  const { dados: contratos } = useConsulta(() => api.listarContratos(), []);

  const tipoInicial = params.get("tipo") as TipoProcesso | null;
  const [passo, setPasso] = useState(tipoInicial ? 1 : 0);
  const [tipo, setTipo] = useState<TipoProcesso | undefined>(tipoInicial ?? undefined);
  const [dados, setDados] = useState<Rascunho>({ analistaId: usuario.perfil === "Suprimentos" ? usuario.id : undefined, origens: {} });
  const [processoId, setProcessoId] = useState<string>();
  const [salvoEm, setSalvoEm] = useState<string>();
  const [salvando, setSalvando] = useState(false);
  const [jiraKey, setJiraKey] = useState("");
  const [buscandoJira, setBuscandoJira] = useState(false);
  const [jiraErro, setJiraErro] = useState<string>();
  const [validacao, setValidacao] = useState<ValidacaoSuprimentos>({});
  const [buscaContrato, setBuscaContrato] = useState("");
  const [tentouAvancar, setTentouAvancar] = useState(false);
  const criando = useRef<Promise<string> | null>(null);

  const set = (p: Rascunho, origem?: "manual") => {
    setDados((d) => {
      const origens = { ...d.origens };
      // Campo editado pelo usuário deixa de ser "herdado/importado".
      if (origem) for (const k of Object.keys(p)) origens[k] = "manual";
      return { ...d, ...p, origens };
    });
  };

  // Herança quando vem da Capa (?contrato=)
  const contratoParam = params.get("contrato");
  useEffect(() => {
    if (!contratoParam || !contratos || !tipo || dados.contrato_anterior_id) return;
    const c = contratos.find((x) => x.contrato_id === contratoParam);
    if (c) aplicarHeranca(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoParam, contratos, tipo]);

  function aplicarHeranca(c: Contrato) {
    if (!tipo) return;
    let n = 0;
    const h = herdarDeContrato(c, tipo, () => `pr-${Date.now().toString(36)}-${n++}`);
    setDados((d) => ({ ...d, ...h, origemOportunidade: d.origemOportunidade, analistaId: d.analistaId ?? h.analistaId, objeto: tipo === "Aditivo" ? `Aditivo — ${c.objeto}` : h.objeto }));
  }

  // ---------------------------------------------------------------- Salvamento automático do rascunho
  const temConteudo = Boolean(tipo && (dados.objeto || dados.empresaId || dados.contrato_anterior_id || dados.jira_key));
  useEffect(() => {
    if (!temConteudo || !pode("editar_processo")) return;
    const t = setTimeout(async () => {
      setSalvando(true);
      try {
        const { origens, ...resto } = dados;
        if (!processoId) {
          criando.current ??= api.criarProcesso(tipo!, { ...resto, origens }, usuario.id).then((p) => p.processo_id);
          const pid = await criando.current;
          setProcessoId(pid);
        } else {
          await api.atualizarProcesso(processoId, { ...resto, origens }, usuario.id);
        }
        setSalvoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      } catch {
        /* falha de autosave não bloqueia o preenchimento */
      } finally {
        setSalvando(false);
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, tipo, temConteudo]);

  // ---------------------------------------------------------------- JIRA
  async function carregarJira() {
    setBuscandoJira(true);
    setJiraErro(undefined);
    const d = await api.buscarDemandaJira(jiraKey);
    setBuscandoJira(false);
    if (!d) {
      setJiraErro("Chamado não encontrado no JIRA.");
      return;
    }
    const empresa = cad.empresas.find((e) => normalizarBusca(e.nome) === normalizarBusca(d.empresa));
    const gestor = cad.usuarios.find((u) => normalizarBusca(u.nome) === normalizarBusca(d.gestor));
    setDados((x) => ({
      ...x,
      jira_key: d.jira_key,
      demandaJira: d,
      empresaId: empresa?.id ?? x.empresaId,
      gestorId: gestor?.id ?? x.gestorId,
      objeto: d.descricao,
      origemOportunidade: x.origemOportunidade ?? "Área solicitante",
      origens: { ...x.origens, jira_key: "importado", demandaJira: "importado", empresaId: empresa ? "importado" : "manual", gestorId: gestor ? "importado" : "manual", objeto: "importado" },
    }));
    setValidacao({ valorValidado: d.valorEstimado, quantidadeValidada: d.quantidade });
  }

  // ---------------------------------------------------------------- Validações por passo
  const pendenciasPasso = useMemo(() => {
    if (passo === 0) return tipo ? [] : ["Tipo de processo"];
    if (passo === 1) {
      if (tipo === "Nova contratação") return [];
      return dados.contrato_anterior_id ? [] : ["Contrato anterior"];
    }
    if (passo === 2) return requisitosInicio({ ...(dados as ProcessoContratacao), tipo: tipo!, propostas: dados.propostas ?? [] }).map((p) => p.mensagem);
    return [];
  }, [passo, tipo, dados]);

  const avancar = () => {
    setTentouAvancar(true);
    if (pendenciasPasso.length) return;
    setTentouAvancar(false);
    setPasso((p) => p + 1);
  };

  async function iniciar() {
    let pid = processoId;
    if (!pid) {
      const { origens, ...resto } = dados;
      const p = await executar(() => api.criarProcesso(tipo!, { ...resto, origens }, usuario.id));
      if (!p) return;
      pid = p.processo_id;
    } else {
      const { origens, ...resto } = dados;
      await api.atualizarProcesso(pid, { ...resto, origens }, usuario.id);
    }
    if (tipo === "Nova contratação" && dados.demandaJira && (validacao.valorValidado !== undefined || validacao.quantidadeValidada !== undefined) && validacao.observacao !== undefined) {
      await executar(() => api.validarDemanda(pid!, validacao, usuario.id));
    }
    const r = await executar(() => api.avancarProcesso(pid!, usuario.id));
    // Se houver pendência não prevista, o processo abre em rascunho mostrando o que falta.
    if (r) navegar(`/processos/${pid}`, { replace: true });
  }

  if (!pode("editar_processo")) {
    return (
      <>
        <PageHeader titulo="Novo processo" />
        <Aviso tom="info" titulo="Abertura de processos é feita por Suprimentos">
          Gestores iniciam renovações respondendo à avaliação do contrato e novas demandas pelo JIRA.
        </Aviso>
      </>
    );
  }

  const contratosElegiveis = (contratos ?? [])
    .filter((c) => c.status === "Vigente" && !c.sucessor_id)
    .filter((c) => !buscaContrato || normalizarBusca(`${c.codigo} ${c.objeto} ${fornecedor(c.fornecedorId)?.razaoSocial}`).includes(normalizarBusca(buscaContrato)))
    .sort((a, b) => Number(b.contrato_id === dados.contrato_anterior_id) - Number(a.contrato_id === dados.contrato_anterior_id))
    .slice(0, 30);
  const anterior = contratos?.find((c) => c.contrato_id === dados.contrato_anterior_id);
  const erroCampo = (campo: string) => (tentouAvancar && passo === 2 && requisitosInicio({ ...(dados as ProcessoContratacao), tipo: tipo!, propostas: [] }).some((p) => p.campo === campo) ? "Obrigatório para iniciar" : undefined);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        migalhas={[{ rotulo: "Central de Contratos", para: "/contratos" }, { rotulo: "Novo processo" }]}
        titulo="Novo processo de contratação"
        descricao="Preencha apenas o essencial: os demais campos são exigidos nas etapas seguintes do processo."
        acoes={
          <span className="flex items-center gap-1.5 text-xs text-texto-suave">
            <CloudUpload size={14} />
            {salvando ? "Salvando rascunho…" : salvoEm ? `Rascunho salvo às ${salvoEm}` : "O rascunho é salvo automaticamente"}
          </span>
        }
      />

      <Card className="mb-4">
        <CardBody>
          <Etapas etapas={PASSOS} atual={passo} />
        </CardBody>
      </Card>

      {passo === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TIPOS.map((t) => (
            <button
              key={t.tipo}
              onClick={() => {
                setTipo(t.tipo);
                setPasso(1);
              }}
              className={cn("rounded-[var(--radius-cartao)] border bg-superficie p-4 text-left transition-shadow hover:shadow-md", tipo === t.tipo ? "border-primaria-500 ring-2 ring-primaria-100" : "border-borda")}
            >
              <t.icone size={20} className="mb-2 text-primaria-700" />
              <p className="text-sm font-semibold">{t.tipo}</p>
              <p className="mt-1 text-xs text-texto-suave">{t.descricao}</p>
            </button>
          ))}
        </div>
      )}

      {passo === 1 && tipo === "Nova contratação" && (
        <Card>
          <CardHeader titulo="Demanda do JIRA" subtitulo="Informe o chamado para carregar a solicitação. Os dados chegam como pré-cadastro." />
          <CardBody className="space-y-4">
            <div className="flex items-end gap-2">
              <Input rotulo="Chamado JIRA" className="w-60" value={jiraKey} onChange={(e) => setJiraKey(e.target.value.toUpperCase())} placeholder="COMP-0000" onKeyDown={(e) => e.key === "Enter" && carregarJira()} />
              <Button variante="secundario" icone={<Download size={16} />} disabled={!jiraKey || buscandoJira} onClick={carregarJira}>
                {buscandoJira ? "Buscando…" : "Carregar dados"}
              </Button>
              <span className="pb-2 text-xs text-texto-fraco">Demonstração: {CHAVES_JIRA_DEMONSTRACAO.join(", ")}</span>
            </div>
            {jiraErro && <Aviso tom="alerta">{jiraErro}</Aviso>}
            {dados.demandaJira && <DemandaJiraCard d={dados.demandaJira} />}
            {!dados.demandaJira && <p className="text-xs text-texto-suave">Sem chamado? Avance e preencha os dados manualmente (origem "Manual").</p>}
          </CardBody>
        </Card>
      )}

      {passo === 1 && tipo !== "Nova contratação" && (
        <Card>
          <CardHeader titulo="Contrato anterior" subtitulo="Os dados serão herdados automaticamente e poderão ser editados no novo processo." />
          <CardBody className="space-y-3">
            <div className="relative">
              <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-texto-fraco" />
              <input value={buscaContrato} onChange={(e) => setBuscaContrato(e.target.value)} placeholder="Buscar contrato vigente por código, objeto ou fornecedor" className="h-9 w-full rounded-md border border-borda-forte pr-3 pl-9 text-sm" />
            </div>
            <ul className="max-h-80 divide-y divide-borda overflow-y-auto rounded-md border border-borda">
              {contratosElegiveis.map((c) => (
                <li key={c.contrato_id}>
                  <button onClick={() => aplicarHeranca(c)} className={cn("flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-fundo", dados.contrato_anterior_id === c.contrato_id && "bg-primaria-50")}>
                    <span className="w-28 shrink-0 text-xs font-semibold text-primaria-800">{c.codigo}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.objeto}</span>
                      <span className="block truncate text-xs text-texto-suave">{fornecedor(c.fornecedorId)?.razaoSocial}</span>
                    </span>
                    <span className="text-xs text-texto-suave tabular">até {formatarData(c.vigencia.dataFim)}</span>
                    {dados.contrato_anterior_id === c.contrato_id && <CheckCircle2 size={16} className="text-primaria-700" />}
                  </button>
                </li>
              ))}
            </ul>
            {anterior && <HerancaResumo c={anterior} tipo={tipo!} />}
            {tentouAvancar && pendenciasPasso.length > 0 && <Aviso tom="alerta">Selecione o contrato anterior.</Aviso>}
          </CardBody>
        </Card>
      )}

      {passo === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader titulo="Dados para iniciar o processo" subtitulo="Obrigatórios agora: origem, empresa, objeto e gestor" />
            <CardBody>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Select rotulo="Origem da oportunidade" obrigatorio opcoes={op.origensOportunidade} value={dados.origemOportunidade ?? ""} onChange={(e) => set({ origemOportunidade: (e.target.value || undefined) as OrigemOportunidade }, "manual")} erro={erroCampo("origemOportunidade")} />
                <Select rotulo="Empresa" obrigatorio opcoes={op.empresas} origem={dados.origens?.empresaId} value={dados.empresaId ?? ""} onChange={(e) => set({ empresaId: e.target.value || undefined }, "manual")} erro={erroCampo("empresaId")} />
                <Textarea rotulo="Objeto" obrigatorio className="md:col-span-2" origem={dados.origens?.objeto} value={dados.objeto ?? ""} onChange={(e) => set({ objeto: e.target.value }, "manual")} erro={erroCampo("objeto")} />
                <Select rotulo="Gestor" obrigatorio opcoes={op.gestores} origem={dados.origens?.gestorId} value={dados.gestorId ?? ""} onChange={(e) => set({ gestorId: e.target.value || undefined }, "manual")} erro={erroCampo("gestorId")} />
                <Select rotulo="Analista de Suprimentos" opcoes={op.analistas} value={dados.analistaId ?? ""} onChange={(e) => set({ analistaId: e.target.value || undefined })} />
                {tipo === "Substituição de fornecedor" && (
                  <Textarea rotulo="Motivo da substituição" obrigatorio className="md:col-span-2" value={dados.motivoSubstituicao ?? ""} onChange={(e) => set({ motivoSubstituicao: e.target.value })} erro={erroCampo("motivoSubstituicao")} ajuda={cad.config.listasAuxiliares["Motivos de substituição"]?.join(" · ")} />
                )}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader titulo="Complementares (opcionais nesta etapa)" />
            <CardBody>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Select rotulo="Diretor (ciência)" opcoes={op.diretores} origem={dados.origens?.diretorId} value={dados.diretorId ?? ""} onChange={(e) => set({ diretorId: e.target.value || undefined }, "manual")} />
                <Select rotulo="Tipo de contrato" opcoes={op.tipos} origem={dados.origens?.tipoContratoId} value={dados.tipoContratoId ?? ""} onChange={(e) => set({ tipoContratoId: e.target.value || undefined }, "manual")} />
                <Input rotulo="Centro de custo" origem={dados.origens?.centroCusto} value={dados.centroCusto ?? ""} onChange={(e) => set({ centroCusto: e.target.value }, "manual")} />
                <Select rotulo="Projeto" opcoes={op.projetos} origem={dados.origens?.projeto} value={dados.projeto ?? ""} onChange={(e) => set({ projeto: e.target.value || undefined }, "manual")} />
              </div>
            </CardBody>
          </Card>
          {tipo === "Nova contratação" && dados.demandaJira && pode("validar_demanda") && (
            <Card>
              <CardHeader titulo="Validação de Suprimentos" subtitulo="Compare o que foi solicitado com o que Suprimentos valida. Opcional agora — pode ser feita na etapa de validação." />
              <CardBody>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <Valor rotulo="Valor solicitado" origem="importado">{formatarMoeda(dados.demandaJira.valorEstimado)}</Valor>
                  <InputNumero rotulo="Valor validado (anual, BRL)" valor={validacao.valorValidado} onValor={(v) => setValidacao((x) => ({ ...x, valorValidado: v }))} />
                  <Valor rotulo="Quantidade solicitada" origem="importado">{formatarNumero(dados.demandaJira.quantidade)}</Valor>
                  <InputNumero rotulo="Quantidade validada" valor={validacao.quantidadeValidada} onValor={(v) => setValidacao((x) => ({ ...x, quantidadeValidada: v }))} />
                  <Textarea rotulo="Observação da validação" className="md:col-span-4" value={validacao.observacao ?? ""} onChange={(e) => setValidacao((x) => ({ ...x, observacao: e.target.value }))} ajuda="Preencha a observação para registrar a validação ao iniciar o processo." />
                </div>
              </CardBody>
            </Card>
          )}
          {tentouAvancar && pendenciasPasso.length > 0 && <Aviso tom="alerta" titulo="Para continuar, informe:">{pendenciasPasso.join(", ")}</Aviso>}
        </div>
      )}

      {passo === 3 && (
        <Card>
          <CardHeader titulo="Revisão" subtitulo="Ao iniciar, o processo sai do rascunho e segue para a próxima etapa." />
          <CardBody className="space-y-4">
            <GradeValores>
              <Valor rotulo="Tipo">{tipo}</Valor>
              <Valor rotulo="Origem">{dados.jira_key ? `JIRA ${dados.jira_key}` : anterior ? `${anterior.codigo} (contrato anterior)` : "Manual"}</Valor>
              <Valor rotulo="Origem da oportunidade">{dados.origemOportunidade}</Valor>
              <Valor rotulo="Empresa" origem={dados.origens?.empresaId}>{nomeEmpresa(dados.empresaId)}</Valor>
              <Valor rotulo="Gestor" origem={dados.origens?.gestorId}>{nomeUsuario(dados.gestorId)}</Valor>
              <Valor rotulo="Analista">{nomeUsuario(dados.analistaId)}</Valor>
              <Valor rotulo="Objeto" className="sm:col-span-2 lg:col-span-3" origem={dados.origens?.objeto}>{dados.objeto}</Valor>
              {dados.motivoSubstituicao && <Valor rotulo="Motivo da substituição" className="sm:col-span-2 lg:col-span-3">{dados.motivoSubstituicao}</Valor>}
            </GradeValores>
            {dados.demandaJira && !validacao.observacao && <Badge tom="alerta">Não validado por Suprimentos</Badge>}
          </CardBody>
        </Card>
      )}

      <div className="mt-4 flex items-center justify-between">
        <Button variante="secundario" icone={<ArrowLeft size={16} />} disabled={passo === 0} onClick={() => setPasso((p) => p - 1)}>
          Voltar
        </Button>
        {passo < 3 ? (
          <Button onClick={avancar} disabled={passo === 0 && !tipo}>
            Continuar <ArrowRight size={16} />
          </Button>
        ) : (
          <Button icone={<CheckCircle2 size={16} />} onClick={iniciar}>
            Iniciar processo
          </Button>
        )}
      </div>
    </div>
  );
}

function DemandaJiraCard({ d }: { d: DemandaJira }) {
  return (
    <div className="rounded-md border border-alerta-50 bg-alerta-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold">{d.jira_key}</span>
        <OrigemTag origem="importado" />
        <Badge tom="alerta">Não validado por Suprimentos</Badge>
      </div>
      <GradeValores colunas={4}>
        <Valor rotulo="Solicitante">{d.solicitante}</Valor>
        <Valor rotulo="Empresa">{d.empresa}</Valor>
        <Valor rotulo="Área">{d.area}</Valor>
        <Valor rotulo="Gestor">{d.gestor}</Valor>
        <Valor rotulo="Descrição" className="sm:col-span-2 lg:col-span-4">{d.descricao}</Valor>
        <Valor rotulo="Justificativa" className="sm:col-span-2 lg:col-span-4">{d.justificativa}</Valor>
        <Valor rotulo="Quantidade">{formatarNumero(d.quantidade)}</Valor>
        <Valor rotulo="Valor estimado">{formatarMoeda(d.valorEstimado)}</Valor>
        <Valor rotulo="Fornecedores indicados" className="sm:col-span-2">{d.fornecedoresIndicados.join(", ") || "—"}</Valor>
        <Valor rotulo="Anexos" className="sm:col-span-2 lg:col-span-4">{d.anexos.join(", ") || "—"}</Valor>
      </GradeValores>
    </div>
  );
}

function HerancaResumo({ c, tipo }: { c: Contrato; tipo: TipoProcesso }) {
  const { nomeEmpresa, nomeUsuario, fornecedor, nomeTipo } = useApp();
  const f = fornecedor(c.fornecedorId);
  const itens: [string, string][] = [
    ["Empresa", nomeEmpresa(c.empresaId)],
    ["Fornecedor", f?.razaoSocial ?? "—"],
    ["CNPJ", formatarCnpj(f?.cnpj)],
    ["Objeto", c.objeto],
    ["Gestor", nomeUsuario(c.gestorId)],
    ["Diretor", nomeUsuario(c.diretorId)],
    ["Centro de custo", c.centroCusto ?? "—"],
    ["Projeto", c.projeto ?? "—"],
    ["Tipo", nomeTipo(c.tipoContratoId)],
    ["Moeda", c.condicoes.moeda],
    ["Quantidade", c.condicoes.quantidade ? `${formatarNumero(c.condicoes.quantidade)} ${c.condicoes.unidade ?? ""}` : "—"],
    ["Valor anterior", formatarMoeda(valorAnualBRL(c.condicoes))],
    ["Periodicidade", c.condicoes.periodicidadePagamento],
    ["Cotação anterior", c.condicoes.cotacao ? `${formatarNumero(c.condicoes.cotacao.valor, 4)} (${c.condicoes.cotacao.fonte})` : "—"],
    ["Condição de pagamento", c.condicoes.condicaoPagamento || "—"],
    ["Reajuste", c.reajuste.possui ? `${c.reajuste.indice} ${c.reajuste.percentualPrevisto ?? ""}%` : "Não"],
    ["Multa", c.rescisao.possuiMulta ? c.rescisao.regra ?? `${c.rescisao.percentual}%` : "Não"],
    ["Aviso prévio", `${c.vigencia.avisoPrevioDias} dias`],
  ];
  return (
    <div className="rounded-md border border-primaria-100 bg-primaria-50/40 p-4">
      <p className="mb-3 flex items-center text-sm font-semibold">
        Dados herdados de {c.codigo} <OrigemTag origem="herdado" />
        {tipo === "Substituição de fornecedor" && <span className="ml-2 text-xs font-normal text-texto-suave">(o fornecedor atual será registrado como fornecedor anterior)</span>}
      </p>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {itens.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-primaria-100 py-1">
            <span className="text-texto-suave">{k}</span>
            <span className="truncate text-right font-medium">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
