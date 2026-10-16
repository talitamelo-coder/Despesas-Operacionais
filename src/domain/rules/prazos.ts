import { addDias, addMeses, diffDias, hoje } from "../datas";
import type { Contrato, ISODate, RegrasAlerta, Vigencia } from "../types";

/**
 * Regras de prazo de vigência e renovação — ÚNICA fonte destas fórmulas.
 *
 *   Data limite de manifestação = Data fim − Aviso prévio
 *   Data de abertura da avaliação = Data limite − Prazo do gestor
 *
 * Ex.: aviso 90 + gestor 30 => avaliação abre 120 dias antes do fim.
 *
 * Prazo indeterminado: todo ano há uma revisão (aniversário da data-base, padrão = data de início).
 * A revisão funciona como uma "data fim" do ciclo: mesmas fases e alertas, para decidir se o
 * fornecedor é mantido. Respondida a revisão, o ciclo seguinte é o próximo aniversário.
 */

export const PRAZO_GESTOR_PADRAO_DIAS = 30;
/** Últimos dias antes da data limite em que a falta de decisão passa a exigir ação imediata. */
export const DIAS_DATA_LIMITE_PROXIMA = 15;

export const REGRAS_ALERTA_PADRAO: RegrasAlerta = {
  prazoGestorPadraoDias: PRAZO_GESTOR_PADRAO_DIAS,
  lembretesDias: [60, 30],
  diasRiscoRenovacaoAutomatica: 30,
  canalEmail: true,
  canalSistema: true,
};

export type FaseRenovacao =
  | "Sem vigência" // datas ainda não informadas (pendência crítica)
  | "Normal"
  | "Avaliação aberta"
  | "Data limite próxima"
  | "Data limite vencida"
  | "Vencido";

export interface PrazosCalculados {
  duracaoDias: number;
  diasAteVencimento: number;
  dataLimiteManifestacao: ISODate;
  dataAberturaAvaliacao: ISODate;
  diasAteDataLimite: number;
  fase: FaseRenovacao;
  renovacaoAutomaticaEmRisco: boolean;
  /** Prazo indeterminado: data da revisão anual do ciclo atual. */
  proximaRevisao?: ISODate;
}

/** Próxima revisão anual: primeiro aniversário da data-base posterior à última revisão respondida. */
export function proximaRevisaoAnual(v: Pick<Vigencia, "dataInicio" | "dataBaseRevisao">, ultimaRevisao?: ISODate): ISODate {
  const base = v.dataBaseRevisao || v.dataInicio;
  if (!base) return "";
  let anos = 1;
  while (ultimaRevisao && addMeses(base, 12 * anos) <= ultimaRevisao) anos++;
  return addMeses(base, 12 * anos);
}

/** Vigência do ciclo atual: no prazo indeterminado, a data fim é a próxima revisão anual. */
export function vigenciaDoCiclo(v: Vigencia, ultimaRevisao?: ISODate): Vigencia {
  if (v.tipoVigencia !== "Prazo indeterminado") return v;
  return { ...v, dataFim: proximaRevisaoAnual(v, ultimaRevisao), renovacaoAutomatica: false };
}

/** Todo contrato precisa de vigência (mesmo indeterminado: a data de início ancora a revisão anual). */
export function errosVigencia(v: Partial<Vigencia>): string[] {
  const e: string[] = [];
  if (!v.dataInicio) e.push("Informe a data de início da vigência.");
  if (v.tipoVigencia !== "Prazo indeterminado") {
    if (!v.dataFim) e.push("Informe a data de fim ou marque prazo indeterminado.");
    else if (v.dataInicio && v.dataFim <= v.dataInicio) e.push("A data de fim deve ser posterior à data de início.");
  }
  return e;
}

export function dataLimiteManifestacao(v: Pick<Vigencia, "dataFim" | "avisoPrevioDias">): ISODate {
  return addDias(v.dataFim, -(v.avisoPrevioDias ?? 0));
}

