import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Ban, CheckCircle2, Circle, Pause, Play, Plus, Save, Trash2 } from "lucide-react";
import { useApp, useOpcoes } from "@/app/contexto";
import { DocumentosLista } from "@/components/dominio/DocumentosLista";
import { SavingEditor } from "@/components/dominio/SavingEditor";
import { SavingResumo } from "@/components/dominio/SavingResumo";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { GradeValores, Input, InputNumero, Select, Textarea, Toggle, Valor } from "@/components/ui/Campos";
import { Aviso, Carregando, Etapas, Timeline, Vazio } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/status";
import { converterParaBRL } from "@/domain/rules/cambio";
import { etapasDoProcesso, indiceEtapa, processoAtivo, propostaRecomendada, proximoStatus, requisitosPara, valorNegociado } from "@/domain/rules/fluxo";
import { formatarDataHora } from "@/domain/datas";
import { formatarMoeda, formatarNumero } from "@/domain/formatacao";
import type { Documento, FonteCotacao, Moeda, Periodicidade, ProcessoContratacao, PropostaFornecedor, StatusJuridico } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api } from "@/services";
import { AprovacoesResumo } from "../contratos/CapaContrato";

function Secao({ titulo, subtitulo, children, acoes }: { titulo: string; subtitulo?: string; children: ReactNode; acoes?: ReactNode }) {
  return (
    <Card>
      <CardHeader titulo={titulo} subtitulo={subtitulo} acoes={acoes} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export function ProcessoDetalhe() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { usuario, pode, executar, nomeUsuario, nomeEmpresa, fornecedor } = useApp();
  const { dados: p, carregando } = useConsulta(() => api.obterProcesso(id), [id]);
  const { dados: docs } = useConsulta(() => api.listarDocumentos({ processo_id: id }), [id]);
  const { dados: contratos } = useConsulta(() => api.listarContratos(), []);
  const [edit, setEdit] = useState<ProcessoContratacao>();
  const [pendencias, setPendencias] = useState<string[]>();
  const [modal, setModal] = useState<"suspender" | "cancelar">();
  const [motivo, setMotivo] = useState("");

  useEffect(() => setEdit(p ? structuredClone(p) : undefined), [p]);

  const sujo = useMemo(() => Boolean(p && edit && JSON.stringify(p) !== JSON.stringify(edit)), [p, edit]);
  if (carregando && !p) return <Carregando />;
  if (!p || !edit) return <Vazio titulo="Processo não encontrado" acao={<Link to="/contratos" className="text-sm text-primaria-700">Voltar à Central</Link>} />;

  const ativo = processoAtivo(p) && p.status !== "Suspenso";
  const editavel = ativo && pode("editar_processo");
  const destino = proximoStatus(p);
  const faltando = destino ? requisitosPara(destino, edit, (docs ?? []) as Documento[]) : [];
  const anterior = contratos?.find((c) => c.contrato_id === p.contrato_anterior_id);
  const gerado = contratos?.find((c) => c.contrato_id === p.contrato_gerado_id);
  const set = (patch: Partial<ProcessoContratacao>) => setEdit((e) => ({ ...e!, ...patch }));
  const rec = propostaRecomendada(edit);
  const negociado = valorNegociado(edit);
  const etapas = etapasDoProcesso(p);

  async function salvar(silencioso = false) {
    if (!sujo) return true;
    const { status: _s, timeline: _t, aprovacoes: _a, juridico: _j, assinatura: _as, ...patch } = edit!;
    if (!pode("editar_saving")) delete (patch as Partial<ProcessoContratacao>).saving;
    const r = await executar(() => api.atualizarProcesso(id, patch, usuario.id), silencioso ? undefined : "Alterações salvas.");
    return Boolean(r);
  }

  async function avancar() {
    if (!(await salvar(true))) return;
    const r = await executar(() => api.avancarProcesso(id, usuario.id));
    if (!r) return;
    if (!r.ok) setPendencias(r.pendencias.map((x) => x.mensagem));
    else if (r.contratoGerado) {
      navegar(`/contratos/${r.contratoGerado.contrato_id}`);
    }
  }

  // Sincroniza saving.valorNegociado com a proposta recomendada (BRL) — valor calculado, não digitado.
  const negociadoBRL = negociado !== undefined && rec ? converterParaBRL(negociado, rec.moeda, edit.condicoes?.cotacao) : undefined;

  return (
    <>
      <PageHeader
        migalhas={[{ rotulo: "Central de Contratos", para: "/contratos?aba=Em contratação" }, { rotulo: p.codigo }]}
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {p.codigo} <StatusBadge status={p.status} /> <Badge tom="primario">{p.tipo}</Badge>
          </span>
        }
        descricao={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span>{p.objeto ?? "Sem objeto"}</span>
            {p.jira_key && <span>Origem: JIRA <b>{p.jira_key}</b></span>}
            {anterior && (
              <span>
                {p.tipo === "Substituição de fornecedor" ? "Substitui" : "Contrato anterior"}: <Link className="font-semibold text-primaria-800 hover:underline" to={`/contratos/${anterior.contrato_id}`}>{anterior.codigo}</Link>
              </span>
            )}
            {gerado && (
              <span>
                Contrato gerado: <Link className="font-semibold text-primaria-800 hover:underline" to={`/contratos/${gerado.contrato_id}`}>{gerado.codigo}</Link>
              </span>
            )}
          </span>
        }
        acoes={
          pode("editar_processo") && processoAtivo(p) ? (
            <>
              {p.status === "Rascunho" && (
                <Button variante="fantasma" icone={<Trash2 size={16} />} onClick={async () => (await executar(() => api.excluirRascunho(id, usuario.id), "Rascunho excluído."), navegar("/contratos"))}>
                  Excluir rascunho
                </Button>
              )}
              {p.status === "Suspenso" ? (
                <Button variante="secundario" icone={<Play size={16} />} onClick={() => executar(() => api.retomarProcesso(id, usuario.id), "Processo retomado.")}>Retomar</Button>
              ) : (
                <Button variante="secundario" icone={<Pause size={16} />} onClick={() => setModal("suspender")}>Suspender</Button>
              )}
              <Button variante="secundario" icone={<Ban size={16} />} onClick={() => setModal("cancelar")}>Cancelar</Button>
              {sujo && <Button variante="secundario" icone={<Save size={16} />} onClick={() => salvar()}>Salvar</Button>}
              {destino && ativo && (
                <Button icone={<ArrowRight size={16} />} onClick={avancar}>
                  {destino === "Concluído" ? (p.tipo === "Aditivo" ? "Concluir e aplicar aditivo" : "Concluir e gerar contrato") : `Avançar para ${destino}`}
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <CardBody>
          <Etapas etapas={etapas} atual={p.status === "Cancelado" ? -1 : indiceEtapa(p)} suspenso={p.status === "Suspenso"} />
        </CardBody>
      </Card>

      {p.status === "Suspenso" && <div className="mb-4"><Aviso tom="alerta" titulo="Processo suspenso">Retome para continuar a partir de {p.statusAntesSuspensao}.</Aviso></div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <SecaoDadosGerais edit={edit} set={set} editavel={editavel} />
          {p.demandaJira && <SecaoValidacao p={p} editavel={editavel && pode("validar_demanda")} />}
          <SecaoCotacao edit={edit} set={set} editavel={editavel} />
          <SecaoNegociacao edit={edit} set={set} editavel={editavel} negociado={negociado} />
          <Secao titulo="Saving" subtitulo="Indicador principal: saving anual em BRL">
            {edit.saving ? (
              editavel ? (
                <SavingEditor
                  saving={edit.saving}
                  bloqueado={!pode("editar_saving")}
                  onChange={(s) => set({ saving: s })}
                  valorAnterior={anterior ? converterParaBRL(anterior.condicoes.valorAnual, anterior.condicoes.moeda, anterior.condicoes.cotacao) : undefined}
                  reajustePrevisto={anterior?.reajuste.percentualPrevisto}
                />
              ) : (
                <SavingResumo saving={edit.saving} />
              )
            ) : editavel && pode("editar_saving") ? (
              <Button
                variante="secundario"
                icone={<Plus size={16} />}
                onClick={() => set({ saving: { tipoBaseline: anterior ? "Contrato anterior" : "Proposta inicial", baselineAnual: anterior ? converterParaBRL(anterior.condicoes.valorAnual, anterior.condicoes.moeda, anterior.condicoes.cotacao) ?? 0 : (rec && converterParaBRL(rec.propostaInicialAnual, rec.moeda, edit.condicoes?.cotacao)) ?? 0, valorNegociadoAnual: negociadoBRL ?? 0, componentes: [], origemOportunidade: edit.origemOportunidade ?? "Suprimentos" } })}
              >
                Registrar saving
              </Button>
            ) : (
              <p className="text-sm text-texto-suave">Saving ainda não registrado.</p>
            )}
            {edit.saving && negociadoBRL !== undefined && Math.abs(edit.saving.valorNegociadoAnual - negociadoBRL) > 0.5 && (
              <div className="mt-3">
                <Aviso tom="alerta">
                  Valor negociado no saving ({formatarMoeda(edit.saving.valorNegociadoAnual)}) difere da proposta recomendada ({formatarMoeda(negociadoBRL)}).
                  {editavel && pode("editar_saving") && (
                    <button className="ml-2 underline" onClick={() => set({ saving: { ...edit.saving!, valorNegociadoAnual: Math.round(negociadoBRL * 100) / 100 } })}>Usar valor da proposta</button>
                  )}
                </Aviso>
              </div>
            )}
          </Secao>
          <SecaoAprovacoes p={p} />
          <SecaoJuridico p={p} />
          <Secao titulo="Assinatura" subtitulo="Assinatura eletrônica própria não faz parte do MVP — integração futura (Adobe)">
            <GradeValores colunas={3}>
              <Valor rotulo="Status">{p.assinatura.status}</Valor>
              <Valor rotulo="Data">{p.assinatura.data ?? "—"}</Valor>
              <Valor rotulo="Envelope (integração)">{p.assinatura.envelope_id ?? "—"}</Valor>
            </GradeValores>
            {p.status === "Aguardando assinatura" && <p className="mt-3 text-xs text-texto-suave">Anexe o documento “Contrato assinado” e conclua o processo para gerar o contrato vigente.</p>}
          </Secao>
          <Card>
            <CardHeader titulo="Documentos do processo" />
            <DocumentosLista processo_id={p.processo_id} />
          </Card>
        </div>

        <div className="space-y-4">
          {destino && ativo && (
            <Secao titulo={`Para avançar: ${destino}`}>
              {faltando.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-sucesso-600"><CheckCircle2 size={16} /> Tudo pronto para avançar.</p>
              ) : (
                <ul className="space-y-1.5">
                  {faltando.map((f) => (
                    <li key={f.mensagem} className="flex items-start gap-2 text-sm"><Circle size={14} className="mt-0.5 shrink-0 text-texto-fraco" /> {f.mensagem}</li>
                  ))}
                </ul>
              )}
            </Secao>
          )}
          <Secao titulo="Resumo">
            <div className="space-y-3">
              <Valor rotulo="Empresa">{nomeEmpresa(p.empresaId)}</Valor>
              <Valor rotulo="Gestor / Analista">{nomeUsuario(p.gestorId)} / {nomeUsuario(p.analistaId)}</Valor>
              <Valor rotulo="Fornecedor recomendado">{rec ? (rec.fornecedorId ? fornecedor(rec.fornecedorId)?.razaoSocial : `${rec.fornecedorPotencial} (potencial)`) : "—"}</Valor>
              <Valor rotulo="Proposta inicial">{rec ? formatarMoeda(rec.propostaInicialAnual, rec.moeda) : "—"}</Valor>
              <Valor rotulo="Valor negociado" origem="calculado">{negociado !== undefined && rec ? formatarMoeda(negociado, rec.moeda) : "—"}</Valor>
              <Valor rotulo="Saving anual" origem="calculado">{edit.saving ? <span className="text-sucesso-600">{formatarMoeda(edit.saving.baselineAnual - edit.saving.valorNegociadoAnual)}</span> : "—"}</Valor>
            </div>
          </Secao>
          <Secao titulo="Timeline">
            <Timeline itens={[...p.timeline].reverse().map((t) => ({ id: t.id, titulo: t.descricao, quando: formatarDataHora(t.data), quem: nomeUsuario(t.usuarioId) }))} />
          </Secao>
        </div>
      </div>

      <Modal aberto={Boolean(pendencias)} titulo="Pendências para avançar" onFechar={() => setPendencias(undefined)} rodape={<Button onClick={() => setPendencias(undefined)}>Entendi</Button>}>
        <ul className="list-disc space-y-1 pl-5 text-sm">{pendencias?.map((x) => <li key={x}>{x}</li>)}</ul>
      </Modal>
      <Modal
        aberto={Boolean(modal)}
        titulo={modal === "cancelar" ? "Cancelar processo" : "Suspender processo"}
        onFechar={() => setModal(undefined)}
        rodape={
          <>
            <Button variante="secundario" onClick={() => setModal(undefined)}>Voltar</Button>
            <Button
              variante={modal === "cancelar" ? "perigo" : "primario"}
              disabled={!motivo.trim()}
              onClick={async () => {
                const ok = await executar(() => (modal === "cancelar" ? api.cancelarProcesso(id, motivo, usuario.id) : api.suspenderProcesso(id, motivo, usuario.id)), "Processo atualizado.");
                if (ok) {
                  setModal(undefined);
                  setMotivo("");
                }
              }}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <Textarea rotulo="Motivo" obrigatorio value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </Modal>
    </>
  );
}

type Props = { edit: ProcessoContratacao; set: (p: Partial<ProcessoContratacao>) => void; editavel: boolean };

function SecaoDadosGerais({ edit, set, editavel }: Props) {
  const op = useOpcoes();
  const o = edit.origens;
  return (
    <Secao titulo="Dados gerais">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Select rotulo="Empresa" obrigatorio disabled={!editavel} opcoes={op.empresas} origem={o.empresaId} value={edit.empresaId ?? ""} onChange={(e) => set({ empresaId: e.target.value })} />
        <Select rotulo="Origem da oportunidade" obrigatorio disabled={!editavel} opcoes={op.origensOportunidade} value={edit.origemOportunidade ?? ""} onChange={(e) => set({ origemOportunidade: e.target.value as ProcessoContratacao["origemOportunidade"] })} />
        <Select rotulo="Tipo de contrato" disabled={!editavel} opcoes={op.tipos} origem={o.tipoContratoId} value={edit.tipoContratoId ?? ""} onChange={(e) => set({ tipoContratoId: e.target.value })} />
        <Textarea rotulo="Objeto" obrigatorio className="md:col-span-3" disabled={!editavel} origem={o.objeto} value={edit.objeto ?? ""} onChange={(e) => set({ objeto: e.target.value })} />
        <Select rotulo="Gestor" obrigatorio disabled={!editavel} opcoes={op.gestores} origem={o.gestorId} value={edit.gestorId ?? ""} onChange={(e) => set({ gestorId: e.target.value })} />
        <Select rotulo="Analista de Suprimentos" disabled={!editavel} opcoes={op.analistas} value={edit.analistaId ?? ""} onChange={(e) => set({ analistaId: e.target.value })} />
        <Select rotulo="Diretor" disabled={!editavel} opcoes={op.diretores} origem={o.diretorId} value={edit.diretorId ?? ""} onChange={(e) => set({ diretorId: e.target.value })} />
        <Input rotulo="Centro de custo" disabled={!editavel} origem={o.centroCusto} value={edit.centroCusto ?? ""} onChange={(e) => set({ centroCusto: e.target.value })} />
        <Select rotulo="Projeto" disabled={!editavel} opcoes={op.projetos} origem={o.projeto} value={edit.projeto ?? ""} onChange={(e) => set({ projeto: e.target.value || undefined })} />
        <div className="flex items-end pb-1">
          <Toggle rotulo="Processo de exceção" ajuda="Diretor passa a aprovar (e não só dar ciência)" disabled={!editavel || edit.status === "Aguardando aprovação comercial"} checked={Boolean(edit.excecao)} onChange={(v) => set({ excecao: v })} />
        </div>
        {edit.tipo === "Substituição de fornecedor" && <Textarea rotulo="Motivo da substituição" obrigatorio className="md:col-span-3" disabled={!editavel} value={edit.motivoSubstituicao ?? ""} onChange={(e) => set({ motivoSubstituicao: e.target.value })} />}
      </div>
    </Secao>
  );
}

function SecaoValidacao({ p, editavel }: { p: ProcessoContratacao; editavel: boolean }) {
  const { usuario, executar, nomeUsuario } = useApp();
  const d = p.demandaJira!;
  const [v, setV] = useState({ valorValidado: p.validacao?.valorValidado ?? d.valorEstimado, quantidadeValidada: p.validacao?.quantidadeValidada ?? d.quantidade, observacao: p.validacao?.observacao ?? "" });
  const validado = Boolean(p.validacao?.validadoEm);
  const diff = (a?: number, b?: number) => (a !== undefined && b !== undefined && a !== b ? <span className={b < a ? "text-sucesso-600" : "text-critico-600"}> ({b < a ? "" : "+"}{formatarNumero(((b - a) / a) * 100, 1)}%)</span> : null);
  return (
    <Secao
      titulo="Demanda JIRA e validação de Suprimentos"
      subtitulo={`${d.jira_key} · solicitado por ${d.solicitante} (${d.area})`}
      acoes={validado ? <Badge tom="sucesso">Validado por {nomeUsuario(p.validacao?.validadoPorId)}</Badge> : <Badge tom="alerta">Não validado por Suprimentos</Badge>}
    >
      <div className="space-y-4">
        <GradeValores colunas={2}>
          <Valor rotulo="Descrição" origem="importado">{d.descricao}</Valor>
          <Valor rotulo="Justificativa" origem="importado">{d.justificativa}</Valor>
          <Valor rotulo="Fornecedores indicados" origem="importado">{d.fornecedoresIndicados.join(", ") || "—"}</Valor>
          <Valor rotulo="Anexos" origem="importado">{d.anexos.join(", ") || "—"}</Valor>
        </GradeValores>
        <div className="overflow-hidden rounded-md border border-borda">
          <table className="w-full text-sm">
            <thead className="bg-fundo text-xs text-texto-suave">
              <tr><th className="px-3 py-2 text-left">Comparativo</th><th className="px-3 py-2 text-right">Solicitado (JIRA)</th><th className="px-3 py-2 text-right">Validado (Suprimentos)</th></tr>
            </thead>
            <tbody className="tabular">
              <tr className="border-t border-borda"><td className="px-3 py-2">Valor anual</td><td className="px-3 py-2 text-right">{formatarMoeda(d.valorEstimado)}</td><td className="px-3 py-2 text-right">{formatarMoeda(p.validacao?.valorValidado)}{diff(d.valorEstimado, p.validacao?.valorValidado)}</td></tr>
              <tr className="border-t border-borda"><td className="px-3 py-2">Quantidade</td><td className="px-3 py-2 text-right">{formatarNumero(d.quantidade)}</td><td className="px-3 py-2 text-right">{formatarNumero(p.validacao?.quantidadeValidada)}{diff(d.quantidade, p.validacao?.quantidadeValidada)}</td></tr>
            </tbody>
          </table>
        </div>
        {p.validacao?.observacao && <p className="text-xs text-texto-suave">Observação: {p.validacao.observacao}</p>}
        {editavel && (
          <div className="grid grid-cols-1 items-end gap-3 rounded-md bg-fundo p-3 md:grid-cols-[1fr_1fr_2fr_auto]">
            <InputNumero rotulo="Valor validado" valor={v.valorValidado} onValor={(x) => setV({ ...v, valorValidado: x })} />
            <InputNumero rotulo="Quantidade validada" valor={v.quantidadeValidada} onValor={(x) => setV({ ...v, quantidadeValidada: x })} />
            <Input rotulo="Observação" value={v.observacao} onChange={(e) => setV({ ...v, observacao: e.target.value })} />
            <Button onClick={() => executar(() => api.validarDemanda(p.processo_id, v, usuario.id), "Validação registrada.")}>{validado ? "Revalidar" : "Validar"}</Button>
          </div>
        )}
      </div>
    </Secao>
  );
}

function SecaoCotacao({ edit, set, editavel }: Props) {
  const { fornecedor, usuario, executar } = useApp();
  const op = useOpcoes();
  const [potencial, setPotencial] = useState("");
  const atualizar = (i: number, patch: Partial<PropostaFornecedor>) => set({ propostas: edit.propostas.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const menor = Math.min(...edit.propostas.map((x) => x.propostaFinalAnual ?? x.propostaInicialAnual));
  return (
    <Secao titulo="Cotação e fornecedores avaliados" subtitulo="Cotação simplificada — fornecedores potenciais podem ser incluídos sem cadastro">
      <div className="space-y-3">
        {edit.propostas.length === 0 && <p className="text-sm text-texto-suave">Nenhuma proposta registrada.</p>}
        {edit.propostas.map((x, i) => (
          <div key={x.id} className={`grid grid-cols-1 items-end gap-2 rounded-md border p-3 md:grid-cols-[auto_2fr_90px_1fr_1fr_auto] ${x.id === edit.propostaRecomendadaId ? "border-sucesso-600/40 bg-sucesso-50/40" : "border-borda"}`}>
            <label className="flex items-center gap-1.5 pb-2 text-xs" title="Fornecedor recomendado">
              <input type="radio" disabled={!editavel} checked={x.id === edit.propostaRecomendadaId} onChange={() => set({ propostaRecomendadaId: x.id })} />
              Recomendado
            </label>
            {x.fornecedorId || !x.fornecedorPotencial ? (
              <Select rotulo="Fornecedor" disabled={!editavel} opcoes={op.fornecedores} value={x.fornecedorId ?? ""} onChange={(e) => atualizar(i, { fornecedorId: e.target.value })} />
            ) : (
              <div>
                <Valor rotulo="Fornecedor potencial (não cadastrado)">{x.fornecedorPotencial}</Valor>
                {editavel && (
                  <button
                    className="mt-1 text-xs text-primaria-700 underline"
                    onClick={async () => {
                      const f = await executar(() => api.criarFornecedorPotencial(x.fornecedorPotencial!, usuario.id), "Pré-cadastro criado. O cadastro oficial é feito no sistema atual.");
                      if (f) atualizar(i, { fornecedorId: f.fornecedor_id });
                    }}
                  >
                    Criar pré-cadastro
                  </button>
                )}
              </div>
            )}
            <Select rotulo="Moeda" disabled={!editavel} vazio={false} opcoes={op.moedas} value={x.moeda} onChange={(e) => atualizar(i, { moeda: e.target.value as Moeda })} />
            <InputNumero rotulo="Proposta inicial (anual)" disabled={!editavel} valor={x.propostaInicialAnual} onValor={(v) => atualizar(i, { propostaInicialAnual: v ?? 0 })} />
            <InputNumero rotulo="Proposta final (anual)" disabled={!editavel} valor={x.propostaFinalAnual} onValor={(v) => atualizar(i, { propostaFinalAnual: v })} />
            <div className="flex items-center gap-1 pb-1">
              {(x.propostaFinalAnual ?? x.propostaInicialAnual) === menor && edit.propostas.length > 1 && <Badge tom="sucesso">Menor</Badge>}
              {editavel && (
                <button onClick={() => set({ propostas: edit.propostas.filter((_, j) => j !== i), propostaRecomendadaId: edit.propostaRecomendadaId === x.id ? undefined : edit.propostaRecomendadaId })} className="rounded p-2 text-texto-suave hover:bg-critico-50 hover:text-critico-600" aria-label="Remover proposta">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            {x.fornecedorId && fornecedor(x.fornecedorId)?.statusCadastral === "Potencial" && <p className="text-xs text-alerta-600 md:col-span-6">Fornecedor em pré-cadastro — validar cadastro oficial no sistema atual antes da contratação.</p>}
          </div>
        ))}
        {editavel && (
          <div className="flex flex-wrap items-end gap-2">
            <Button variante="secundario" tamanho="sm" icone={<Plus size={14} />} onClick={() => set({ propostas: [...edit.propostas, { id: `pr-${Date.now().toString(36)}`, moeda: edit.condicoes?.moeda ?? "BRL", propostaInicialAnual: 0 }] })}>
              Fornecedor cadastrado
            </Button>
            <input value={potencial} onChange={(e) => setPotencial(e.target.value)} placeholder="Nome do fornecedor potencial" className="h-8 w-64 rounded-md border border-borda-forte px-2 text-xs" />
            <Button
              variante="secundario"
              tamanho="sm"
              icone={<Plus size={14} />}
              disabled={!potencial.trim()}
              onClick={() => {
                set({ propostas: [...edit.propostas, { id: `pr-${Date.now().toString(36)}`, fornecedorPotencial: potencial.trim(), moeda: edit.condicoes?.moeda ?? "BRL", propostaInicialAnual: 0 }] });
                setPotencial("");
              }}
            >
              Fornecedor potencial
            </Button>
          </div>
        )}
      </div>
    </Secao>
  );
}

function SecaoNegociacao({ edit, set, editavel, negociado }: Props & { negociado?: number }) {
  const op = useOpcoes();
  const c = edit.condicoes ?? {};
  const v = edit.vigencia ?? {};
  const r = edit.reajuste ?? { possui: false };
  const rs = edit.rescisao ?? { permite: true, possuiMulta: false };
  const setC = (p: Partial<NonNullable<ProcessoContratacao["condicoes"]>>) => set({ condicoes: { ...c, ...p } });
  const setV = (p: Partial<NonNullable<ProcessoContratacao["vigencia"]>>) => set({ vigencia: { ...v, ...p } });
  const o = edit.origens;
  return (
    <Secao titulo="Negociação e condições comerciais" subtitulo="Exigidos para aprovação: fornecedor recomendado, proposta, valor negociado, justificativa e condições comerciais">
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Textarea rotulo="Estratégia de Suprimentos" disabled={!editavel} value={edit.estrategiaSuprimentos ?? ""} onChange={(e) => set({ estrategiaSuprimentos: e.target.value })} />
          <Textarea rotulo="Justificativa" obrigatorio disabled={!editavel} value={edit.justificativa ?? ""} onChange={(e) => set({ justificativa: e.target.value })} />
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Condições comerciais</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Valor rotulo="Valor negociado anual" origem="calculado">{negociado !== undefined ? formatarMoeda(negociado, c.moeda ?? "BRL") : "Defina a proposta recomendada"}</Valor>
            <Select rotulo="Moeda" obrigatorio disabled={!editavel} opcoes={op.moedas} origem={o["condicoes.moeda"]} value={c.moeda ?? ""} onChange={(e) => setC({ moeda: e.target.value as Moeda })} />
            <InputNumero rotulo="Quantidade" disabled={!editavel} origem={o["condicoes.quantidade"]} valor={c.quantidade} onValor={(x) => setC({ quantidade: x })} />
            <Input rotulo="Unidade" disabled={!editavel} value={c.unidade ?? ""} onChange={(e) => setC({ unidade: e.target.value })} />
            <Select rotulo="Periodicidade de pagamento" obrigatorio disabled={!editavel} opcoes={op.periodicidades} origem={o["condicoes.periodicidadePagamento"]} value={c.periodicidadePagamento ?? ""} onChange={(e) => setC({ periodicidadePagamento: e.target.value as Periodicidade })} />
            <Input rotulo="Condição de pagamento" obrigatorio className="md:col-span-3" disabled={!editavel} origem={o["condicoes.condicaoPagamento"]} value={c.condicaoPagamento ?? ""} onChange={(e) => setC({ condicaoPagamento: e.target.value })} />
          </div>
        </div>
        {c.moeda && c.moeda !== "BRL" && (
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Cotação (informada por Suprimentos)</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <InputNumero rotulo="Valor da cotação" obrigatorio disabled={!editavel} origem={o["condicoes.cotacao"]} valor={c.cotacao?.valor} onValor={(x) => setC({ cotacao: { data: c.cotacao?.data ?? new Date().toISOString().slice(0, 10), fonte: c.cotacao?.fonte ?? "PTAX", ...c.cotacao, valor: x ?? 0 } })} />
              <Input rotulo="Data" type="date" disabled={!editavel} value={c.cotacao?.data ?? ""} onChange={(e) => setC({ cotacao: { valor: 0, fonte: "PTAX", ...c.cotacao, data: e.target.value } })} />
              <Select rotulo="Fonte" disabled={!editavel} vazio={false} opcoes={op.fontesCotacao} value={c.cotacao?.fonte ?? "PTAX"} onChange={(e) => setC({ cotacao: { valor: 0, data: "", ...c.cotacao, fonte: e.target.value as FonteCotacao } })} />
              <Valor rotulo="Valor negociado em BRL" origem="calculado">{negociado !== undefined ? formatarMoeda(converterParaBRL(negociado, c.moeda, c.cotacao)) : "—"}</Valor>
              <Input rotulo="Observação" className="md:col-span-4" disabled={!editavel} value={c.cotacao?.observacao ?? ""} onChange={(e) => setC({ cotacao: { valor: 0, data: "", fonte: "PTAX", ...c.cotacao, observacao: e.target.value } })} />
            </div>
          </div>
        )}
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Vigência proposta</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Input rotulo="Data início" type="date" disabled={!editavel} value={v.dataInicio ?? ""} onChange={(e) => setV({ dataInicio: e.target.value })} />
            <Input rotulo="Data fim" type="date" disabled={!editavel} value={v.dataFim ?? ""} onChange={(e) => setV({ dataFim: e.target.value })} />
            <InputNumero rotulo="Aviso prévio (dias)" disabled={!editavel} origem={o["vigencia.avisoPrevioDias"]} valor={v.avisoPrevioDias} onValor={(x) => setV({ avisoPrevioDias: x })} />
            <InputNumero rotulo="Prazo do gestor (dias)" disabled={!editavel} valor={v.prazoGestorDias} onValor={(x) => setV({ prazoGestorDias: x })} placeholder="30" />
            <div className="flex items-end pb-1 md:col-span-2">
              <Toggle rotulo="Renovação automática" ajuda="Usada apenas para alertas — nunca renova sozinha" disabled={!editavel} checked={Boolean(v.renovacaoAutomatica)} onChange={(x) => setV({ renovacaoAutomatica: x })} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Reajuste</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Toggle rotulo="Possui reajuste" disabled={!editavel} checked={r.possui} onChange={(x) => set({ reajuste: { ...r, possui: x } })} /></div>
              {r.possui && (
                <>
                  <Select rotulo="Índice" disabled={!editavel} opcoes={op.indices} origem={o.reajuste} value={r.indice ?? ""} onChange={(e) => set({ reajuste: { ...r, indice: e.target.value as typeof r.indice } })} />
                  <InputNumero rotulo="Percentual previsto (%)" disabled={!editavel} valor={r.percentualPrevisto} onValor={(x) => set({ reajuste: { ...r, percentualPrevisto: x } })} />
                  <Input rotulo="Data-base" type="date" disabled={!editavel} value={r.dataBase ?? ""} onChange={(e) => set({ reajuste: { ...r, dataBase: e.target.value } })} />
                  <InputNumero rotulo="Periodicidade (meses)" disabled={!editavel} valor={r.periodicidadeMeses} onValor={(x) => set({ reajuste: { ...r, periodicidadeMeses: x } })} />
                </>
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">Rescisão</p>
            <div className="grid grid-cols-2 gap-3">
              <Toggle rotulo="Permite rescisão" disabled={!editavel} checked={rs.permite} onChange={(x) => set({ rescisao: { ...rs, permite: x } })} />
              <Toggle rotulo="Possui multa" disabled={!editavel} checked={rs.possuiMulta} onChange={(x) => set({ rescisao: { ...rs, possuiMulta: x } })} />
              {rs.possuiMulta && (
                <>
                  <InputNumero rotulo="Percentual (%)" disabled={!editavel} valor={rs.percentual} onValor={(x) => set({ rescisao: { ...rs, percentual: x } })} />
                  <InputNumero rotulo="Valor" disabled={!editavel} valor={rs.valor} onValor={(x) => set({ rescisao: { ...rs, valor: x } })} />
                </>
              )}
              <InputNumero rotulo="Aviso prévio (dias)" disabled={!editavel} valor={rs.avisoPrevioDias} onValor={(x) => set({ rescisao: { ...rs, avisoPrevioDias: x } })} />
              <Input rotulo="Regra" disabled={!editavel} value={rs.regra ?? ""} onChange={(e) => set({ rescisao: { ...rs, regra: e.target.value } })} />
            </div>
          </div>
        </div>
      </div>
    </Secao>
  );
}

function SecaoAprovacoes({ p }: { p: ProcessoContratacao }) {
  const { usuario, executar } = useApp();
  const [comentario, setComentario] = useState("");
  const minha = p.status === "Aguardando aprovação comercial" ? p.aprovacoes.find((a) => a.status === "Pendente" && (a.usuarioId === usuario.id || usuario.perfil === "Administrador")) : undefined;
  return (
    <Secao titulo="Aprovações" subtitulo="Gestor e Suprimentos aprovam; Diretor dá ciência (aprova em exceção). Jurídico só após aprovação comercial.">
      <AprovacoesResumo p={p} />
      {minha && (
        <div className="mt-4 space-y-3 rounded-md bg-fundo p-3">
          <p className="text-sm font-medium">Sua {minha.tipo === "Ciência" ? "ciência" : "aprovação"} como {minha.papel}</p>
          <Input rotulo="Comentário (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
          <div className="flex gap-2">
            {minha.tipo === "Ciência" ? (
              <Button onClick={() => executar(() => api.registrarAprovacao(p.processo_id, minha.papel, "Ciente", comentario, usuario.id), "Ciência registrada.")}>Registrar ciência</Button>
            ) : (
              <>
                <Button onClick={() => executar(() => api.registrarAprovacao(p.processo_id, minha.papel, "Aprovado", comentario, usuario.id), "Aprovação registrada.")}>Aprovar</Button>
                <Button variante="perigo" disabled={!comentario.trim()} onClick={() => executar(() => api.registrarAprovacao(p.processo_id, minha.papel, "Reprovado", comentario, usuario.id), "Reprovação registrada.")}>Reprovar</Button>
              </>
            )}
          </div>
        </div>
      )}
    </Secao>
  );
}

function SecaoJuridico({ p }: { p: ProcessoContratacao }) {
  const { usuario, executar, pode, nomeUsuario } = useApp();
  const [status, setStatus] = useState<StatusJuridico>("Parecer emitido");
  const [parecer, setParecer] = useState(p.juridico.parecer ?? "");
  const podeEmitir = p.status === "Em análise jurídica" && pode("emitir_parecer");
  return (
    <Secao titulo="Jurídico">
      <GradeValores colunas={3}>
        <Valor rotulo="Status">{p.juridico.status}</Valor>
        <Valor rotulo="Responsável">{nomeUsuario(p.juridico.responsavelId)}</Valor>
        <Valor rotulo="Parecer" className="sm:col-span-3">{p.juridico.parecer ?? "—"}</Valor>
      </GradeValores>
      {podeEmitir && (
        <div className="mt-4 space-y-3 rounded-md bg-fundo p-3">
          <Select rotulo="Resultado" vazio={false} value={status} onChange={(e) => setStatus(e.target.value as StatusJuridico)} opcoes={["Parecer emitido", "Ressalvas"].map((s) => ({ valor: s, rotulo: s }))} />
          <Textarea rotulo="Parecer" obrigatorio value={parecer} onChange={(e) => setParecer(e.target.value)} />
          <Button disabled={!parecer.trim()} onClick={() => executar(() => api.registrarParecer(p.processo_id, status, parecer, usuario.id), "Parecer registrado.")}>Registrar parecer</Button>
        </div>
      )}
      {p.status === "Em análise jurídica" && !pode("emitir_parecer") && <p className="mt-3 text-xs text-texto-suave">Aguardando parecer do Jurídico.</p>}
    </Secao>
  );
}
