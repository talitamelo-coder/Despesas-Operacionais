import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ClipboardCheck, FilePlus2, History, Lock, Save } from "lucide-react";
import { useApp } from "@/app/contexto";
import { AuditoriaLista } from "@/components/dominio/AuditoriaLista";
import { DocumentosLista } from "@/components/dominio/DocumentosLista";
import { SavingEditor } from "@/components/dominio/SavingEditor";
import { SavingResumo } from "@/components/dominio/SavingResumo";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select, Textarea } from "@/components/ui/Campos";
import { Aviso, Carregando, Timeline, Vazio } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { PrioridadeBadge, RiscoRenovacaoBadge, StatusBadge } from "@/components/ui/status";
import { Tabela } from "@/components/ui/Tabela";
import { ORDEM_PRIORIDADE } from "@/domain/rules/acoes";
import { valorAnualBRL } from "@/domain/rules/cambio";
import { processoAtivo } from "@/domain/rules/fluxo";
import { decisaoRegistrada, prazosDoContrato } from "@/domain/rules/prazos";
import { savingAnual } from "@/domain/rules/saving";
import { formatarData, formatarDataHora } from "@/domain/datas";
import { formatarMoeda } from "@/domain/formatacao";
import type { Contrato, ProcessoContratacao, Saving, StatusContrato, TipoProcesso } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api } from "@/services";
import {
  BlocoCambio,
  BlocoCondicoesComerciais,
  BlocoExecucaoFinanceira,
  BlocoHistoricoContratual,
  BlocoInformacoesGerais,
  BlocoReajuste,
  BlocoRescisao,
  BlocoResponsaveis,
  BlocoVariacao,
  BlocoVigencia,
  ListaAlertas,
} from "./blocos";

const ABAS = ["Visão Geral", "Negociação & Saving", "Financeiro", "Vigência", "Jurídico & Documentos", "Aprovações", "Renovações & Aditivos", "Histórico"] as const;
type AbaCapa = (typeof ABAS)[number];

