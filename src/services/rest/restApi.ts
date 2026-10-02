import type { ContratosApi } from "../api";
import { notificarMudanca } from "../eventos";

/**
 * Implementação REST — ESBOÇO para a fase de integração (Backend Python + MySQL).
 * Mapeia cada método do contrato para um endpoint (ver docs/api-contrato.md).
 * Ativada com VITE_DATA_SOURCE=api.
 *
 * SEGURANÇA: o cabeçalho X-Usuario-Id é apenas um marcador de desenvolvimento. Em produção a
 * identidade e o perfil DEVEM vir da sessão/SSO da Akross Atende e ser validados no backend —
 * nenhuma regra de permissão pode confiar no que o navegador envia.
 */

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

async function http<T>(metodo: string, caminho: string, corpo?: unknown, porId?: string): Promise<T> {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(porId ? { "X-Usuario-Id": porId } : {}) },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    credentials: "include",
  });
  if (!r.ok) throw new Error(`${metodo} ${caminho}: HTTP ${r.status}`);
  if (metodo !== "GET") notificarMudanca();
  return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
}

const q = (o: object) => {
  const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();
  return s ? `?${s}` : "";
};

export const restApi: ContratosApi = {
  listarUsuarios: () => http("GET", "/usuarios"),
  salvarUsuario: (u, porId) => http("PUT", `/usuarios/${u.id || "novo"}`, u, porId),
  listarEmpresas: () => http("GET", "/empresas"),
  salvarEmpresa: (e, porId) => http("PUT", `/empresas/${e.id || "novo"}`, e, porId),
  listarFornecedores: () => http("GET", "/fornecedores"),
  criarFornecedorPotencial: (nome, porId) => http("POST", "/fornecedores/potenciais", { nome }, porId),
  listarTiposContrato: () => http("GET", "/tipos-contrato"),
  salvarTipoContrato: (t, porId) => http("PUT", `/tipos-contrato/${t.id || "novo"}`, t, porId),
  obterConfiguracao: () => http("GET", "/configuracao"),
  salvarConfiguracao: (c, porId) => http("PUT", "/configuracao", c, porId),

  consultarCentral: (filtros, ordenacao, pagina, tamanhoPagina) =>
    http("GET", `/central${q({ ...filtros, ordenarPor: ordenacao.coluna, direcao: ordenacao.direcao, pagina, tamanhoPagina })}`),
  listarContratos: () => http("GET", "/contratos"),
  obterContrato: (id) => http("GET", `/contratos/${id}`),
  atualizarContrato: (id, patch, porId) => http("PATCH", `/contratos/${id}`, patch, porId),
  registrarAvaliacaoRenovacao: (id, a, porId) => http("POST", `/contratos/${id}/avaliacao-renovacao`, a, porId),
  encerrarContrato: (id, status, motivo, porId) => http("POST", `/contratos/${id}/status`, { status, motivo }, porId),
  importarContratos: (registros, porId) => http("POST", "/importacoes/contratos", { registros }, porId),

  listarProcessos: () => http("GET", "/processos"),
  obterProcesso: (id) => http("GET", `/processos/${id}`),
  criarProcesso: (tipo, dados, porId) => http("POST", "/processos", { ...dados, tipo }, porId),
  atualizarProcesso: (id, patch, porId) => http("PATCH", `/processos/${id}`, patch, porId),
  validarDemanda: (id, v, porId) => http("POST", `/processos/${id}/validacao`, v, porId),
  avancarProcesso: (id, porId) => http("POST", `/processos/${id}/avancar`, {}, porId),
  registrarAprovacao: (id, papel, status, comentario, porId) => http("POST", `/processos/${id}/aprovacoes`, { papel, status, comentario }, porId),
  registrarParecer: (id, status, parecer, porId) => http("POST", `/processos/${id}/parecer`, { status, parecer }, porId),
  suspenderProcesso: (id, motivo, porId) => http("POST", `/processos/${id}/suspender`, { motivo }, porId),
  retomarProcesso: (id, porId) => http("POST", `/processos/${id}/retomar`, {}, porId),
  cancelarProcesso: (id, motivo, porId) => http("POST", `/processos/${id}/cancelar`, { motivo }, porId),
  excluirRascunho: (id, porId) => http("DELETE", `/processos/${id}`, undefined, porId),

  listarDocumentos: (f) => http("GET", `/documentos${q(f ?? {})}`),
  adicionarDocumento: (d, porId) => http("POST", "/documentos", d, porId),

  listarAcoes: () => http("GET", "/acoes"),
  listarAlertas: (contrato_id) => http("GET", `/alertas${q({ contrato_id })}`),
  obterIndicadores: () => http("GET", "/dashboard/indicadores"),
  listarAuditoria: (entidadeId) => http("GET", `/auditoria${q({ entidadeId })}`),

  buscarDemandaJira: (jira_key) => http("GET", `/integracoes/jira/demandas/${encodeURIComponent(jira_key)}`),
  restaurarDadosDemonstracao: async () => {
    throw new Error("Indisponível com a API real.");
  },
};
