import { prazosDoContrato } from "./prazos";
import { receitaMensalNaData, valorMensalFixoNaData } from "./receita";
import { faixaAlertaSaldo, type SaldoContrato } from "./saldo";
import type { Contrato, ISODate, TipoReceita } from "../types";

/**
 * Painel de contratos de clientes — ÚNICA fonte destes agregados e alertas.
 * Receita em BRL (contratos em moeda estrangeira pela cotação registrada no contrato).
 * Entram na receita os contratos Vigentes e os Cancelados que ainda correm até o fim da vigência.
 */

export type FaixaVencimento = "Vencido" | "Até 90 dias" | "91 a 180 dias" | "181 a 365 dias" | "Acima de 1 ano" | "Prazo indeterminado" | "Sem vigência";

export const FAIXAS_VENCIMENTO: FaixaVencimento[] = ["Vencido", "Até 90 dias", "91 a 180 dias", "181 a 365 dias", "Acima de 1 ano", "Prazo indeterminado", "Sem vigência"];

export interface LinhaPainelCliente {
  contrato: Contrato;
  receitaBRL: number;
  fixaBRL: number;
  faixa: FaixaVencimento;
  /** Dias até o fim (ou até a próxima revisão anual, no indeterminado). */
  dias?: number;
  apuradaEmOutro: boolean;
}

export interface AgregadoPainel {
  chave: string;
  valor: number;
  quantidade: number;
}

export type GravidadeAlertaCliente = "critico" | "alerta" | "info";

export interface AlertaCliente {
  contrato_id?: string;
  gravidade: GravidadeAlertaCliente;
  titulo: string;
  detalhe: string;
}

export interface PainelClientes {
  linhas: LinhaPainelCliente[];
  receitaMensal: number;
  receitaFixa: number;
  receitaAnual: number;
  emRisco: { valor: number; quantidade: number };
  renovacaoAutomatica: { valor: number; quantidade: number };
  semEstimativa: number;
  porCliente: AgregadoPainel[];
  porTipo: AgregadoPainel[];
  porGestor: AgregadoPainel[];
  porFaixa: AgregadoPainel[];
  concentracao?: { clienteId: string; percentual: number };
  alertas: AlertaCliente[];
}

/** Acima disto, a concentração em um cliente vira alerta. */
export const LIMITE_CONCENTRACAO = 50;

const fatorBRL = (c: Contrato) => (c.condicoes.moeda === "BRL" ? 1 : c.condicoes.cotacao?.valor ?? 0);

export function receitaMensalBRL(c: Contrato, data: ISODate): number {
  return c.receita ? receitaMensalNaData(c.receita, data) * fatorBRL(c) : 0;
}

function fixaMensalBRL(c: Contrato, data: ISODate): number {
  if (!c.receita || c.receita.contratoPrincipalId || c.receita.tipoReceita === "Variável") return 0;
  return valorMensalFixoNaData(c.receita, data) * fatorBRL(c);
}

/** Contrato que ainda gera receita na data (Vigente, ou Cancelado até o fim da vigência). */
export function geraReceita(c: Contrato, data: ISODate): boolean {
  if (c.natureza !== "Receita") return false;
  if (c.status === "Vigente") return true;
  return c.status === "Cancelado" && Boolean(c.vigencia.dataFim) && c.vigencia.dataFim >= data;
}

export function faixaVencimento(c: Contrato, data: ISODate): { faixa: FaixaVencimento; dias?: number } {
  const v = c.vigencia;
  if (v.tipoVigencia === "Prazo indeterminado") {
    if (!v.dataInicio) return { faixa: "Sem vigência" };
    return { faixa: "Prazo indeterminado", dias: prazosDoContrato(c, data).diasAteVencimento };
  }
  if (!v.dataFim) return { faixa: "Sem vigência" };
  const dias = prazosDoContrato(c, data).diasAteVencimento;
  if (dias < 0) return { faixa: "Vencido", dias };
  if (dias <= 90) return { faixa: "Até 90 dias", dias };
  if (dias <= 180) return { faixa: "91 a 180 dias", dias };
  if (dias <= 365) return { faixa: "181 a 365 dias", dias };
  return { faixa: "Acima de 1 ano", dias };
}

function agrupar(linhas: LinhaPainelCliente[], chave: (l: LinhaPainelCliente) => string): AgregadoPainel[] {
  const m = new Map<string, AgregadoPainel>();
  for (const l of linhas) {
    const k = chave(l);
    const a = m.get(k) ?? { chave: k, valor: 0, quantidade: 0 };
    a.valor += l.receitaBRL;
    a.quantidade += 1;
    m.set(k, a);
  }
  return [...m.values()].sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade);
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Monta o painel. `saldos` (opcional) traz o saldo a faturar por contrato para os alertas de 80%/100%.
 * `nomeCliente` só compõe o texto dos alertas.
 */
