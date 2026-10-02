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
    "visualizar",
  ],
  Suprimentos: ["editar_processo", "validar_demanda", "editar_saving", "aprovar", "gerir_documentos", "importar_planilha", "visualizar"],
  Gestor: ["aprovar", "avaliar_renovacao", "gerir_documentos", "visualizar"],
  Juridico: ["emitir_parecer", "gerir_documentos", "visualizar"],
};

export function pode(perfil: Perfil, permissao: Permissao): boolean {
  return MATRIZ[perfil].includes(permissao);
}

export const ROTULO_PERFIL: Record<Perfil, string> = {
  Administrador: "Administrador",
  Suprimentos: "Suprimentos",
  Gestor: "Gestor",
  Juridico: "Jurídico/Consulta",
};
