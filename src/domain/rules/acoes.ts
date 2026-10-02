import { addDias, hoje } from "../datas";
import { decisaoRegistrada, prazosDoContrato, REGRAS_ALERTA_PADRAO, type PrazosCalculados } from "./prazos";
import { processoAtivo } from "./fluxo";
import type { AcaoNecessaria, Contrato, ISODate, Prioridade, ProcessoContratacao, RegrasAlerta } from "../types";

/** Criticidade e "próxima ação" — fonte única usada por Central, Capa, Dashboard e Ações. */

export const ORDEM_PRIORIDADE: Record<Prioridade, number> = {
  Crítico: 0,
  "Ação necessária": 1,
  Atenção: 2,
  Normal: 3,
};

export function prioridadeDosPrazos(p: PrazosCalculados, decidido: boolean): Prioridade {
  if (p.renovacaoAutomaticaEmRisco) return "Crítico";
  if (p.fase === "Vencido" || p.fase === "Data limite vencida") return decidido ? "Ação necessária" : "Crítico";
  if (p.fase === "Data limite próxima") return decidido ? "Atenção" : "Ação necessária";
  if (p.fase === "Avaliação aberta") return "Atenção";
  return "Normal";
}

export function maiorPrioridade(a: Prioridade, b: Prioridade): Prioridade {
  return ORDEM_PRIORIDADE[a] <= ORDEM_PRIORIDADE[b] ? a : b;
}

interface Contexto {
  contratos: Contrato[];
  processos: ProcessoContratacao[];
  regras?: RegrasAlerta;
  referencia?: ISODate;
  juridicoPadraoId?: string;
}

function acoesDeContrato(c: Contrato, processosAbertos: ProcessoContratacao[], ctx: Contexto): AcaoNecessaria[] {
  if (c.status !== "Vigente" || c.sucessor_id) return [];
  const prazos = prazosDoContrato(c, ctx.referencia, ctx.regras);
  const decidido = decisaoRegistrada(c);
  const ref = { tipo: "contrato" as const, id: c.contrato_id, codigo: c.codigo };
  const acoes: AcaoNecessaria[] = [];
  const temProcesso = processosAbertos.length > 0;

  if (prazos.fase === "Vencido") {
    acoes.push({
      id: `${c.contrato_id}:vencido`,
      prioridade: "Crítico",
      referencia: ref,
      acao: "Contrato vencido sem sucessor — encerrar ou regularizar",
      responsavelId: c.analistaId,
      prazo: c.vigencia.dataFim,
      link: `/contratos/${c.contrato_id}`,
    });
    return acoes;
  }

  if (!decidido && prazos.fase !== "Normal" && prazos.fase !== "Sem prazo") {
    acoes.push({
      id: `${c.contrato_id}:avaliar`,
      prioridade: prioridadeDosPrazos(prazos, false),
      referencia: ref,
      acao: "Avaliar renovação do contrato",
      responsavelId: c.gestorId,
      prazo: prazos.dataLimiteManifestacao,
      link: `/contratos/${c.contrato_id}/avaliacao`,
    });
  }

  if (decidido && !temProcesso) {
    const a = c.avaliacaoRenovacao!;
    const acao =
      a.desejaEncerrar === "Sim"
        ? "Formalizar não renovação / encerramento junto ao fornecedor"
        : a.desejaSubstituir === "Sim"
          ? "Abrir processo de substituição de fornecedor"
          : "Abrir processo de renovação";
    acoes.push({
      id: `${c.contrato_id}:processo`,
      prioridade: prioridadeDosPrazos(prazos, true),
      referencia: ref,
      acao,
      responsavelId: c.analistaId,
      prazo: prazos.dataLimiteManifestacao,
      link: `/contratos/${c.contrato_id}`,
    });
  }

  if (prazos.renovacaoAutomaticaEmRisco) {
    acoes.push({
      id: `${c.contrato_id}:auto`,
      prioridade: "Crítico",
      referencia: ref,
      acao: "Renovação automática em risco — formalizar posição antes da data limite",
      responsavelId: c.analistaId,
      prazo: prazos.dataLimiteManifestacao,
      link: `/contratos/${c.contrato_id}`,
    });
  }
  return acoes;
}

const ACAO_POR_STATUS: Partial<Record<ProcessoContratacao["status"], string>> = {
  Rascunho: "Concluir abertura do processo",
  "Validação de Suprimentos": "Validar dados recebidos do JIRA",
  "Em cotação": "Registrar e comparar cotações",
  "Em negociação": "Concluir negociação e definir fornecedor recomendado",
  "Em análise jurídica": "Emitir parecer jurídico",
  "Aguardando assinatura": "Coletar assinaturas e anexar contrato assinado",
  Suspenso: "Processo suspenso — revisar continuidade",
};

function acoesDeProcesso(p: ProcessoContratacao, ctx: Contexto): AcaoNecessaria[] {
  if (!processoAtivo(p)) return [];
  const ref = { tipo: "processo" as const, id: p.processo_id, codigo: p.codigo };
  const link = `/processos/${p.processo_id}`;

  // Processos ligados a um contrato herdam a urgência do prazo dele.
  const anterior = p.contrato_anterior_id ? ctx.contratos.find((c) => c.contrato_id === p.contrato_anterior_id) : undefined;
  const prazosAnt = anterior ? prazosDoContrato(anterior, ctx.referencia, ctx.regras) : undefined;
  const prioridade: Prioridade = prazosAnt ? prioridadeDosPrazos(prazosAnt, true) : "Normal";
  const prazo = prazosAnt?.dataLimiteManifestacao ?? addDias(p.atualizadoEm.slice(0, 10), 15);

  if (p.status === "Aguardando aprovação comercial") {
    return p.aprovacoes
      .filter((a) => a.status === "Pendente")
      .map((a) => ({
        id: `${p.processo_id}:aprov:${a.papel}`,
        prioridade,
        referencia: ref,
        acao: a.tipo === "Ciência" ? `Dar ciência (${a.papel})` : `Aprovar processo (${a.papel})`,
        responsavelId: a.usuarioId,
        prazo,
        link,
      }));
  }
  const acao = ACAO_POR_STATUS[p.status];
  if (!acao) return [];
  const responsavelId = p.status === "Em análise jurídica" ? p.juridico.responsavelId ?? ctx.juridicoPadraoId : p.analistaId ?? p.criadoPorId;
  return [{ id: `${p.processo_id}:${p.status}`, prioridade, referencia: ref, acao, responsavelId, prazo, link }];
}

export function calcularAcoes(ctx: Contexto): AcaoNecessaria[] {
  const regras = ctx.regras ?? REGRAS_ALERTA_PADRAO;
  const referencia = ctx.referencia ?? hoje();
  const full = { ...ctx, regras, referencia };
  const abertosPorContrato = new Map<string, ProcessoContratacao[]>();
  for (const p of ctx.processos) {
    if (p.contrato_anterior_id && processoAtivo(p)) {
      const l = abertosPorContrato.get(p.contrato_anterior_id) ?? [];
      l.push(p);
      abertosPorContrato.set(p.contrato_anterior_id, l);
    }
  }
  const acoes = [
    ...ctx.contratos.flatMap((c) => acoesDeContrato(c, abertosPorContrato.get(c.contrato_id) ?? [], full)),
    ...ctx.processos.flatMap((p) => acoesDeProcesso(p, full)),
  ];
  return acoes.sort(
    (a, b) => ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade] || (a.prazo ?? "9").localeCompare(b.prazo ?? "9"),
  );
}
