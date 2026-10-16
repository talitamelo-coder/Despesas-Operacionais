import { gerarCsv } from "@/domain/rules/csv";
import { api } from "@/services";
import { salvarArquivo } from "./arquivos";

/** Exporta CSV (padrão Excel pt-BR) e registra a exportação na auditoria (LGPD). */
export async function exportarCsv(nome: string, cabecalho: string[], linhas: (string | number | undefined)[][], porId: string): Promise<void> {
  const r = await salvarArquivo(nome, gerarCsv(cabecalho, linhas));
  if (r === "salvo") await api.registrarExportacao(`${nome} (${linhas.length} linhas)`, porId);
}
