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
  // Gestor vê só as licenças das pessoas da sua área (dados pessoais — LGPD).
  Gestor: ["aprovar", "avaliar_renovacao", "gerir_documentos", "ver_licencas_da_area", "visualizar"],
  Juridico: ["emitir_parecer", "gerir_documentos", "visualizar"],
  // Solicitante (área requisitante): acompanha contratos e processos, sem editar.
  Solicitante: ["visualizar"],
  // TI administra licenças junto com Suprimentos; consulta contratos.
  TI: ["gerir_licencas", "visualizar"],
};

export function pode(perfil: Perfil, permissao: Permissao): boolean {
  return MATRIZ[perfil].includes(permissao);
}

export const ROTULO_PERFIL: Record<Perfil, string> = {
  Administrador: "Administrador",
  Suprimentos: "Suprimentos",
  Gestor: "Gestor",
  Juridico: "Jurídico/Consulta",
  Solicitante: "Solicitante",
  TI: "TI / Licenças",
};
