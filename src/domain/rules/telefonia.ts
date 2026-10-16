import type { Colaborador, LinhaTelefonica, UsoLinha } from "../types";

/**
 * Telefonia — separada das licenças de software. Valor mensal contratado em BRL, sem câmbio e
 * sem IOF. Uma linha tem no máximo um usuário por vez; o histórico de uso nunca é apagado.
 */

export function somenteDigitosLinha(numero: string): string {
  return numero.replace(/\D/g, "");
}

export function formatarLinha(numero: string): string {
  const d = somenteDigitosLinha(numero);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return numero;
}

export function errosLinha(l: Partial<LinhaTelefonica>, existentes: LinhaTelefonica[]): string[] {
  const e: string[] = [];
  const d = somenteDigitosLinha(l.numero ?? "");
  if (d.length < 10 || d.length > 11) e.push("Informe o número com DDD (10 ou 11 dígitos).");
  else if (existentes.some((x) => x.id !== l.id && x.numero === d)) e.push("Esta linha já está cadastrada.");
  if (!l.operadora?.trim()) e.push("Informe a operadora.");
  if (!(l.valorMensal !== undefined && l.valorMensal >= 0)) e.push("Informe o valor mensal.");
  return e;
}

/** Linhas que ainda geram custo contratado. */
export function linhaCobrada(l: Pick<LinhaTelefonica, "situacao">): boolean {
  return l.situacao === "Ativa" || l.situacao === "Suspensa";
}

export function usoAtivo(linhaId: string, usos: UsoLinha[]): UsoLinha | undefined {
  return usos.find((u) => u.linhaId === linhaId && u.status === "Ativa");
}

export function erroUsoLinha(l: LinhaTelefonica, usos: UsoLinha[], c: Colaborador): string | undefined {
  if (!linhaCobrada(l)) return `Linha ${l.situacao.toLowerCase()} não pode ser atribuída.`;
  if (c.status === "Desligado") return "Colaborador desligado não recebe linha.";
  const atual = usoAtivo(l.id, usos);
  if (atual) return atual.colaboradorId === c.id ? "Esta pessoa já usa esta linha." : "A linha já tem usuário. Encerre o uso atual antes de transferir.";
  return undefined;
}

export interface ResumoTelefonia {
  linhasAtivas: number;
  custoMensal: number;
  custoAnual: number;
  semUsuario: number;
  custoSemUsuarioMensal: number;
  porOperadora: { chave: string; valor: number; linhas: number; percentual: number }[];
  porPessoa: { colaboradorId: string; valor: number; linhas: number }[];
  porArea: { chave: string; valor: number; linhas: number; percentual: number }[];
}

export function resumoTelefonia(linhas: LinhaTelefonica[], usos: UsoLinha[], colaboradores: Colaborador[]): ResumoTelefonia {
  const cobradas = linhas.filter(linhaCobrada);
  const colabs = new Map(colaboradores.map((c) => [c.id, c]));
  const custoMensal = cobradas.reduce((a, l) => a + l.valorMensal, 0);
  const pct = (v: number) => (custoMensal ? (v / custoMensal) * 100 : 0);
  const agrupar = (chave: (l: LinhaTelefonica) => string) => {
    const g = new Map<string, { valor: number; linhas: number }>();
    for (const l of cobradas) {
      const k = chave(l);
      const atual = g.get(k) ?? { valor: 0, linhas: 0 };
      g.set(k, { valor: atual.valor + l.valorMensal, linhas: atual.linhas + 1 });
    }
    return [...g.entries()].map(([k, v]) => ({ chave: k, ...v, percentual: pct(v.valor) })).sort((a, b) => b.valor - a.valor);
  };
  const usuario = (l: LinhaTelefonica) => usoAtivo(l.id, usos)?.colaboradorId;
  const pessoas = new Map<string, { valor: number; linhas: number }>();
  for (const l of cobradas) {
    const u = usuario(l);
    if (!u) continue;
    const atual = pessoas.get(u) ?? { valor: 0, linhas: 0 };
    pessoas.set(u, { valor: atual.valor + l.valorMensal, linhas: atual.linhas + 1 });
  }
  const sem = cobradas.filter((l) => !usuario(l));
  return {
    linhasAtivas: cobradas.length,
    custoMensal,
    custoAnual: custoMensal * 12,
    semUsuario: sem.length,
    custoSemUsuarioMensal: sem.reduce((a, l) => a + l.valorMensal, 0),
    porOperadora: agrupar((l) => l.operadora),
    porPessoa: [...pessoas.entries()].map(([colaboradorId, v]) => ({ colaboradorId, ...v })).sort((a, b) => b.valor - a.valor),
    porArea: agrupar((l) => {
      const u = usuario(l);
      return (u && colabs.get(u)?.area) || l.area || "Sem área";
    }),
  };
}

export interface AlertaTelefonia {
  tipo: "Desligado com linha" | "Linha sem usuário";
  gravidade: "Crítico" | "Atenção";
  linhaId: string;
  mensagem: string;
}

export function alertasTelefonia(linhas: LinhaTelefonica[], usos: UsoLinha[], colaboradores: Colaborador[]): AlertaTelefonia[] {
  const colabs = new Map(colaboradores.map((c) => [c.id, c]));
  const r: AlertaTelefonia[] = [];
  for (const l of linhas.filter(linhaCobrada)) {
    const u = usoAtivo(l.id, usos);
    const c = u && colabs.get(u.colaboradorId);
    if (c?.status === "Desligado") r.push({ tipo: "Desligado com linha", gravidade: "Crítico", linhaId: l.id, mensagem: `${formatarLinha(l.numero)}: ${c.nome} está desligado e a linha segue ativa` });
    else if (!u) r.push({ tipo: "Linha sem usuário", gravidade: "Atenção", linhaId: l.id, mensagem: `${formatarLinha(l.numero)} (${l.operadora}) está ${l.situacao.toLowerCase()} e sem usuário` });
  }
  return r.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === "Crítico" ? -1 : 1));
}
