import { addDias, diffDias, hoje } from "../datas";
import type { Contrato, ISODate, RegrasAlerta, Vigencia } from "../types";

/**
 * Regras de prazo de vigência e renovação — ÚNICA fonte destas fórmulas.
 *
 *   Data limite de manifestação = Data fim − Aviso prévio
 *   Data de abertura da avaliação = Data limite − Prazo do gestor
 *
 * Ex.: aviso 90 + gestor 30 => avaliação abre 120 dias antes do fim.
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
  | "Sem prazo" // prazo indeterminado
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
  v: Vigencia,
  opcoes: { referencia?: ISODate; resolvido?: boolean; regras?: RegrasAlerta } = {},
): PrazosCalculados {
  const ref = opcoes.referencia ?? hoje();
  const regras = opcoes.regras ?? REGRAS_ALERTA_PADRAO;
  const limite = dataLimiteManifestacao(v);
  const abertura = dataAberturaAvaliacao(v);
  const diasAteVencimento = diffDias(ref, v.dataFim);
  const diasAteDataLimite = diffDias(ref, limite);

  let fase: FaseRenovacao;
  if (v.tipoVigencia === "Prazo indeterminado") fase = "Sem prazo";
  else if (diasAteVencimento < 0) fase = "Vencido";
  else if (diasAteDataLimite < 0) fase = "Data limite vencida";
  else if (diasAteDataLimite <= DIAS_DATA_LIMITE_PROXIMA) fase = "Data limite próxima";
  else if (diffDias(ref, abertura) <= 0) fase = "Avaliação aberta";
  else fase = "Normal";

  // Renovação automática é característica contratual: gera alerta, nunca cria contrato,
  // nunca altera vigência. Permanece em risco até haver resolução formal (sucessor ou encerramento),
  // mesmo que o gestor já tenha respondido — o alerta crítico de Suprimentos não é removido.
  const renovacaoAutomaticaEmRisco =
    v.renovacaoAutomatica &&
    v.tipoVigencia !== "Prazo indeterminado" &&
    !opcoes.resolvido &&
    diasAteVencimento >= 0 &&
    diasAteDataLimite <= regras.diasRiscoRenovacaoAutomatica;

  return {
    duracaoDias: diffDias(v.dataInicio, v.dataFim),
    diasAteVencimento,
    dataLimiteManifestacao: limite,
    dataAberturaAvaliacao: abertura,
    diasAteDataLimite,
    fase,
    renovacaoAutomaticaEmRisco,
  };
}

/** Decisão do gestor já registrada na avaliação de renovação. */
export function decisaoRegistrada(c: Pick<Contrato, "avaliacaoRenovacao">): boolean {
  return Boolean(c.avaliacaoRenovacao?.respondidoEm);
}

/** Contrato com ciclo resolvido: já tem sucessor ou não está mais vigente. */
export function cicloResolvido(c: Pick<Contrato, "sucessor_id" | "status">): boolean {
  return Boolean(c.sucessor_id) || c.status !== "Vigente";
}

export function prazosDoContrato(c: Contrato, referencia?: ISODate, regras?: RegrasAlerta): PrazosCalculados {
  return calcularPrazos(c.vigencia, { referencia, regras, resolvido: cicloResolvido(c) });
}
