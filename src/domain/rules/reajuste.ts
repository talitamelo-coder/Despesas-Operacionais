import { addMeses, diffDias, hoje } from "../datas";
import type { ISODate, Reajuste, Vigencia } from "../types";

/** Datas de reajuste: data-base + N × periodicidade, dentro da vigência. */
export function datasReajuste(r: Reajuste, v: Pick<Vigencia, "dataFim">, limite = 10): ISODate[] {
  if (!r.possui || !r.dataBase || !r.periodicidadeMeses) return [];
  const datas: ISODate[] = [];
  for (let i = 1; i <= 120 && datas.length < limite; i++) {
    const d = addMeses(r.dataBase, r.periodicidadeMeses * i);
    if (diffDias(d, v.dataFim) < 0) break;
    datas.push(d);
  }
  return datas;
}

export function proximoReajuste(r: Reajuste, v: Pick<Vigencia, "dataFim">, referencia: ISODate = hoje()): ISODate | undefined {
  return datasReajuste(r, v, 120).find((d) => diffDias(referencia, d) >= 0);
}

export function valorReajustado(valor: number, r: Reajuste): number {
  if (!r.possui || !r.percentualPrevisto) return valor;
  return valor * (1 + r.percentualPrevisto / 100);
}