export function montarPainelClientes(
  contratos: Contrato[],
  data: ISODate,
  opcoes: { saldos?: Record<string, SaldoContrato>; nomeCliente?: (id?: string) => string; pendencias?: (c: Contrato) => string[] } = {},
): PainelClientes {
  const nome = opcoes.nomeCliente ?? ((id?: string) => id ?? "—");
  const ativos = contratos.filter((c) => geraReceita(c, data));
  const linhas: LinhaPainelCliente[] = ativos.map((c) => ({
    contrato: c,
    receitaBRL: receitaMensalBRL(c, data),
    fixaBRL: fixaMensalBRL(c, data),
    ...faixaVencimento(c, data),
    apuradaEmOutro: Boolean(c.receita?.contratoPrincipalId),
  }));
  const receitaMensal = linhas.reduce((a, l) => a + l.receitaBRL, 0);
  const receitaFixa = linhas.reduce((a, l) => a + l.fixaBRL, 0);
  const risco = linhas.filter((l) => l.faixa === "Vencido" || l.faixa === "Até 90 dias");
  const auto = linhas.filter((l) => l.contrato.vigencia.renovacaoAutomatica || l.faixa === "Prazo indeterminado");
  const porCliente = agrupar(linhas, (l) => l.contrato.clienteId ?? "");
  const maior = porCliente[0];
  const concentracao = maior && receitaMensal > 0 ? { clienteId: maior.chave, percentual: (maior.valor / receitaMensal) * 100 } : undefined;
  const semEstimativa = linhas.filter((l) => !l.apuradaEmOutro && l.receitaBRL === 0).length;

  const alertas: AlertaCliente[] = [];
  for (const l of linhas) {
    const c = l.contrato;
    const quem = `${nome(c.clienteId)} · ${c.objeto}`;
    const valor = l.receitaBRL ? ` Receita mensal ${brl(l.receitaBRL)}.` : "";
    if (c.status === "Cancelado") {
      alertas.push({ contrato_id: c.contrato_id, gravidade: "info", titulo: "Cancelado: receita até o fim da vigência", detalhe: `${quem}. Não será renovado; deixa de gerar receita em ${c.vigencia.dataFim.split("-").reverse().join("/")}.${valor}` });
    } else if (l.faixa === "Vencido" && !c.sucessor_id) {
      alertas.push({ contrato_id: c.contrato_id, gravidade: "critico", titulo: "Vencido sem novo contrato registrado", detalhe: `${quem}. Venceu há ${Math.abs(l.dias ?? 0)} dia(s).${valor} Registre a renovação ou o encerramento.` });
    } else if (l.faixa === "Até 90 dias" && !c.sucessor_id) {
      alertas.push({ contrato_id: c.contrato_id, gravidade: "alerta", titulo: `Vence em ${l.dias} dia(s)`, detalhe: `${quem}.${valor} Avaliação de renovação com o gestor do contrato.` });
    }
    if (c.status === "Vigente" && l.faixa === "Prazo indeterminado" && l.dias !== undefined && l.dias <= 90) {
      const atrasada = l.dias < 0;
      alertas.push({ contrato_id: c.contrato_id, gravidade: atrasada ? "alerta" : "info", titulo: atrasada ? `Revisão anual atrasada há ${-l.dias} dia(s)` : `Revisão anual em ${l.dias} dia(s)`, detalhe: `${quem}. Prazo indeterminado: o gestor confirma se o contrato continua.` });
    }
    const s = opcoes.saldos?.[c.contrato_id];
    const fx = s ? faixaAlertaSaldo(s) : undefined;
    if (s && fx) alertas.push({ contrato_id: c.contrato_id, gravidade: fx === 100 ? "critico" : "alerta", titulo: fx === 100 ? "Saldo a faturar esgotado" : `Saldo a faturar ${Math.round(s.percentualConsumido)}% utilizado`, detalhe: `${quem}. O Contas a receber não emite acima do contratado: avalie aditivo.` });
    const pend = opcoes.pendencias?.(c) ?? [];
    if (!l.apuradaEmOutro && l.receitaBRL === 0 && !pend.length) alertas.push({ contrato_id: c.contrato_id, gravidade: "info", titulo: "Sem estimativa de receita", detalhe: `${quem}. Informe a estimativa mensal ou o contrato em que a receita é apurada.` });
    if (pend.length) alertas.push({ contrato_id: c.contrato_id, gravidade: "info", titulo: "Cadastro a completar", detalhe: `${quem}. Falta: ${pend.join(", ")}.` });
  }
  if (concentracao && concentracao.percentual > LIMITE_CONCENTRACAO) {
    alertas.push({ gravidade: "alerta", titulo: `Concentração: ${Math.round(concentracao.percentual)}% da receita em um cliente`, detalhe: `${nome(concentracao.clienteId)} responde por mais de ${LIMITE_CONCENTRACAO}% da receita mensal contratada.` });
  }
  const ordem: Record<GravidadeAlertaCliente, number> = { critico: 0, alerta: 1, info: 2 };
  alertas.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);

  const porFaixa = FAIXAS_VENCIMENTO.map((f) => {
    const ls = linhas.filter((l) => l.faixa === f);
    return { chave: f, valor: ls.reduce((a, l) => a + l.receitaBRL, 0), quantidade: ls.length };
  }).filter((a) => a.quantidade > 0);

  return {
    linhas,
    receitaMensal,
    receitaFixa,
    receitaAnual: receitaMensal * 12,
    emRisco: { valor: risco.reduce((a, l) => a + l.receitaBRL, 0), quantidade: risco.length },
    renovacaoAutomatica: { valor: auto.reduce((a, l) => a + l.receitaBRL, 0), quantidade: auto.length },
    semEstimativa,
    porCliente,
    porTipo: agrupar(linhas.filter((l) => !l.apuradaEmOutro), (l) => l.contrato.receita?.tipoReceita ?? ("Fixa" as TipoReceita)),
    porGestor: agrupar(linhas, (l) => l.contrato.gestorId),
    porFaixa,
    concentracao,
    alertas,
  };
}
