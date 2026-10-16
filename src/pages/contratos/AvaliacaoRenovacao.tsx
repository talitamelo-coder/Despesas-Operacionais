import { temPerfil } from "@/domain/rules/permissoes";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useApp } from "@/app/contexto";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { GradeValores, Textarea, Valor } from "@/components/ui/Campos";
import { Aviso, Carregando, Vazio } from "@/components/ui/Diversos";
import { PageHeader } from "@/components/ui/PageHeader";
import { RiscoRenovacaoBadge, StatusBadge } from "@/components/ui/status";
import { cn } from "@/components/ui/cn";
import { valorAnualBRL } from "@/domain/rules/cambio";
import { desfechoAvaliacao } from "@/domain/rules/avaliacao";
import { decisaoRegistrada, prazosDoContrato } from "@/domain/rules/prazos";
import { formatarData, formatarDataHora } from "@/domain/datas";
import { formatarMoeda } from "@/domain/formatacao";
import type { AvaliacaoRenovacao as Avaliacao, RespostaSimNao } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api } from "@/services";

type Chave = Exclude<keyof Avaliacao, "observacoes" | "respondidoPorId" | "respondidoEm">;

const DECISOES: { chave: Chave; pergunta: string }[] = [
  { chave: "desejaRenovar", pergunta: "Deseja renovar?" },
  { chave: "desejaSubstituir", pergunta: "Deseja substituir o fornecedor?" },
  { chave: "desejaEncerrar", pergunta: "Deseja cancelar (não renovar nem substituir)?" },
];

const PERGUNTAS: { chave: Chave; pergunta: string }[] = [
  { chave: "servicoNecessario", pergunta: "O serviço continua necessário?" },
  { chave: "quantidadePermanece", pergunta: "A quantidade permanece?" },
  { chave: "escopoPermanece", pergunta: "O escopo permanece?" },
  { chave: "problemaFornecedor", pergunta: "Há problema com o fornecedor?" },
  { chave: "avaliarConcorrentes", pergunta: "Deseja avaliar concorrentes?" },
];