function Bloco({ titulo, children, acoes, className }: { titulo: string; children: ReactNode; acoes?: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader titulo={titulo} acoes={acoes} />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function montarCadeia(c: Contrato, todos: Contrato[]): Contrato[] {
  const porId = new Map(todos.map((x) => [x.contrato_id, x]));
  const antes: Contrato[] = [];
  let a = c.contrato_anterior_id ? porId.get(c.contrato_anterior_id) : undefined;
  while (a && antes.length < 20) {
    antes.unshift(a);
    a = a.contrato_anterior_id ? porId.get(a.contrato_anterior_id) : undefined;
  }
  const depois: Contrato[] = [];
  let s = c.sucessor_id ? porId.get(c.sucessor_id) : undefined;
  while (s && depois.length < 20) {
    depois.push(s);
    s = s.sucessor_id ? porId.get(s.sucessor_id) : undefined;
  }
  return [...antes, c, ...depois];
}

export function CapaContrato() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const aba = (params.get("aba") as AbaCapa) || "Visão Geral";
  const navegar = useNavigate();
  const { fornecedor, nomeEmpresa, nomeUsuario, pode, usuario, executar } = useApp();
  const { dados: c, carregando } = useConsulta(() => api.obterContrato(id), [id]);
  const { dados: todos } = useConsulta(() => api.listarContratos(), []);
  const { dados: processos } = useConsulta(() => api.listarProcessos(), []);
  const { dados: alertas } = useConsulta(() => api.listarAlertas(id), [id]);
  const { dados: acoes } = useConsulta(() => api.listarAcoes(), []);
  const [modalStatus, setModalStatus] = useState(false);
  const [editandoSaving, setEditandoSaving] = useState<Saving>();

  const relacionados = useMemo(() => (processos ?? []).filter((p) => p.contrato_anterior_id === id || p.contrato_gerado_id === id || p.processo_id === c?.processo_id), [processos, id, c]);
  const cadeia = useMemo(() => (c && todos ? montarCadeia(c, todos) : []), [c, todos]);

  if (carregando && !c) return <Carregando />;
  if (!c) return <Vazio titulo="Contrato não encontrado" acao={<Link to="/contratos" className="text-sm text-primaria-700">Voltar à Central</Link>} />;

  const f = fornecedor(c.fornecedorId);
  const prazos = prazosDoContrato(c);
  const anterior = cadeia.find((x) => x.contrato_id === c.contrato_anterior_id);
  const sucessor = cadeia.find((x) => x.contrato_id === c.sucessor_id);
  const abertos = relacionados.filter((p) => p.contrato_anterior_id === id && processoAtivo(p));
  const processoOrigem = relacionados.find((p) => p.processo_id === c.processo_id || p.contrato_gerado_id === id);
  const acoesContrato = (acoes ?? [])
    .filter((a) => a.referencia.id === id || abertos.some((p) => p.processo_id === a.referencia.id))
    .sort((a, b) => ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade]);
  const proxima = acoesContrato[0];
  const podeAvaliar = c.status === "Vigente" && !c.sucessor_id && !decisaoRegistrada(c) && (usuario.id === c.gestorId || usuario.perfil === "Administrador" || usuario.diretor) && prazos.fase !== "Normal";
  const relacaoSucessor = sucessor?.relacaoAnterior === "Substituição" ? "Substituído por" : "Renovado por";
  const relacaoAnterior = c.relacaoAnterior === "Substituição" ? "Substitui" : "Renovação de";

  const iniciar = (tipo: TipoProcesso) => navegar(`/processos/novo?tipo=${encodeURIComponent(tipo)}&contrato=${c.contrato_id}`);

  return (
    <>
      <PageHeader
        migalhas={[{ rotulo: "Central de Contratos", para: "/contratos" }, { rotulo: c.codigo }]}
        titulo={
          <span className="flex flex-wrap items-center gap-2">
            {c.codigo}
            <StatusBadge status={c.status} />
            {abertos.map((p) => (
              <Link key={p.processo_id} to={`/processos/${p.processo_id}`}>
                <Badge tom="info">{p.tipo} · {p.codigo}</Badge>
              </Link>
            ))}
            {prazos.renovacaoAutomaticaEmRisco && <RiscoRenovacaoBadge />}
          </span>
        }
        descricao={
          <span>
            <span className="font-medium text-texto">{f?.razaoSocial}</span> · {c.objeto}
          </span>
        }
        acoes={
          <>
            {podeAvaliar && (
              <Button icone={<ClipboardCheck size={16} />} onClick={() => navegar(`/contratos/${c.contrato_id}/avaliacao`)}>
                Avaliar renovação
              </Button>
            )}
            {pode("editar_processo") && c.status === "Vigente" && !c.sucessor_id && (
              <Button variante="secundario" icone={<FilePlus2 size={16} />} onClick={() => setParams({ aba: "Renovações & Aditivos" })}>
                Iniciar processo
              </Button>
            )}
            {pode("editar_processo") && (
              <Button variante="secundario" onClick={() => setModalStatus(true)}>
                Alterar status
              </Button>
            )}
          </>
        }
        extra={
          <Card className="mt-4">
            <div className="grid grid-cols-2 divide-borda md:grid-cols-3 xl:grid-cols-6 xl:divide-x">
              {[
                ["Empresa", nomeEmpresa(c.empresaId)],
                ["Valor anual", <>{formatarMoeda(valorAnualBRL(c.condicoes))}{c.condicoes.moeda !== "BRL" && <span className="block text-xs font-normal text-texto-suave">{formatarMoeda(c.condicoes.valorAnual, c.condicoes.moeda)}</span>}</>],
                ["Saving anual", c.saving ? <span className="text-sucesso-600">{formatarMoeda(savingAnual(c.saving))}</span> : "—"],
                ["Vigência", `${formatarData(c.vigencia.dataInicio)} a ${formatarData(c.vigencia.dataFim)}`],
                ["Data limite de manifestação", <>{formatarData(prazos.dataLimiteManifestacao)}<span className="block text-xs font-normal text-texto-suave">{prazos.fase}</span></>],
                [
                  "Próxima ação",
                  proxima ? (
                    <Link to={proxima.link} className="block hover:underline">
                      <PrioridadeBadge prioridade={proxima.prioridade} />
                      <span className="mt-1 block text-xs font-normal">{proxima.acao}</span>
                    </Link>
                  ) : sucessor ? (
                    `${relacaoSucessor} ${sucessor.codigo}`
                  ) : (
                    "Acompanhar vigência"
                  ),
                ],
              ].map(([rotulo, valor], i) => (
                <div key={i} className="px-4 py-3">
                  <p className="text-xs text-texto-suave">{rotulo}</p>
                  <div className="mt-0.5 text-sm font-semibold tabular">{valor}</div>
                </div>
              ))}
            </div>
            {(sucessor || anterior) && (
              <div className="flex flex-wrap gap-4 border-t border-borda px-4 py-2 text-xs">
                {anterior && (
                  <span>
                    {relacaoAnterior}{" "}
                    <Link className="font-semibold text-primaria-800 hover:underline" to={`/contratos/${anterior.contrato_id}`}>
                      {anterior.codigo}
                    </Link>
                  </span>
                )}
                {sucessor && (
                  <span>
                    {relacaoSucessor}{" "}
                    <Link className="font-semibold text-primaria-800 hover:underline" to={`/contratos/${sucessor.contrato_id}`}>
                      {sucessor.codigo}
                    </Link>
                  </span>
                )}
              </div>
            )}
          </Card>
        }
      />

      <Tabs className="mb-4" abas={ABAS.map((a) => ({ id: a, rotulo: a }))} ativa={aba} onChange={(a) => setParams({ aba: a }, { replace: true })} />

      {aba === "Visão Geral" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Bloco titulo="Informações gerais"><BlocoInformacoesGerais c={c} /></Bloco>
            <Bloco titulo="Resultado de Suprimentos"><SavingResumo saving={c.saving} /></Bloco>
            <Bloco titulo="Condições comerciais"><BlocoCondicoesComerciais c={c} /></Bloco>
            {c.condicoes.moeda !== "BRL" && <Bloco titulo="Câmbio"><BlocoCambio c={c} /></Bloco>}
            <Bloco titulo="Vigência e renovação"><BlocoVigencia c={c} /></Bloco>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Bloco titulo="Reajuste"><BlocoReajuste c={c} /></Bloco>
              <Bloco titulo="Rescisão"><BlocoRescisao c={c} /></Bloco>
            </div>
          </div>
          <div className="space-y-4">
            <Bloco titulo="Responsáveis"><BlocoResponsaveis c={c} /></Bloco>
            <Bloco titulo="Histórico contratual"><BlocoHistoricoContratual c={c} cadeia={cadeia} /></Bloco>
            <Bloco titulo="Execução financeira"><BlocoExecucaoFinanceira c={c} /></Bloco>
            <Card>
              <CardHeader titulo="Documentos" acoes={<Button variante="fantasma" tamanho="sm" onClick={() => setParams({ aba: "Jurídico & Documentos" })}>Ver todos</Button>} />
              <DocumentosLista contrato_id={c.contrato_id} densa />
            </Card>
            <Card>
              <CardHeader titulo="Últimas movimentações" icone={<History size={16} />} />
              <CardBody>
                <UltimasMovimentacoes ids={[c.contrato_id, ...relacionados.map((p) => p.processo_id)]} />
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {aba === "Negociação & Saving" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Bloco
            className="xl:col-span-2"
            titulo="Saving anual"
            acoes={
              pode("editar_saving") ? (
                editandoSaving ? (
                  <>
                    <Button variante="secundario" tamanho="sm" onClick={() => setEditandoSaving(undefined)}>Cancelar</Button>
                    <Button
                      tamanho="sm"
                      icone={<Save size={14} />}
                      onClick={async () => {
                        const ok = await executar(() => api.atualizarContrato(c.contrato_id, { saving: editandoSaving }, usuario.id), "Saving atualizado.");
                        if (ok) setEditandoSaving(undefined);
                      }}
                    >
                      Salvar
                    </Button>
                  </>
                ) : (
                  <Button
                    variante="secundario"
                    tamanho="sm"
                    onClick={() =>
                      setEditandoSaving(
                        c.saving ?? { tipoBaseline: anterior ? "Contrato anterior" : "Proposta inicial", baselineAnual: anterior ? valorAnualBRL(anterior.condicoes) ?? 0 : 0, valorNegociadoAnual: valorAnualBRL(c.condicoes) ?? 0, componentes: [], origemOportunidade: "Suprimentos" },
                      )
                    }
                  >
                    Editar saving
                  </Button>
                )
              ) : (
                <Badge icone={<Lock size={12} />}>Somente Suprimentos/Admin</Badge>
              )
            }
          >
            {editandoSaving ? (
              <SavingEditor saving={editandoSaving} onChange={setEditandoSaving} valorAnterior={anterior ? valorAnualBRL(anterior.condicoes) : undefined} reajustePrevisto={anterior?.reajuste.percentualPrevisto} />
            ) : (
              <SavingResumo saving={c.saving} />
            )}
          </Bloco>
          <Bloco titulo="Preço, volume e câmbio"><BlocoVariacao c={c} anterior={anterior} /></Bloco>
          {processoOrigem && (
            <Bloco className="xl:col-span-3" titulo={`Negociação — ${processoOrigem.codigo}`}>
              <PropostasResumo p={processoOrigem} />
            </Bloco>
          )}
        </div>
      )}

      {aba === "Financeiro" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Bloco titulo="Condições comerciais"><BlocoCondicoesComerciais c={c} /></Bloco>
          <Bloco titulo="Câmbio"><BlocoCambio c={c} /></Bloco>
          <Bloco className="xl:col-span-2" titulo="Execução financeira"><BlocoExecucaoFinanceira c={c} /></Bloco>
        </div>
      )}

      {aba === "Vigência" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Bloco className="xl:col-span-2" titulo="Vigência e renovação"><BlocoVigencia c={c} /></Bloco>
          <Bloco titulo="Alertas de renovação"><ListaAlertas alertas={alertas ?? []} /></Bloco>
          <Bloco className="xl:col-span-2" titulo="Reajuste"><BlocoReajuste c={c} /></Bloco>
          <Bloco titulo="Avaliação do gestor"><AvaliacaoResumo c={c} /></Bloco>
        </div>
      )}

      {aba === "Jurídico & Documentos" && (
        <div className="space-y-4">
          <Bloco titulo="Rescisão"><BlocoRescisao c={c} /></Bloco>
          {processoOrigem?.juridico.parecer && (
            <Bloco titulo="Parecer jurídico">
              <p className="text-sm">{processoOrigem.juridico.parecer}</p>
              <p className="mt-1 text-xs text-texto-suave">{nomeUsuario(processoOrigem.juridico.responsavelId)} · {processoOrigem.juridico.status}</p>
            </Bloco>
          )}
          <Card>
            <CardHeader titulo="Documentos do contrato" subtitulo="Proposta, minuta, contrato, aditivo, parecer, contrato assinado e anexos" />
            <DocumentosLista contrato_id={c.contrato_id} />
          </Card>
        </div>
      )}

      {aba === "Aprovações" && (
        <Bloco titulo="Aprovações do processo de origem">
          {processoOrigem ? <AprovacoesResumo p={processoOrigem} /> : <p className="text-sm text-texto-suave">Contrato sem processo de origem no módulo (ex.: importado da planilha).</p>}
        </Bloco>
      )}

      {aba === "Renovações & Aditivos" && (
        <div className="space-y-4">
          {pode("editar_processo") && c.status === "Vigente" && !c.sucessor_id && (
            <Bloco titulo="Iniciar novo processo a partir deste contrato">
              <p className="mb-3 text-sm text-texto-suave">Os dados do contrato são herdados automaticamente e podem ser editados no novo processo. O contrato atual nunca é sobrescrito.</p>
              <div className="flex flex-wrap gap-2">
                {(["Renovação", "Substituição de fornecedor", "Renegociação", "Aditivo"] as TipoProcesso[]).map((t) => (
                  <Button key={t} variante="secundario" onClick={() => iniciar(t)}>
                    {t}
                  </Button>
                ))}
              </div>
            </Bloco>
          )}
          <Bloco titulo="Histórico contratual"><BlocoHistoricoContratual c={c} cadeia={cadeia} /></Bloco>
          <Card>
            <CardHeader titulo="Processos relacionados" />
            <Tabela<ProcessoContratacao>
              linhas={relacionados}
              chave={(p) => p.processo_id}
              onLinha={(p) => navegar(`/processos/${p.processo_id}`)}
              vazio="Nenhum processo relacionado."
              colunas={[
                { id: "c", titulo: "Processo", render: (p) => <span className="font-semibold text-primaria-800">{p.codigo}</span> },
                { id: "t", titulo: "Tipo", render: (p) => p.tipo },
                { id: "s", titulo: "Status", render: (p) => <StatusBadge status={p.status} /> },
                { id: "a", titulo: "Analista", render: (p) => nomeUsuario(p.analistaId) },
                { id: "u", titulo: "Atualizado", render: (p) => formatarDataHora(p.atualizadoEm) },
              ]}
            />
          </Card>
        </div>
      )}

      {aba === "Histórico" && (
        <Card>
          <CardHeader titulo="Auditoria" subtitulo="Registro automático de usuário, data, ação, campo, valor anterior e valor novo" />
          <AuditoriaLista entidadeIds={[c.contrato_id, ...relacionados.map((p) => p.processo_id)]} />
        </Card>
      )}

      <ModalStatus aberto={modalStatus} onFechar={() => setModalStatus(false)} c={c} />
    </>
  );
}

