import { diffDias, hoje } from "../datas";
import { prazosDoContrato } from "./prazos";
import type {
  AtribuicaoLicenca,
  ChaveParametro,
  Colaborador,
  Contrato,
  CotacaoDia,
  ISODate,
  Licenca,
  MovimentacaoLicenca,
  OrcamentoFornecedor,
  Parametro,
  PeriodicidadeLicenca,
  TipoCobranca,
} from "../types";

/**
 * Regras do controle de licenças de software — ÚNICA fonte destes cálculos.
 *
 * - Este módulo registra o CONTRATADO. O real pago é registrado em Pedidos/Contas a pagar.
 * - Assentos e preço vêm das movimentações (compra, redução, renegociação, cancelamento).
 * - BRL: custo = valor original, sem IOF. USD: valor × PTAX × (1 + spread) + IOF sobre esse valor.
 * - Custo real (valor + IOF) é a base de todo total. Impostos simulados nunca entram nos totais.
 * - Nada aqui altera contrato.
 */

// ---------------------------------------------------------------- Identidade do colaborador

export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Domínios do grupo (parâmetro "dominios_grupo", separados por vírgula). O primeiro é o canônico. */
export function dominiosDoGrupo(parametros: Parametro[], data: ISODate = hoje()): string[] {
  return (parametroNaData(parametros, "dominios_grupo", data) ?? "")
    .split(/[,;\s]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/** Chave de identidade: e-mail em minúsculas; domínios do grupo viram o domínio canônico. */
export function chaveEmail(email: string, dominios: string[] = []): string {
  const e = email.trim().toLowerCase();
  const [local, dominio] = e.split("@");
  if (!dominio || !dominios.length) return e;
  return dominios.includes(dominio) ? `${local}@${dominios[0]}` : e;
}

/** Conta fora do padrão nome.sobrenome: sugerir marcar como compartilhada. */
export function pareceContaCompartilhada(email: string): boolean {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  return !/^[a-z]+[._-][a-z]+/.test(local);
}

// ---------------------------------------------------------------- Parâmetros e câmbio

export function parametroNaData(parametros: Parametro[], chave: ChaveParametro, data: ISODate): string | undefined {
  let atual: Parametro | undefined;
  for (const p of parametros) if (p.chave === chave && p.vigenteDesde <= data && (!atual || p.vigenteDesde >= atual.vigenteDesde)) atual = p;
  return atual?.valor;
}

export function numeroParametro(parametros: Parametro[], chave: ChaveParametro, data: ISODate): number | undefined {
  const v = parametroNaData(parametros, chave, data);
  if (v === undefined || v.trim() === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** PTAX de venda mais recente até a data (fim de semana/feriado usa o último dia útil). */
export function cotacaoNaData(cotacoes: CotacaoDia[], data: ISODate): CotacaoDia | undefined {
  let atual: CotacaoDia | undefined;
  for (const c of cotacoes) if (c.data <= data && (!atual || c.data > atual.data)) atual = c;
  return atual;
}

export interface Cambio {
  ptax?: number;
  dataPtax?: ISODate;
  /** Percentuais (ex.: 4 = 4%). */
  spreadPercentual?: number;
  iofPercentual?: number;
  /** Multiplicador do cenário simulado (ex.: 1,15). */
  fatorImpostos?: number;
  exibirImpostos: boolean;
}

export function cambioNaData(cotacoes: CotacaoDia[], parametros: Parametro[], data: ISODate): Cambio {
  const c = cotacaoNaData(cotacoes, data);
  return {
    ptax: c?.ptaxVenda,
    dataPtax: c?.data,
    spreadPercentual: numeroParametro(parametros, "spread_cambial", data),
    iofPercentual: numeroParametro(parametros, "aliquota_iof_usd", data),
    fatorImpostos: numeroParametro(parametros, "fator_impostos_simulado", data),
    exibirImpostos: parametroNaData(parametros, "exibir_cenario_impostos", data) === "sim",
  };
}

export interface ValorConvertido {
  valorBRL: number;
  /** IOF só existe em USD. */
  iofBRL: number;
  custoRealBRL: number;
}

/** undefined = USD sem cotação, spread ou IOF configurados (não chutar). */
export function converterCusto(valorOriginal: number, moeda: Licenca["moeda"], cambio: Cambio): ValorConvertido | undefined {
  if (moeda === "BRL") return { valorBRL: valorOriginal, iofBRL: 0, custoRealBRL: valorOriginal };
  if (!cambio.ptax || cambio.spreadPercentual === undefined || cambio.iofPercentual === undefined) return undefined;
  const valorBRL = valorOriginal * cambio.ptax * (1 + cambio.spreadPercentual / 100);
  const iofBRL = valorBRL * (cambio.iofPercentual / 100);
  return { valorBRL, iofBRL, custoRealBRL: valorBRL + iofBRL };
}

/** Cenário "e se fosse tributado": separado, nunca somado aos totais. */
export function impostosSimulados(custoRealBRL: number, cambio: Cambio): number | undefined {
  return cambio.fatorImpostos === undefined ? undefined : custoRealBRL * cambio.fatorImpostos;
}

// ---------------------------------------------------------------- Posição (assentos e preço)

export interface Lote {
  quantidade: number;
  precoUnitario: number;
}

export interface Posicao {
  lotes: Lote[];
  assentos: number;
  cancelada: boolean;
}

export function ordenarMovimentacoes(movs: MovimentacaoLicenca[]): MovimentacaoLicenca[] {
  return [...movs].sort((a, b) => a.data.localeCompare(b.data) || a.registradoEm.localeCompare(b.registradoEm));
}

export function aplicarMovimentacao(lotes: Lote[], m: Pick<MovimentacaoLicenca, "tipo" | "quantidade" | "precoUnitario">): Lote[] {
  switch (m.tipo) {
    case "Compra":
      return [...lotes, { quantidade: m.quantidade ?? 0, precoUnitario: m.precoUnitario ?? 0 }];
    case "Redução": {
      // Sai primeiro dos lotes mais recentes.
      let falta = m.quantidade ?? 0;
      const novos = lotes.map((l) => ({ ...l }));
      for (let i = novos.length - 1; i >= 0 && falta > 0; i--) {
        const tira = Math.min(novos[i].quantidade, falta);
        novos[i].quantidade -= tira;
        falta -= tira;
      }
      return novos.filter((l) => l.quantidade > 0);
    }
    case "Renegociação":
      return lotes.map((l) => ({ ...l, precoUnitario: m.precoUnitario ?? l.precoUnitario }));
    case "Cancelamento":
      return [];
  }
}

/** Assentos e lotes vigentes na data (inclusive). */
export function posicaoNaData(movs: MovimentacaoLicenca[], data: ISODate = hoje()): Posicao {
  let lotes: Lote[] = [];
  let cancelada = false;
  for (const m of ordenarMovimentacoes(movs)) {
    if (m.data > data) break;
    lotes = aplicarMovimentacao(lotes, m);
    cancelada = m.tipo === "Cancelamento" ? true : m.tipo === "Compra" ? false : cancelada;
  }
  return { lotes, assentos: lotes.reduce((a, l) => a + l.quantidade, 0), cancelada };
}

/** Valor por período de cobrança (soma quantidade × preço dos lotes). */
export function valorPorPeriodo(lotes: Lote[]): number {
  return lotes.reduce((a, l) => a + l.quantidade * l.precoUnitario, 0);
}

/** Custo anual original = preço × assentos × (12 se mensal, 1 se anual). */
export function valorAnualOriginal(lotes: Lote[], periodicidade: PeriodicidadeLicenca): number {
  return valorPorPeriodo(lotes) * (periodicidade === "Mensal" ? 12 : 1);
}

export interface Equivalentes {
  assentos: number;
  anualOriginal: number;
  mensalOriginal: number;
  anualBRL?: ValorConvertido;
  mensalBRL?: ValorConvertido;
}

/** "Equivalente mensal" e "equivalente anual" — sempre calculados; não existe campo livre de valor mensal. */
export function equivalentes(l: Licenca, movs: MovimentacaoLicenca[], cambio: Cambio, data: ISODate = hoje()): Equivalentes {
  const pos = posicaoNaData(movs, data);
  const anualOriginal = valorAnualOriginal(pos.lotes, l.periodicidade);
  const anualBRL = converterCusto(anualOriginal, l.moeda, cambio);
  return {
    assentos: pos.assentos,
    anualOriginal,
    mensalOriginal: anualOriginal / 12,
    anualBRL,
    mensalBRL: anualBRL && { valorBRL: anualBRL.valorBRL / 12, iofBRL: anualBRL.iofBRL / 12, custoRealBRL: anualBRL.custoRealBRL / 12 },
  };
}

// ---------------------------------------------------------------- Validações

export function errosLicenca(l: Partial<Licenca>): string[] {
  const e: string[] = [];
  if (!l.fornecedorId) e.push("Informe o fornecedor.");
  if (!l.produto?.trim()) e.push("Informe o produto.");
  if (l.periodicidade === "Anual" && l.vencimentoTipo === "Mensal") e.push("Licença anual não pode ter vencimento mensal. Ajuste a periodicidade ou o tipo de vencimento.");
  if (l.vencimentoTipo === "Data" && !l.dataVencimento) e.push("Informe a data de vencimento.");
  if (l.limiteConsumoMensal !== undefined && l.tipoCobranca !== "Consumo") e.push("Limite de consumo só se aplica a licenças por consumo.");
  if (l.limiteConsumoMensal !== undefined && !(l.limiteConsumoMensal > 0)) e.push("O limite de consumo deve ser maior que zero.");
  return e;
}

export function errosMovimentacao(
  l: Pick<Licenca, "tipoCobranca" | "status">,
  movs: MovimentacaoLicenca[],
  atribuicoesAtivas: number,
  m: Pick<MovimentacaoLicenca, "tipo" | "data" | "quantidade" | "precoUnitario" | "responsavel">,
): string[] {
  const e: string[] = [];
  if (!m.data) e.push("Informe a data.");
  if (!m.responsavel?.trim()) e.push("Informe o responsável.");
  const ultima = ordenarMovimentacoes(movs).at(-1);
  if (ultima && m.data && m.data < ultima.data) e.push(`A data não pode ser anterior à última movimentação (${ultima.data}).`);
  const pos = posicaoNaData(movs, "9999-12-31");
  const porAssento = l.tipoCobranca === "Assento";
  const inteiro = (n?: number) => n !== undefined && Number.isInteger(n) && n > 0;

  if (pos.cancelada && m.tipo !== "Compra") e.push("Licença cancelada: registre uma nova compra para reativar.");
  switch (m.tipo) {
    case "Compra":
      if (!inteiro(m.quantidade)) e.push("A quantidade deve ser um número inteiro maior que zero.");
      if (!(m.precoUnitario !== undefined && m.precoUnitario >= 0)) e.push("Informe o preço unitário.");
      if (!porAssento && pos.lotes.length) e.push("Licença de valor fixo ou consumo já tem valor: use renegociação para alterar.");
      if (!porAssento && m.quantidade !== 1) e.push("Licença de valor fixo ou consumo usa quantidade 1.");
      break;
    case "Redução":
      if (!porAssento) e.push("Redução de assentos só se aplica a licença por assento.");
      else if (!inteiro(m.quantidade)) e.push("A quantidade deve ser um número inteiro maior que zero.");
      else if (m.quantidade! > pos.assentos) e.push(`Só há ${pos.assentos} assento(s) para reduzir.`);
      else if (pos.assentos - m.quantidade! < atribuicoesAtivas)
        e.push(`Há ${atribuicoesAtivas} pessoa(s) com assento. Encerre ${atribuicoesAtivas - (pos.assentos - m.quantidade!)} atribuição(ões) antes de reduzir.`);
      break;
    case "Renegociação":
      if (!pos.lotes.length) e.push("Não há assentos para renegociar.");
      if (!(m.precoUnitario !== undefined && m.precoUnitario >= 0)) e.push("Informe o novo preço unitário.");
      break;
    case "Cancelamento":
      if (!pos.lotes.length && !pos.cancelada) e.push("Não há assentos para cancelar.");
      break;
  }
  return e;
}

/** Não existe assento usado sem pessoa: atribuir sem assento livre é bloqueado. */
export function erroAtribuicao(l: Licenca, movs: MovimentacaoLicenca[], atribuicoes: AtribuicaoLicenca[], colaborador: Colaborador): string | undefined {
  if (l.status === "Cancelada") return "Licença cancelada.";
  if (colaborador.status === "Desligado") return "Colaborador desligado não recebe licença.";
  const ativas = atribuicoes.filter((a) => a.licencaId === l.id && a.status === "Ativa");
  if (ativas.some((a) => a.colaboradorId === colaborador.id)) return `${colaborador.email} já tem esta licença.`;
  if (l.tipoCobranca !== "Assento") return undefined;
  const assentos = posicaoNaData(movs, "9999-12-31").assentos;
  if (ativas.length >= assentos) return `Sem assento livre (${ativas.length} de ${assentos} em uso). Registre uma compra de +1 assento.`;
  return undefined;
}

// ---------------------------------------------------------------- Competências

/** AAAA-MM */
export type Competencia = string;

export function competenciaDe(d: ISODate): Competencia {
  return d.slice(0, 7);
}

export function fimDaCompetencia(c: Competencia): ISODate {
  const [y, m] = c.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function competenciasEntre(ini: Competencia, fim: Competencia): Competencia[] {
  const r: Competencia[] = [];
  let [y, m] = ini.split("-").map(Number);
  const [yf, mf] = fim.split("-").map(Number);
  while (y < yf || (y === yf && m <= mf)) {
    r.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) (m = 1), y++;
  }
  return r;
}

/**
 * Valor contratado cobrado na competência (moeda original).
 * Mensal: posição no fim do mês. Anual: entra inteira no mês da compra e, depois, a cada aniversário
 * da primeira compra (com a posição vigente naquela data).
 */
export function cobrancaNaCompetencia(l: Pick<Licenca, "periodicidade">, movs: MovimentacaoLicenca[], c: Competencia): number {
  const fim = fimDaCompetencia(c);
  const pos = posicaoNaData(movs, fim);
  if (!pos.lotes.length) return 0;
  if (l.periodicidade === "Mensal") return valorPorPeriodo(pos.lotes);
  const ordenadas = ordenarMovimentacoes(movs);
  const primeira = ordenadas.find((m) => m.tipo === "Compra");
  if (!primeira) return 0;
  const [, mesInicio] = primeira.data.split("-").map(Number);
  const [ano, mes] = c.split("-").map(Number);
  const anoInicio = Number(primeira.data.slice(0, 4));
  // Ciclo anual: o primeiro ciclo é cobrado pelas compras; os seguintes, no aniversário.
  if (mes === mesInicio && ano > anoInicio) return valorPorPeriodo(pos.lotes);
  return ordenadas
    .filter((m) => m.tipo === "Compra" && competenciaDe(m.data) === c && !(ano > anoInicio && mes === mesInicio))
    .reduce((a, m) => a + (m.quantidade ?? 0) * (m.precoUnitario ?? 0), 0);
}

// ---------------------------------------------------------------- Rateio (parcelas de custo)

export type TipoParcela = "Pessoa" | "Disponível" | "Não atribuído";

/** Uma fatia do custo contratado de uma licença numa competência. A soma das fatias = custo da licença. */
export interface ParcelaCusto {
  licencaId: string;
  fornecedorId: string;
  competencia: Competencia;
  tipo: TipoParcela;
  colaboradorId?: string;
  area?: string;
  centroCusto?: string;
  moeda: Licenca["moeda"];
  valorOriginal: number;
  /** undefined quando a licença em USD não tem câmbio configurado. */
  custoRealBRL?: number;
  iofBRL?: number;
  /** Exibição em USD: original para USD; BRL ÷ PTAX (sem spread) para BRL. */
  valorUSD?: number;
  impostosSimuladosBRL?: number;
}

function ativaNoFimDoMes(a: AtribuicaoLicenca, fim: ISODate): boolean {
  return a.dataInicio <= fim && (!a.dataFim || a.dataFim > fim);
}

/**
 * Rateio = custo da licença ÷ assentos faturados × assentos do usuário.
 * Assento sem pessoa = "Disponível" (ocioso). Fixo/consumo: dividido entre quem usa; sem usuário = "Não atribuído".
 */
export function parcelasDaCompetencia(
  l: Licenca,
  movs: MovimentacaoLicenca[],
  atribuicoes: AtribuicaoLicenca[],
  colaboradores: Map<string, Colaborador>,
  c: Competencia,
  cambio: Cambio,
): ParcelaCusto[] {
  const total = cobrancaNaCompetencia(l, movs, c);
  if (!total) return [];
  const fim = fimDaCompetencia(c);
  const conv = converterCusto(total, l.moeda, cambio);
  const ativas = atribuicoes.filter((a) => a.licencaId === l.id && ativaNoFimDoMes(a, fim));
  const base = { licencaId: l.id, fornecedorId: l.fornecedorId, competencia: c, moeda: l.moeda };
  const fatia = (fracao: number, extra: Pick<ParcelaCusto, "tipo" | "colaboradorId" | "area" | "centroCusto">): ParcelaCusto => {
    const custoRealBRL = conv && conv.custoRealBRL * fracao;
    return {
      ...base,
      ...extra,
      valorOriginal: total * fracao,
      custoRealBRL,
      iofBRL: conv && conv.iofBRL * fracao,
      valorUSD: l.moeda === "USD" ? total * fracao : cambio.ptax ? (total * fracao) / cambio.ptax : undefined,
      impostosSimuladosBRL: custoRealBRL !== undefined ? impostosSimulados(custoRealBRL, cambio) : undefined,
    };
  };
  const pessoa = (a: AtribuicaoLicenca, fracao: number) => {
    const col = colaboradores.get(a.colaboradorId);
    return fatia(fracao, { tipo: "Pessoa", colaboradorId: a.colaboradorId, area: col?.area ?? l.area, centroCusto: col?.centroCusto ?? l.centroCusto });
  };
  if (l.tipoCobranca === "Assento") {
    const assentos = posicaoNaData(movs, fim).assentos;
    // O sistema bloqueia mais pessoas que assentos; o max() só protege o fechamento do total.
    const divisor = Math.max(assentos, ativas.length) || 1;
    const r = ativas.map((a) => pessoa(a, 1 / divisor));
    const livres = divisor - ativas.length;
    if (livres > 0) r.push(fatia(livres / divisor, { tipo: "Disponível", area: l.area, centroCusto: l.centroCusto }));
    return r;
  }
  if (ativas.length) return ativas.map((a) => pessoa(a, 1 / ativas.length));
  return [fatia(1, { tipo: "Não atribuído", area: l.area, centroCusto: l.centroCusto })];
}

export interface DadosCusto {
  licencas: Licenca[];
  movimentacoes: MovimentacaoLicenca[];
  atribuicoes: AtribuicaoLicenca[];
  colaboradores: Colaborador[];
  cotacoes: CotacaoDia[];
  parametros: Parametro[];
}

/** Todas as parcelas do período. Câmbio e parâmetros de cada mês (meses futuros usam a última cotação). */
export function parcelasDoPeriodo(d: DadosCusto, ini: Competencia, fim: Competencia, referencia: ISODate = hoje()): ParcelaCusto[] {
  const porLicenca = new Map<string, MovimentacaoLicenca[]>();
  for (const m of d.movimentacoes) porLicenca.set(m.licencaId, [...(porLicenca.get(m.licencaId) ?? []), m]);
  const colabs = new Map(d.colaboradores.map((c) => [c.id, c]));
  const r: ParcelaCusto[] = [];
  for (const c of competenciasEntre(ini, fim)) {
    const fimMes = fimDaCompetencia(c);
    const cambio = cambioNaData(d.cotacoes, d.parametros, fimMes < referencia ? fimMes : referencia);
    for (const l of d.licencas) r.push(...parcelasDaCompetencia(l, porLicenca.get(l.id) ?? [], d.atribuicoes, colabs, c, cambio));
  }
  return r;
}

// ---------------------------------------------------------------- Filtros e agregações do dashboard

export type MoedaExibicao = "BRL" | "USD";

export interface FiltroParcelas {
  fornecedorId?: string;
  area?: string;
  centroCusto?: string;
}

export function filtrarParcelas(p: ParcelaCusto[], f: FiltroParcelas): ParcelaCusto[] {
  return p.filter((x) => (!f.fornecedorId || x.fornecedorId === f.fornecedorId) && (!f.area || x.area === f.area) && (!f.centroCusto || x.centroCusto === f.centroCusto));
}

export function valorExibido(p: Pick<ParcelaCusto, "custoRealBRL" | "valorUSD">, moeda: MoedaExibicao): number {
  return (moeda === "BRL" ? p.custoRealBRL : p.valorUSD) ?? 0;
}

const soma = (l: ParcelaCusto[], f: (p: ParcelaCusto) => number | undefined) => l.reduce((a, p) => a + (f(p) ?? 0), 0);

export interface KpisLicencas {
  gastoUSD: number;
  gastoUSDemBRL: number;
  gastoBRL: number;
  ociosoBRL: number;
  ociosoUSD: number;
  licencasAtivas: number;
  pessoasComCusto: number;
  custoMedioPorUsuarioBRL: number;
  custoMedioPorUsuarioUSD: number;
  /** undefined = fator não configurado. Nunca somado aos totais. */
  exposicaoTributariaBRL?: number;
  /** Parcelas em USD sem câmbio configurado (custo em BRL incompleto). */
  semCambio: number;
}

export function calcularKpis(parcelas: ParcelaCusto[], licencasAtivas: number): KpisLicencas {
  const usd = parcelas.filter((p) => p.moeda === "USD");
  const pessoas = parcelas.filter((p) => p.tipo === "Pessoa");
  const n = new Set(pessoas.map((p) => p.colaboradorId)).size;
  const exposicao = parcelas.some((p) => p.impostosSimuladosBRL !== undefined) ? soma(parcelas, (p) => p.impostosSimuladosBRL) : undefined;
  return {
    gastoUSD: soma(usd, (p) => p.valorOriginal),
    gastoUSDemBRL: soma(usd, (p) => p.custoRealBRL),
    gastoBRL: soma(parcelas, (p) => p.custoRealBRL),
    ociosoBRL: soma(parcelas.filter((p) => p.tipo === "Disponível"), (p) => p.custoRealBRL),
    ociosoUSD: soma(parcelas.filter((p) => p.tipo === "Disponível"), (p) => p.valorUSD),
    licencasAtivas,
    pessoasComCusto: n,
    custoMedioPorUsuarioBRL: n ? soma(pessoas, (p) => p.custoRealBRL) / n : 0,
    custoMedioPorUsuarioUSD: n ? soma(pessoas, (p) => p.valorUSD) / n : 0,
    exposicaoTributariaBRL: exposicao,
    semCambio: parcelas.filter((p) => p.custoRealBRL === undefined).length,
  };
}

export interface PontoMensal {
  competencia: Competencia;
  usd: number;
  usdEmBRL: number;
  totalBRL: number;
}

/** Gasto mensal em USD (original) com o equivalente em BRL ao lado. */
export function serieMensal(parcelas: ParcelaCusto[], competencias: Competencia[]): PontoMensal[] {
  return competencias.map((c) => {
    const doMes = parcelas.filter((p) => p.competencia === c);
    const usd = doMes.filter((p) => p.moeda === "USD");
    return { competencia: c, usd: soma(usd, (p) => p.valorOriginal), usdEmBRL: soma(usd, (p) => p.custoRealBRL), totalBRL: soma(doMes, (p) => p.custoRealBRL) };
  });
}

export interface LinhaAgregada {
  chave: string;
  valorBRL: number;
  valorUSD: number;
  percentual: number;
  parcelas: ParcelaCusto[];
}

function agrupar(parcelas: ParcelaCusto[], chave: (p: ParcelaCusto) => string, moeda: MoedaExibicao, totalExibido: number): LinhaAgregada[] {
  const g = new Map<string, ParcelaCusto[]>();
  for (const p of parcelas) {
    const k = chave(p);
    g.set(k, [...(g.get(k) ?? []), p]);
  }
  return [...g.entries()]
    .map(([k, ps]) => {
      const valorBRL = soma(ps, (p) => p.custoRealBRL);
      const valorUSD = soma(ps, (p) => p.valorUSD);
      return { chave: k, valorBRL, valorUSD, percentual: totalExibido ? ((moeda === "BRL" ? valorBRL : valorUSD) / totalExibido) * 100 : 0, parcelas: ps };
    })
    .sort((a, b) => (moeda === "BRL" ? b.valorBRL - a.valorBRL : b.valorUSD - a.valorUSD));
}

export function porFornecedor(parcelas: ParcelaCusto[], moeda: MoedaExibicao): LinhaAgregada[] {
  return agrupar(parcelas, (p) => p.fornecedorId, moeda, soma(parcelas, (p) => valorExibido(p, moeda)));
}

/** Gasto por pessoa (só parcelas de pessoa). */
export function porColaborador(parcelas: ParcelaCusto[], moeda: MoedaExibicao): LinhaAgregada[] {
  const pessoas = parcelas.filter((p) => p.tipo === "Pessoa");
  return agrupar(pessoas, (p) => p.colaboradorId!, moeda, soma(parcelas, (p) => valorExibido(p, moeda)));
}

export type DimensaoRanking = "Usuário" | "Fornecedor" | "Área";
export type TipoBarra = "Item" | "Demais" | "Não atribuído a usuário" | "Disponível (ocioso)";

export interface BarraRanking extends LinhaAgregada {
  tipo: TipoBarra;
}

export const TOP_RANKING = 15;

/**
 * Ofensores: top 15 do maior para o menor + "Demais" + "Não atribuído a usuário" + "Disponível (ocioso)".
 * A soma das barras sempre fecha com o total do período.
 */
export function rankingOfensores(parcelas: ParcelaCusto[], dimensao: DimensaoRanking, moeda: MoedaExibicao, top = TOP_RANKING): { barras: BarraRanking[]; totalBRL: number; totalUSD: number } {
  const totalBRL = soma(parcelas, (p) => p.custoRealBRL);
  const totalUSD = soma(parcelas, (p) => p.valorUSD);
  const totalExibido = moeda === "BRL" ? totalBRL : totalUSD;
  const especiais = dimensao !== "Fornecedor";
  const base = especiais ? parcelas.filter((p) => p.tipo === "Pessoa") : parcelas;
  const chave = dimensao === "Usuário" ? (p: ParcelaCusto) => p.colaboradorId! : dimensao === "Área" ? (p: ParcelaCusto) => p.area || "Sem área" : (p: ParcelaCusto) => p.fornecedorId;
  const linhas = agrupar(base, chave, moeda, totalExibido);
  const barras: BarraRanking[] = linhas.slice(0, top).map((l) => ({ ...l, tipo: "Item" }));
  const resumir = (tipo: TipoBarra, ps: ParcelaCusto[]): BarraRanking | undefined => {
    if (!ps.length) return undefined;
    const valorBRL = soma(ps, (p) => p.custoRealBRL);
    const valorUSD = soma(ps, (p) => p.valorUSD);
    return { chave: tipo, tipo, valorBRL, valorUSD, percentual: totalExibido ? ((moeda === "BRL" ? valorBRL : valorUSD) / totalExibido) * 100 : 0, parcelas: ps };
  };
  const extras = [
    resumir("Demais", linhas.slice(top).flatMap((l) => l.parcelas)),
    especiais ? resumir("Não atribuído a usuário", parcelas.filter((p) => p.tipo === "Não atribuído")) : undefined,
    especiais ? resumir("Disponível (ocioso)", parcelas.filter((p) => p.tipo === "Disponível")) : undefined,
  ].filter((b): b is BarraRanking => Boolean(b));
  return { barras: [...barras, ...extras], totalBRL, totalUSD };
}

// ---------------------------------------------------------------- Ganhos e perdas

export interface GanhoPerda {
  movimentacao: MovimentacaoLicenca;
  /** Variação anual na moeda da licença (negativo = economia). */
  variacaoAnualOriginal: number;
  variacaoAnualBRL?: number;
}

/** Economias (redução, cancelamento, renegociação para baixo) versus aumentos (compras, reajustes). */
export function ganhosEPerdas(d: Pick<DadosCusto, "licencas" | "movimentacoes" | "cotacoes" | "parametros">, ini: ISODate, fim: ISODate): { itens: GanhoPerda[]; economiaBRL: number; aumentoBRL: number } {
  const lic = new Map(d.licencas.map((l) => [l.id, l]));
  const itens = d.movimentacoes
    .filter((m) => m.data >= ini && m.data <= fim && m.valorAnualDepois !== m.valorAnualAntes && lic.has(m.licencaId))
    .map((m) => {
      const v = m.valorAnualDepois - m.valorAnualAntes;
      const conv = converterCusto(Math.abs(v), lic.get(m.licencaId)!.moeda, cambioNaData(d.cotacoes, d.parametros, m.data));
      return { movimentacao: m, variacaoAnualOriginal: v, variacaoAnualBRL: conv && Math.sign(v) * conv.custoRealBRL };
    })
    .sort((a, b) => b.movimentacao.data.localeCompare(a.movimentacao.data));
  return {
    itens,
    economiaBRL: -itens.filter((i) => i.variacaoAnualOriginal < 0).reduce((a, i) => a + (i.variacaoAnualBRL ?? 0), 0),
    aumentoBRL: itens.filter((i) => i.variacaoAnualOriginal > 0).reduce((a, i) => a + (i.variacaoAnualBRL ?? 0), 0),
  };
}

// ---------------------------------------------------------------- Vencimentos e alertas

export const DIAS_VENCIMENTO_LICENCA = 90;

export interface VencimentoLicenca {
  licencaId: string;
  data: ISODate;
  dias: number;
  /** "contrato": usa a vigência/revisão do contrato vinculado (mesmos alertas do módulo de Contratos). */
  origem: "contrato" | "licença";
  contratoCodigo?: string;
  dataLimiteManifestacao?: ISODate;
}

export function vencimentosProximos(licencas: Licenca[], contratos: Contrato[], referencia: ISODate = hoje(), dias = DIAS_VENCIMENTO_LICENCA): VencimentoLicenca[] {
  const porId = new Map(contratos.map((c) => [c.contrato_id, c]));
  const r: VencimentoLicenca[] = [];
  for (const l of licencas.filter((x) => x.status === "Ativa")) {
    const c = l.contrato_id ? porId.get(l.contrato_id) : undefined;
    if (c && c.status === "Vigente") {
      const p = prazosDoContrato(c, referencia);
      const data = p.proximaRevisao ?? c.vigencia.dataFim;
      if (data && p.fase !== "Sem vigência") {
        const d = diffDias(referencia, data);
        if (d >= 0 && d <= dias) r.push({ licencaId: l.id, data, dias: d, origem: "contrato", contratoCodigo: c.codigo, dataLimiteManifestacao: p.dataLimiteManifestacao });
      }
    } else if (l.vencimentoTipo === "Data" && l.dataVencimento) {
      const d = diffDias(referencia, l.dataVencimento);
      if (d >= 0 && d <= dias) r.push({ licencaId: l.id, data: l.dataVencimento, dias: d, origem: "licença" });
    }
  }
  return r.sort((a, b) => a.dias - b.dias);
}

export type TipoAlertaLicenca = "Desligado com licença" | "Consumo sem limite" | "Orçamento acima de 90%" | "Sem câmbio configurado" | "Sem contrato e sem vencimento" | "Sem data de vencimento";

export interface AlertaLicenca {
  tipo: TipoAlertaLicenca;
  gravidade: "Crítico" | "Atenção";
  licencaId?: string;
  colaboradorId?: string;
  fornecedorId?: string;
  mensagem: string;
}

export const PERCENTUAL_ALERTA_ORCAMENTO = 90;

export function alertasLicencas(
  d: DadosCusto & { orcamentos: OrcamentoFornecedor[] },
  nomeFornecedor: (id: string) => string,
  referencia: ISODate = hoje(),
): AlertaLicenca[] {
  const a: AlertaLicenca[] = [];
  const ativasLic = d.licencas.filter((l) => l.status === "Ativa");
  const colabs = new Map(d.colaboradores.map((c) => [c.id, c]));
  const avisados = new Set<string>();
  for (const at of d.atribuicoes.filter((x) => x.status === "Ativa")) {
    const c = colabs.get(at.colaboradorId);
    if (c?.status === "Desligado" && !avisados.has(c.id)) {
      avisados.add(c.id);
      a.push({ tipo: "Desligado com licença", gravidade: "Crítico", colaboradorId: c.id, mensagem: `${c.nome} está desligado e ainda tem licença ativa` });
    }
  }
  for (const l of ativasLic) {
    if (l.tipoCobranca === "Consumo" && !l.limiteConsumoMensal)
      a.push({ tipo: "Consumo sem limite", gravidade: "Atenção", licencaId: l.id, mensagem: `${l.produto}: cobrança por consumo sem limite mensal definido` });
    if (l.vencimentoTipo === "Data" && !l.dataVencimento)
      a.push({ tipo: "Sem data de vencimento", gravidade: "Atenção", licencaId: l.id, mensagem: `${l.produto}${l.plano ? ` ${l.plano}` : ""}: cadastro a completar — informe a data de vencimento` });
    if (!l.contrato_id && l.vencimentoTipo === "Sob demanda")
      a.push({ tipo: "Sem contrato e sem vencimento", gravidade: "Atenção", licencaId: l.id, mensagem: `${l.produto}: sem contrato e sem data de vencimento` });
  }
  const cambio = cambioNaData(d.cotacoes, d.parametros, referencia);
  if (ativasLic.some((l) => l.moeda === "USD") && converterCusto(1, "USD", cambio) === undefined)
    a.push({ tipo: "Sem câmbio configurado", gravidade: "Crítico", mensagem: "Há licenças em USD, mas faltam cotação PTAX, spread cambial ou alíquota de IOF. O custo em BRL fica incompleto." });

  const ano = Number(referencia.slice(0, 4));
  const parcelas = parcelasDoPeriodo(d, `${ano}-01`, `${ano}-12`, referencia);
  for (const o of d.orcamentos.filter((x) => x.ano === ano && x.valorBRL > 0)) {
    const contratado = soma(parcelas.filter((p) => p.fornecedorId === o.fornecedorId), (p) => p.custoRealBRL);
    const pct = (contratado / o.valorBRL) * 100;
    if (pct >= PERCENTUAL_ALERTA_ORCAMENTO)
      a.push({ tipo: "Orçamento acima de 90%", gravidade: pct >= 100 ? "Crítico" : "Atenção", fornecedorId: o.fornecedorId, mensagem: `${nomeFornecedor(o.fornecedorId)}: contratado no ano é ${pct.toFixed(0)}% do orçamento de ${ano}` });
  }
  return a.sort((x, y) => (x.gravidade === y.gravidade ? 0 : x.gravidade === "Crítico" ? -1 : 1));
}

// ---------------------------------------------------------------- Ligação com contrato (somente leitura)

/** Aviso quando a quantidade do contrato difere da soma dos assentos das licenças vinculadas. Não altera o contrato. */
export function divergenciaComContrato(c: Pick<Contrato, "contrato_id" | "condicoes">, licencas: Licenca[], movimentacoes: MovimentacaoLicenca[], data: ISODate = hoje()): string | undefined {
  const doContrato = licencas.filter((l) => l.contrato_id === c.contrato_id && l.status === "Ativa" && l.tipoCobranca === "Assento");
  if (!doContrato.length || !c.condicoes.quantidade) return undefined;
  const soma = doContrato.reduce((a, l) => a + posicaoNaData(movimentacoes.filter((m) => m.licencaId === l.id), data).assentos, 0);
  return soma !== c.condicoes.quantidade ? `O contrato indica ${c.condicoes.quantidade} e as licenças somam ${soma} assento(s). Conferir.` : undefined;
}

// ---------------------------------------------------------------- Visibilidade (LGPD)

export type VisaoLicencas = "completa" | "area" | "agregada";

/** Gestor: só a própria área. Leitura: só totais, sem nome de pessoa. */
export function filtrarParaGestor<T extends { area?: string }>(itens: T[], area?: string): T[] {
  return area ? itens.filter((i) => i.area === area) : [];
}

/** Limite de consumo da licença no tipo de cobrança certo. */
export function rotuloTipoCobranca(t: TipoCobranca): string {
  return t === "Assento" ? "Por assento" : t === "Fixo" ? "Valor fixo" : "Por consumo";
}