export function dataAberturaAvaliacao(
  v: Pick<Vigencia, "dataFim" | "avisoPrevioDias" | "prazoGestorDias">,
): ISODate {
  return addDias(dataLimiteManifestacao(v), -(v.prazoGestorDias ?? PRAZO_GESTOR_PADRAO_DIAS));
}

export function calcularPrazos(
  vigencia: Vigencia,
  opcoes: { referencia?: ISODate; resolvido?: boolean; regras?: RegrasAlerta; ultimaRevisao?: ISODate } = {},
): PrazosCalculados {
  const indeterminado = vigencia.tipoVigencia === "Prazo indeterminado";
  const v = vigenciaDoCiclo(vigencia, opcoes.ultimaRevisao);
  const ref = opcoes.referencia ?? hoje();
  const regras = opcoes.regras ?? REGRAS_ALERTA_PADRAO;
  const limite = dataLimiteManifestacao(v);
  const abertura = dataAberturaAvaliacao(v);
  const diasAteVencimento = diffDias(ref, v.dataFim);
  const diasAteDataLimite = diffDias(ref, limite);

  let fase: FaseRenovacao;
  if (!v.dataInicio || !v.dataFim) fase = "Sem vigência";
  // Revisão anual não "vence": fica pendente até o gestor responder.
  else if (diasAteVencimento < 0) fase = indeterminado ? "Data limite vencida" : "Vencido";
  else if (diasAteDataLimite < 0) fase = "Data limite vencida";
  else if (diasAteDataLimite <= DIAS_DATA_LIMITE_PROXIMA) fase = "Data limite próxima";
  else if (diffDias(ref, abertura) <= 0) fase = "Avaliação aberta";
  else fase = "Normal";

  // Renovação automática é característica contratual: gera alerta, nunca cria contrato,
  // nunca altera vigência. Permanece em risco até haver resolução formal (sucessor ou encerramento),
  // mesmo que o gestor já tenha respondido — o alerta crítico de Suprimentos não é removido.
  const renovacaoAutomaticaEmRisco =
    v.renovacaoAutomatica &&
    !indeterminado &&
    Boolean(v.dataFim) &&
    !opcoes.resolvido &&
    diasAteVencimento >= 0 &&
    diasAteDataLimite <= regras.diasRiscoRenovacaoAutomatica;

  return {
    duracaoDias: indeterminado ? NaN : diffDias(v.dataInicio, v.dataFim),
    diasAteVencimento,
    dataLimiteManifestacao: limite,
    dataAberturaAvaliacao: abertura,
    diasAteDataLimite,
    fase,
    renovacaoAutomaticaEmRisco,
    proximaRevisao: indeterminado ? v.dataFim : undefined,
  };
}

/**
 * Decisão do gestor já registrada para o ciclo atual. No prazo indeterminado a resposta encerra o
 * ciclo (o próximo é a revisão do ano seguinte), então não há decisão pendente "registrada".
 */
export function decisaoRegistrada(c: Pick<Contrato, "avaliacaoRenovacao" | "vigencia">): boolean {
  if (c.vigencia.tipoVigencia === "Prazo indeterminado") return false;
  return Boolean(c.avaliacaoRenovacao?.respondidoEm);
}

/** Última revisão anual respondida (âncora do próximo ciclo do prazo indeterminado). */
export function ultimaRevisao(c: Pick<Contrato, "avaliacaoRenovacao" | "vigencia">): ISODate | undefined {
  return c.vigencia.tipoVigencia === "Prazo indeterminado" ? c.avaliacaoRenovacao?.cicloRevisao : undefined;
}

/** Contrato com ciclo resolvido: já tem sucessor ou não está mais vigente. */
export function cicloResolvido(c: Pick<Contrato, "sucessor_id" | "status">): boolean {
  return Boolean(c.sucessor_id) || c.status !== "Vigente";
}

export function prazosDoContrato(c: Contrato, referencia?: ISODate, regras?: RegrasAlerta): PrazosCalculados {
  return calcularPrazos(c.vigencia, { referencia, regras, resolvido: cicloResolvido(c), ultimaRevisao: ultimaRevisao(c) });
}