function UltimasMovimentacoes({ ids }: { ids: string[] }) {
  const { nomeUsuario } = useApp();
  const { dados } = useConsulta(async () => (await Promise.all(ids.map((i) => api.listarAuditoria(i)))).flat().sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6), [ids.join(",")]);
  if (!dados?.length) return <p className="text-sm text-texto-suave">Sem movimentações.</p>;
  return <Timeline itens={dados.map((r) => ({ id: r.id, titulo: r.acao + (r.valorNovo && r.valorNovo.length < 40 ? `: ${r.valorNovo}` : ""), quando: formatarDataHora(r.data), quem: nomeUsuario(r.usuarioId) }))} />;
}

export function PropostasResumo({ p }: { p: ProcessoContratacao }) {
  const { fornecedor } = useApp();
  return (
    <Tabela
      linhas={p.propostas}
      chave={(x) => x.id}
      vazio="Nenhuma proposta registrada."
      colunas={[
        { id: "f", titulo: "Fornecedor", render: (x) => <span>{x.fornecedorId ? fornecedor(x.fornecedorId)?.razaoSocial : `${x.fornecedorPotencial} (potencial)`}{x.id === p.propostaRecomendadaId && <Badge tom="sucesso" className="ml-2">Recomendado</Badge>}</span> },
        { id: "i", titulo: "Proposta inicial", alinhamento: "direita", render: (x) => <span className="tabular">{formatarMoeda(x.propostaInicialAnual, x.moeda)}</span> },
        { id: "n", titulo: "Proposta final", alinhamento: "direita", render: (x) => <span className="tabular">{formatarMoeda(x.propostaFinalAnual, x.moeda)}</span> },
        { id: "o", titulo: "Observação", render: (x) => <span className="text-xs text-texto-suave">{x.observacao ?? "—"}</span> },
      ]}
    />
  );
}

