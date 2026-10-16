import type { ChaveParametro } from "../types";

/**
 * Parâmetros de custo preenchidos pela controladoria (nada fixo no código).
 * Percentuais em % (ex.: 4 = 4%). Fator de impostos é multiplicador (ex.: 1,15).
 */
export const PARAMETROS: Record<ChaveParametro, { rotulo: string; descricao: string; tipo: "percentual" | "fator" | "simnao" | "dominios" }> = {
  spread_cambial: { rotulo: "Spread cambial (%)", descricao: "Acréscimo sobre a PTAX cobrado pelo banco ou cartão nas compras em dólar.", tipo: "percentual" },
  aliquota_iof_usd: { rotulo: "IOF sobre compras em USD (%)", descricao: "Aplicado só a licenças em dólar, sobre o valor convertido.", tipo: "percentual" },
  fator_impostos_simulado: { rotulo: "Fator de impostos simulado", descricao: "Multiplicador do cenário “e se fosse tributado”. Exibido à parte; nunca entra nos totais.", tipo: "fator" },
  exibir_cenario_impostos: { rotulo: "Exibir cenário com impostos", descricao: "Mostra o indicador de exposição tributária simulada no dashboard.", tipo: "simnao" },
  dominios_grupo: { rotulo: "Domínios do grupo", descricao: "E-mails nestes domínios são a mesma pessoa (ex.: nome@empresa-a.com.br = nome@empresa-b.com.br). O primeiro é o principal.", tipo: "dominios" },
};

export function erroParametro(chave: ChaveParametro, valor: string): string | undefined {
  const def = PARAMETROS[chave];
  if (!def) return "Parâmetro desconhecido.";
  const v = valor.trim();
  const n = Number(v.replace(",", "."));
  if (def.tipo === "percentual" && !(v && Number.isFinite(n) && n >= 0 && n <= 100)) return `${def.rotulo}: informe um número entre 0 e 100.`;
  if (def.tipo === "fator" && !(v && Number.isFinite(n) && n >= 1 && n <= 5)) return `${def.rotulo}: informe um multiplicador entre 1 e 5 (ex.: 1,15).`;
  if (def.tipo === "simnao" && v !== "sim" && v !== "nao") return `${def.rotulo}: use sim ou nao.`;
  if (def.tipo === "dominios" && !v.split(/[,;\s]+/).filter(Boolean).every((d) => /^@?[a-z0-9.-]+\.[a-z]{2,}$/i.test(d))) return `${def.rotulo}: informe domínios separados por vírgula.`;
  return undefined;
}