function SimNao({ valor, onChange }: { valor?: RespostaSimNao; onChange: (v: RespostaSimNao) => void }) {
  return (
    <div className="flex gap-1.5">
      {(["Sim", "Não"] as const).map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn("h-8 w-16 rounded-md border text-sm", valor === o ? "border-primaria-800 bg-primaria-800 text-white" : "border-borda-forte bg-superficie hover:bg-fundo")}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Tela simples para o gestor. Ao responder, os lembretes de decisão param automaticamente. */
export function AvaliacaoRenovacao() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const { usuario, fornecedor, nomeUsuario, nomeEmpresa, executar, pode } = useApp();
  const { dados: c, carregando } = useConsulta(() => api.obterContrato(id), [id]);
  const [resp, setResp] = useState<Avaliacao>({});
  const [enviado, setEnviado] = useState<{ processoId?: string; processoCodigo?: string }>();

  if (carregando && !c) return <Carregando />;
  if (!c) return <Vazio titulo="Contrato não encontrado" />;

  const p = prazosDoContrato(c);
  const respondida = decisaoRegistrada(c);
  const autorizado = pode("avaliar_renovacao") && (usuario.id === c.gestorId || temPerfil(usuario, "Administrador") || usuario.diretor);
  const indeterminado = c.vigencia.tipoVigencia === "Prazo indeterminado";
  const desfecho = desfechoAvaliacao(resp, c.vigencia.tipoVigencia);
  const completo = Boolean(desfecho) && PERGUNTAS.every((q) => resp[q.chave]);
  const fechada = c.status !== "Vigente" || p.fase === "Normal" || p.fase === "Sem vigência";
  const pergunta = (q: { chave: Chave; pergunta: string }) => (indeterminado && q.chave === "desejaRenovar" ? "Deseja manter o fornecedor?" : q.pergunta);

  const setDecisao = (chave: Chave, v: RespostaSimNao) =>
    setResp((r) => {
      const n = { ...r, [chave]: v };
      // Decisão é única: marcar "Sim" em uma zera as demais.
      if (v === "Sim") for (const d of DECISOES) if (d.chave !== chave) n[d.chave] = "Não";
      return n;
    });

  const enviar = async () => {
    const r = await executar(
      () => api.registrarAvaliacaoRenovacao(c.contrato_id, resp, usuario.id),
      desfecho === "Cancelar contrato" ? "Avaliação registrada. Contrato cancelado." : "Avaliação registrada. Lembretes de decisão interrompidos.",
    );
    if (r) setEnviado({ processoId: r.processo?.processo_id, processoCodigo: r.processo?.codigo });
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        migalhas={[{ rotulo: "Central de Contratos", para: "/contratos" }, { rotulo: c.codigo, para: `/contratos/${c.contrato_id}` }, { rotulo: "Avaliação de renovação" }]}
        titulo={indeterminado ? "Revisão anual do contrato" : "Avaliação de renovação"}
        descricao="Responda às perguntas abaixo. Suprimentos dará sequência à negociação a partir da sua decisão."
      />

      <Card className="mb-4">
        <CardHeader titulo={<span className="flex items-center gap-2">{c.codigo} <StatusBadge status={c.status} /> {p.renovacaoAutomaticaEmRisco && <RiscoRenovacaoBadge />}</span>} subtitulo={fornecedor(c.fornecedorId)?.razaoSocial} />
        <CardBody>
          <GradeValores colunas={4}>
            <Valor rotulo="Objeto" className="sm:col-span-2 lg:col-span-4">{c.objeto}</Valor>
            <Valor rotulo="Empresa">{nomeEmpresa(c.empresaId)}</Valor>
            <Valor rotulo="Vigência">{indeterminado ? `Indeterminado desde ${formatarData(c.vigencia.dataInicio)}` : `${formatarData(c.vigencia.dataInicio)} a ${formatarData(c.vigencia.dataFim)}`}</Valor>
            {p.proximaRevisao && <Valor rotulo="Revisão anual" origem="calculado">{formatarData(p.proximaRevisao)}</Valor>}
            <Valor rotulo="Valor anual">{formatarMoeda(valorAnualBRL(c.condicoes))}</Valor>
            <Valor rotulo="Renovação automática">{c.vigencia.renovacaoAutomatica ? "Sim" : "Não"}</Valor>
            <Valor rotulo="Data limite de manifestação" origem="calculado">
              <span className={p.diasAteDataLimite <= 15 ? "text-critico-600" : ""}>{formatarData(p.dataLimiteManifestacao)}</span>
            </Valor>
            <Valor rotulo="Dias para a data limite" origem="calculado">{p.diasAteDataLimite}</Valor>
            <Valor rotulo="Gestor">{nomeUsuario(c.gestorId)}</Valor>
            <Valor rotulo="Analista de Suprimentos">{nomeUsuario(c.analistaId)}</Valor>
          </GradeValores>
        </CardBody>
      </Card>

      {enviado ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
            <CheckCircle2 size={40} className="text-sucesso-600" />
            <p className="text-base font-semibold">Avaliação registrada</p>
            <p className="max-w-md text-sm text-texto-suave">
              {desfecho === "Cancelar contrato"
                ? "O contrato passou para Cancelado e saiu dos vigentes. Os alertas de renovação foram encerrados."
                : desfecho === "Manter fornecedor"
                  ? "Fornecedor mantido. A próxima revisão anual será avisada automaticamente."
                  : "Os lembretes de decisão foram interrompidos. Alertas contratuais críticos continuam ativos para Suprimentos."}
            </p>
            {enviado.processoId && (
              <p className="text-sm">
                Processo criado para Suprimentos:{" "}
                <Link to={`/processos/${enviado.processoId}`} className="font-semibold text-primaria-800 hover:underline">
                  {enviado.processoCodigo}
                </Link>
              </p>
            )}
            <Button variante="secundario" onClick={() => navegar(`/contratos/${c.contrato_id}`)}>Voltar ao contrato</Button>
          </CardBody>
        </Card>
      ) : respondida ? (
        <Aviso tom="sucesso" titulo="Avaliação já respondida">
          Respondida por {nomeUsuario(c.avaliacaoRenovacao?.respondidoPorId)} em {formatarDataHora(c.avaliacaoRenovacao?.respondidoEm)}. <Link className="underline" to={`/contratos/${c.contrato_id}?aba=Vigência`}>Ver respostas</Link>
        </Aviso>
      ) : fechada ? (
        <Aviso tom="info" titulo={c.status !== "Vigente" ? `Contrato ${c.status.toLowerCase()}` : "Avaliação ainda não aberta"}>
          {c.status !== "Vigente"
            ? "Não há avaliação de renovação para este contrato."
            : p.fase === "Sem vigência"
              ? "Informe a vigência do contrato para que a avaliação seja programada."
              : `A avaliação abre em ${formatarData(p.dataAberturaAvaliacao)}.`}
          {c.avaliacaoRenovacao?.respondidoEm && ` Última resposta: ${nomeUsuario(c.avaliacaoRenovacao.respondidoPorId)}, em ${formatarDataHora(c.avaliacaoRenovacao.respondidoEm)}.`}
        </Aviso>
      ) : !autorizado ? (
        <Aviso tom="alerta" titulo="Somente o gestor do contrato responde a avaliação">
          Troque o perfil simulado para {nomeUsuario(c.gestorId)} para responder.
        </Aviso>
      ) : (
        <Card>
          <CardHeader titulo="Decisão do gestor" subtitulo="Escolha uma decisão e responda às perguntas de contexto" />
          <CardBody className="space-y-5">
            <div className="divide-y divide-borda rounded-md border border-borda">
              {DECISOES.map((q) => (
                <div key={q.chave} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm font-medium">{pergunta(q)}</span>
                  <SimNao valor={resp[q.chave] as RespostaSimNao} onChange={(v) => setDecisao(q.chave, v)} />
                </div>
              ))}
            </div>
            <div className="divide-y divide-borda rounded-md border border-borda">
              {PERGUNTAS.map((q) => (
                <div key={q.chave} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-sm">{q.pergunta}</span>
                  <SimNao valor={resp[q.chave] as RespostaSimNao} onChange={(v) => setResp((r) => ({ ...r, [q.chave]: v }))} />
                </div>
              ))}
            </div>
            {desfecho === "Cancelar contrato" && (
              <Aviso tom="alerta" titulo="O contrato será cancelado">
                Sem renovação nem substituição, ao enviar o contrato passa para o status Cancelado e sai dos vigentes.
                {c.vigencia.renovacaoAutomatica && ` Ele tem renovação automática: Suprimentos precisa comunicar o fornecedor até ${formatarData(p.dataLimiteManifestacao)}.`}
              </Aviso>
            )}
            <Textarea rotulo="Observações" value={resp.observacoes ?? ""} onChange={(e) => setResp((r) => ({ ...r, observacoes: e.target.value }))} placeholder="Ex.: incluir novas unidades, ajustar SLA, avaliar fornecedor X…" />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-texto-suave">{!desfecho ? "Escolha a decisão: renovar, substituir ou cancelar." : !completo ? "Responda todas as perguntas." : "Pronto para enviar."}</p>
              <Button disabled={!completo} onClick={enviar}>
                Enviar avaliação
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
