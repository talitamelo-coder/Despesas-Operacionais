import type { RegistroAuditoria } from "../types";

/** Campos técnicos que não geram trilha de auditoria. */
const IGNORAR = new Set(["atualizadoEm", "timeline", "origens"]);

function achatar(obj: unknown, prefixo = "", saida: Record<string, string> = {}): Record<string, string> {
  if (obj === null || obj === undefined) return saida;
  if (Array.isArray(obj) || typeof obj !== "object") {
    saida[prefixo] = typeof obj === "object" ? JSON.stringify(obj) : String(obj);
    return saida;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!prefixo && IGNORAR.has(k)) continue;
    achatar(v, prefixo ? `${prefixo}.${k}` : k, saida);
  }
  return saida;
}

/** Gera um registro por campo alterado (valor anterior → valor novo). */
export function diffAuditoria(
  antes: object,
  depois: object,
  base: Omit<RegistroAuditoria, "id" | "campo" | "valorAnterior" | "valorNovo">,
  gerarId: () => string,
): RegistroAuditoria[] {
  const a = achatar(antes);
  const d = achatar(depois);
  const campos = new Set([...Object.keys(a), ...Object.keys(d)]);
  const registros: RegistroAuditoria[] = [];
  for (const campo of [...campos].sort()) {
    if (a[campo] !== d[campo]) {
      registros.push({ ...base, id: gerarId(), campo, valorAnterior: a[campo], valorNovo: d[campo] });
    }
  }
  return registros;
}