export function AprovacoesResumo({ p }: { p: ProcessoContratacao }) {
  const { nomeUsuario } = useApp();
  if (!p.aprovacoes.length) return <p className="text-sm text-texto-suave">As aprovações são geradas quando o processo entra em "Aguardando aprovação comercial".</p>;
  const tom = { Pendente: "alerta", Aprovado: "sucesso", Reprovado: "critico", Ciente: "info" } as const;
  return (
    <ul className="divide-y divide-borda">
      {p.aprovacoes.map((a) => (
        <li key={a.papel} className="flex flex-wrap items-center gap-3 py-2.5">
          <span className="w-28 text-sm font-medium">{a.papel}</span>
          <span className="w-24 text-xs text-texto-suave">{a.tipo}</span>
          <span className="min-w-0 flex-1 text-sm">{nomeUsuario(a.usuarioId)}{a.comentario && <span className="block text-xs text-texto-suave">“{a.comentario}”</span>}</span>
          <span className="text-xs text-texto-fraco tabular">{formatarDataHora(a.data)}</span>
          <Badge tom={tom[a.status]}>{a.status}</Badge>
        </li>
      ))}
    </ul>
  );
}

function AvaliacaoResumo({ c }: { c: Contrato }) {
  const { nomeUsuario } = useApp();
  const a = c.avaliacaoRenovacao;
  if (!a?.respondidoEm) return <p className="text-sm text-texto-suave">Avaliação ainda não respondida pelo gestor.</p>;
  const itens: [string, string | undefined][] = [
    ["Deseja renovar", a.desejaRenovar],
    ["Deseja substituir o fornecedor", a.desejaSubstituir],
    ["Deseja encerrar", a.desejaEncerrar],
    ["Serviço continua necessário", a.servicoNecessario],
    ["Quantidade permanece", a.quantidadePermanece],
    ["Escopo permanece", a.escopoPermanece],
    ["Problema com fornecedor", a.problemaFornecedor],
    ["Avaliar concorrentes", a.avaliarConcorrentes],
  ];
  return (
    <div className="space-y-2 text-sm">
      {itens.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <span className="text-texto-suave">{k}</span>
          <span className="font-medium">{v ?? "—"}</span>
        </div>
      ))}
      {a.observacoes && <p className="rounded bg-fundo p-2 text-xs">{a.observacoes}</p>}
      <p className="text-xs text-texto-fraco">Respondido por {nomeUsuario(a.respondidoPorId)} em {formatarDataHora(a.respondidoEm)}</p>
    </div>
  );
}

