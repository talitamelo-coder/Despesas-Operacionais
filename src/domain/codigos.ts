/** Geração de códigos legíveis: PC-2027-0015 (processo), CT-2027-0041 (contrato). */
export type PrefixoCodigo = "PC" | "CT";

export function gerarCodigo(prefixo: PrefixoCodigo, ano: number, sequencial: number): string {
  return `${prefixo}-${ano}-${String(sequencial).padStart(4, "0")}`;
}

/** Próximo sequencial do ano, considerando os códigos já existentes. */
export function proximoSequencial(codigosExistentes: string[], prefixo: PrefixoCodigo, ano: number): number {
  const re = new RegExp(`^${prefixo}-${ano}-(\\d+)$`);
  let max = 0;
  for (const c of codigosExistentes) {
    const m = re.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}
