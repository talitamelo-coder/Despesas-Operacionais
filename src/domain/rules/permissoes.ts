import type { Perfil } from "../types";

export type Permissao =
  | "administrar"
  | "editar_processo"
  | "validar_demanda"
  | "editar_saving"
  | "aprovar"
  | "avaliar_renovacao"
  | "emitir_parecer"
  | "gerir_documentos"
  | "importar_planilha"
  | "gerir_licencas"
  | "ver_licencas_da_area"
  | "ver_licencas_agregado"
  | "visualizar";

const MATRIZ: Record<Perfil, Permissao[]> = {
  Administrador: [
    "administrar",
    "editar_processo",
    "validar_demanda",
    "editar_saving",
    "aprovar",
    "avaliar_renovacao",
    "emitir_parecer",
    "gerir_documentos",
    "importar_planilha",
    "gerir_licencas",
    "visualizar",
  ],
  Suprimentos: ["editar_processo", "validar_demanda", "editar_saving", "aprovar", "gerir_documentos", "importar_planilha", "gerir_licencas", "visualizar"],
  // Gestor vê só as licenças e linhas da sua área (custo por pessoa é dado pessoal — LGPD).
  Gestor: ["aprovar", "avaliar_renovacao", "gerir_documentos", "ver_licencas_da_area", "visualizar"],
  Juridico: ["emitir_parecer", "gerir_documentos", "visualizar"],
  // Solicitante (área requisitante): acompanha contratos e processos, sem editar.
  Solicitante: ["visualizar"],
  // Leitura: só totais de licenças e telefonia, sem nome de pessoa.
  Leitura: ["ver_licencas_agregado", "visualizar"],
};

export function pode(perfil: Perfil, permissao: Permissao): boolean {
  return MATRIZ[perfil]?.includes(permissao) ?? false;
}

/** Ordem de precedência: o perfil mais amplo marcado vira o principal (exibido nas listas). */
const PRECEDENCIA: Perfil[] = ["Administrador", "Suprimentos", "Gestor", "Juridico", "Leitura", "Solicitante"];

/** Converte a lista de perfis marcados em perfil principal + adicionais. */
export function comPerfis(perfis: Perfil[]): { perfil: Perfil; perfisAdicionais?: Perfil[] } {
  const ordenados = PRECEDENCIA.filter((p) => perfis.includes(p));
  const [perfil = "Solicitante", ...resto] = ordenados;
  return { perfil, perfisAdicionais: resto.length ? resto : undefined };
}

/** Todos os perfis do usuário (principal + adicionais), sem repetição. */
export function perfisDo(u: { perfil: Perfil; perfisAdicionais?: Perfil[] }): Perfil[] {
  return [...new Set([u.perfil, ...(u.perfisAdicionais ?? [])])];
}

export function temPerfil(u: { perfil: Perfil; perfisAdicionais?: Perfil[] }, perfil: Perfil): boolean {
  return perfisDo(u).includes(perfil);
}

/** Permissão do usuário = soma das permissões de todos os seus perfis. */
export function usuarioPode(u: { perfil: Perfil; perfisAdicionais?: Perfil[] }, permissao: Permissao): boolean {
  return perfisDo(u).some((p) => pode(p, permissao));
}

export const ROTULO_PERFIL: Record<Perfil, string> = {
  Administrador: "Administrador",
  Suprimentos: "Suprimentos",
  Gestor: "Gestor",
  Juridico: "Jurídico/Consulta",
  Solicitante: "Solicitante",
  Leitura: "Leitura (totais)",
};