function ModalStatus({ aberto, onFechar, c }: { aberto: boolean; onFechar: () => void; c: Contrato }) {
  const { usuario, executar } = useApp();
  const [status, setStatus] = useState<StatusContrato>(c.status);
  const [motivo, setMotivo] = useState("");
  return (
    <Modal
      aberto={aberto}
      titulo={`Alterar status — ${c.codigo}`}
      onFechar={onFechar}
      rodape={
        <>
          <Button variante="secundario" onClick={onFechar}>Cancelar</Button>
          <Button
            disabled={!motivo.trim() || status === c.status}
            variante={status === "Rescindido" ? "perigo" : "primario"}
            onClick={async () => {
              const ok = await executar(() => api.encerrarContrato(c.contrato_id, status as "Encerrado", motivo, usuario.id), "Status do contrato atualizado.");
              if (ok) onFechar();
            }}
          >
            Confirmar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Aviso tom="info">Renovação e aditivo são processos relacionados e não alteram o status "Vigente". O histórico do contrato é preservado.</Aviso>
        <Select rotulo="Novo status" vazio={false} value={status} onChange={(e) => setStatus(e.target.value as StatusContrato)} opcoes={["Vigente", "Suspenso", "Encerrado", "Rescindido"].map((s) => ({ valor: s, rotulo: s }))} />
        <Textarea rotulo="Motivo" obrigatorio value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
    </Modal>
  );
}
