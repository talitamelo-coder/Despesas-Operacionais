import { addMeses, diffDias, hoje } from "../datas";
import { cotacaoNaData, competenciaDe, parcelasDoPeriodo, type DadosCusto } from "./licencas";
import { proximaRevisaoAnual, ultimaRevisao } from "./prazos";
import { fixoNoPeriodo } from "./receita";
import type { AporteSaldo, Contrato, EmissaoFaturamento, ISODate, LinhaTelefonica, Moeda, PedidoContrato } from "../types";

/**
 * Saldo do contrato — ÚNICA fonte deste cálculo. Fica no CONTRATO (não no fornecedor).
 *
 *   Contratado = valor anual × duração da vigência (em anos) + aportes de saldo
 *   Consumido  = pedidos aprovados (comprometido) + pedidos pagos (realizado)
 *              + licenças e linhas vinculadas ao contrato no período
 *   Disponível = contratado − consumido
 *
 * Prazo indeterminado: o saldo é do ciclo anual (de uma revisão até a seguinte).
 * Valores na moeda do contrato. Pedido acima do disponível é bloqueado: é preciso aportar saldo.
 */

export interface PeriodoSaldo {
  inicio: ISODate;
  /** Inclusive. */
  fim: ISODate;
}

/** Período do saldo: vigência inteira (determinado) ou ciclo anual atual (indeterminado). */
export function periodoDoSaldo(c: Pick<Contrato, "vigencia" | "avaliacaoRenovacao">): PeriodoSaldo | undefined {
  const v = c.vigencia;
  if (!v.dataInicio) return undefined;
  if (v.tipoVigencia !== "Prazo indeterminado") return v.dataFim && v.dataFim >= v.dataInicio ? { inicio: v.dataInicio, fim: v.dataFim } : undefined;
  // Ciclo atual: dos 12 meses anteriores à próxima revisão até a véspera dela (fica nele até a revisão ser respondida).
  const revisao = proximaRevisaoAnual(v, ultimaRevisao(c));
  const inicio = addMeses(revisao, -12) < v.dataInicio ? v.dataInicio : addMeses(revisao, -12);
  const fim = revisao;
  return { inicio, fim: new Date(Date.parse(`${fim}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) };
}

/** Duração em anos (365 dias = 1 ano). */
export function anosDoPeriodo(p: PeriodoSaldo): number {
  return (diffDias(p.inicio, p.fim) + 1) / 365;
}

const dentro = (d: ISODate, p: PeriodoSaldo) => d >= p.inicio && d <= p.fim;

/** Meses de cobrança de uma linha dentro do período (ativação = cadastro; cancelada/portada = até a alteração). */
export function mesesDaLinha(l: Pick<LinhaTelefonica, "situacao" | "criadoEm" | "atualizadoEm">, p: PeriodoSaldo): number {
  const ini = l.criadoEm.slice(0, 10) > p.inicio ? l.criadoEm.slice(0, 10) : p.inicio;
  const encerrada = l.situacao === "Cancelada" || l.situacao === "Portada";
  const fimLinha = encerrada ? l.atualizadoEm.slice(0, 10) : p.fim;
  const fim = fimLinha < p.fim ? fimLinha : p.fim;
  if (fim < ini) return 0;
  const [yi, mi] = ini.split("-").map(Number);
  const [yf, mf] = fim.split("-").map(Number);
  return (yf - yi) * 12 + (mf - mi) + 1;
}

export interface ContextoSaldo {
  pedidos: PedidoContrato[];
  /** Contratos de receita: emissões vindas de Contas a receber. */
  emissoes?: EmissaoFaturamento[];
  aportes: AporteSaldo[];
  licencas: DadosCusto;
  linhas: LinhaTelefonica[];
}

export interface SaldoContrato {
  moeda: Moeda;
  periodo?: PeriodoSaldo;
  /** Sem vigência ou sem valor: não há saldo e pedidos ficam bloqueados. */
  indisponivel?: string;
  contratadoBase: number;
  aportes: number;
  contratado: number;
  comprometido: number;
  realizado: number;
  licencas: number;
  linhas: number;
  consumido: number;
  disponivel: number;
  percentualConsumido: number;
}

/** Converte reais para a moeda do contrato (USD pela PTAX; outras pela cotação do contrato). */
function deBRL(valorBRL: number, c: Contrato, ptax?: number): number | undefined {
  if (c.condicoes.moeda === "BRL") return valorBRL;
  if (c.condicoes.moeda === "USD" && ptax) return valorBRL / ptax;
  return c.condicoes.cotacao?.valor ? valorBRL / c.condicoes.cotacao.valor : undefined;
}

export function saldoDoContrato(c: Contrato, ctx: ContextoSaldo, referencia: ISODate = hoje()): SaldoContrato {
  const moeda = c.condicoes.moeda;
  const periodo = periodoDoSaldo(c);
  const vazio = { moeda, periodo, contratadoBase: 0, aportes: 0, contratado: 0, comprometido: 0, realizado: 0, licencas: 0, linhas: 0, consumido: 0, disponivel: 0, percentualConsumido: 0 };
  if (!periodo) return { ...vazio, indisponivel: "Informe a vigência do contrato para calcular o saldo." };

  if (c.natureza === "Receita") return saldoReceita(c, ctx, periodo, vazio);
  const contratadoBase = (c.condicoes.valorAnual ?? 0) * anosDoPeriodo(periodo);
  const aportes = ctx.aportes.filter((a) => a.contrato_id === c.contrato_id && (c.vigencia.tipoVigencia !== "Prazo indeterminado" || dentro(a.data, periodo))).reduce((s, a) => s + a.valor, 0);
  const pedidos = ctx.pedidos.filter((p) => p.contrato_id === c.contrato_id && p.status !== "Cancelado" && (c.vigencia.tipoVigencia !== "Prazo indeterminado" || dentro(p.data, periodo)));
  const comprometido = pedidos.filter((p) => p.status === "Aprovado").reduce((s, p) => s + p.valor, 0);
  const realizado = pedidos.filter((p) => p.status === "Pago").reduce((s, p) => s + p.valor, 0);

  // Licenças vinculadas: o contratado delas dentro do período, na moeda do contrato.
  const doContrato = new Set(ctx.licencas.licencas.filter((l) => l.contrato_id === c.contrato_id).map((l) => l.id));
  let licencas = 0;
  if (doContrato.size) {
    const d = { ...ctx.licencas, licencas: ctx.licencas.licencas.filter((l) => doContrato.has(l.id)) };
    for (const p of parcelasDoPeriodo(d, competenciaDe(periodo.inicio), competenciaDe(periodo.fim), referencia)) {
      if (moeda === "USD") licencas += p.valorUSD ?? 0;
      else if (moeda === "BRL") licencas += p.custoRealBRL ?? 0;
      else licencas += deBRL(p.custoRealBRL ?? 0, c) ?? 0;
    }
  }
  const ptax = cotacaoNaData(ctx.licencas.cotacoes, referencia)?.ptaxVenda;
  const linhasBRL = ctx.linhas.filter((l) => l.contrato_id === c.contrato_id).reduce((s, l) => s + l.valorMensal * mesesDaLinha(l, periodo), 0);
  const linhas = deBRL(linhasBRL, c, ptax) ?? 0;

  const contratado = contratadoBase + aportes;
  const consumido = comprometido + realizado + licencas + linhas;
  return {
    moeda,
    periodo,
    indisponivel: contratado > 0 ? undefined : "Contrato sem valor: registre o valor anual ou um aporte de saldo.",
    contratadoBase,
    aportes,
    contratado,
    comprometido,
    realizado,
    licencas,
    linhas,
    consumido,
    disponivel: contratado - consumido,
    percentualConsumido: contratado ? (consumido / contratado) * 100 : 0,
  };
}

/**
 * Saldo a faturar (contrato de cliente): valor total contratado (ou fixo × meses da vigência, com
 * escalonamento) + aditivos − notas emitidas pelo Contas a receber.
 */
function saldoReceita(c: Contrato, ctx: ContextoSaldo, periodo: PeriodoSaldo, vazio: SaldoContrato): SaldoContrato {
  const r = c.receita;
  if (!r) return { ...vazio, indisponivel: "Contrato sem valores contratados." };
  if (r.contratoPrincipalId) return { ...vazio, indisponivel: "Receita apurada no contrato principal: o saldo fica lá." };
  const contratadoBase = r.valorTotalContratado ?? (r.tipoReceita === "Variável" ? 0 : fixoNoPeriodo(r, periodo.inicio, periodo.fim));
  const indeterminado = c.vigencia.tipoVigencia === "Prazo indeterminado";
  const aportes = ctx.aportes.filter((a) => a.contrato_id === c.contrato_id && (!indeterminado || dentro(a.data, periodo))).reduce((s, a) => s + a.valor, 0);
  const emitido = (ctx.emissoes ?? []).filter((e) => e.contrato_id === c.contrato_id && e.status === "Emitida" && (!indeterminado || dentro(e.data, periodo))).reduce((s, e) => s + e.valor, 0);
  const contratado = contratadoBase + aportes;
  return {
    ...vazio,
    indisponivel: contratado > 0 ? undefined : "Contrato variável sem valor total: não há saldo a faturar; acompanhe pela estimativa mensal.",
    contratadoBase,
    aportes,
    contratado,
    realizado: emitido,
    consumido: emitido,
    disponivel: contratado - emitido,
    percentualConsumido: contratado ? (emitido / contratado) * 100 : 0,
  };
}

/** Integração Contas a receber: emissão acima do saldo a faturar é recusada (precisa de aditivo). */
/**
 * Contrato aceita pedido/faturamento: vigente, ou cancelado (não renovado) ainda dentro da vigência —
 * o cancelamento vale para o fim do contrato, não interrompe o que está em curso.
 */
export function aceitaMovimento(c: Pick<Contrato, "status" | "vigencia">, referencia: ISODate = hoje()): boolean {
  if (c.status === "Vigente") return true;
  return c.status === "Cancelado" && Boolean(c.vigencia.dataFim) && c.vigencia.dataFim >= referencia;
}

export function erroSaldoEmissao(s: SaldoContrato, valor: number, c: Pick<Contrato, "status" | "vigencia">, referencia: ISODate = hoje()): string | undefined {
  if (!aceitaMovimento(c, referencia)) return `Contrato ${c.status.toLowerCase()} não aceita faturamento.`;
  if (!(valor > 0)) return "Informe o valor da emissão.";
  if (s.indisponivel) return undefined; // variável sem valor total: sem limite de saldo
  if (valor > s.disponivel + 0.005) return `Emissão acima do saldo a faturar (disponível ${fmt(s.disponivel, s.moeda)}). É preciso registrar um aditivo no contrato.`;
  return undefined;
}

/** Bloqueio: o pedido só entra se couber no disponível. Devolve a mensagem de bloqueio. */
export function erroSaldoPedido(s: SaldoContrato, valor: number, c: Pick<Contrato, "status" | "vigencia">, referencia: ISODate = hoje()): string | undefined {
  if (!aceitaMovimento(c, referencia)) return `Contrato ${c.status.toLowerCase()} não aceita pedidos.`;
  if (!(valor > 0)) return "Informe o valor do pedido.";
  if (s.indisponivel) return s.indisponivel;
  if (valor > s.disponivel + 0.005)
    return `Saldo insuficiente: disponível ${fmt(s.disponivel, s.moeda)}. Adicione pelo menos ${fmt(valor - s.disponivel, s.moeda)} de saldo ao contrato para registrar este pedido.`;
  return undefined;
}

/** Uma mudança (compra de licença, linha nova…) não pode deixar o saldo negativo nem piorar um saldo já negativo. */
export function erroSaldoApos(antes: SaldoContrato, depois: SaldoContrato, codigo: string): string | undefined {
  if (depois.disponivel >= -0.005 || depois.disponivel >= antes.disponivel - 0.005) return undefined;
  return `Saldo insuficiente no contrato ${codigo}: esta operação consome ${fmt(antes.disponivel - depois.disponivel, depois.moeda)} e o disponível é ${fmt(Math.max(0, antes.disponivel), depois.moeda)}. Adicione saldo ao contrato antes.`;
}

export const ALERTAS_SALDO = [80, 100] as const;

/** Faixa de alerta atingida (80% ou 100% consumido), para Ações Necessárias. */
export function faixaAlertaSaldo(s: SaldoContrato): 80 | 100 | undefined {
  if (s.indisponivel || !s.contratado) return undefined;
  if (s.percentualConsumido >= 100) return 100;
  if (s.percentualConsumido >= 80) return 80;
  return undefined;
}

function fmt(v: number, moeda: Moeda): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(v);
}
