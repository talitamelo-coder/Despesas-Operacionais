import type { ContratosApi } from "./api";
import { mockApi } from "./mock/mockApi";
import { restApi } from "./rest/restApi";

/** Ponto único de acesso a dados. Trocar a fonte = trocar VITE_DATA_SOURCE. */
export const api: ContratosApi = import.meta.env.VITE_DATA_SOURCE === "api" ? restApi : mockApi;
export const fonteDados = import.meta.env.VITE_DATA_SOURCE === "api" ? "api" : "mock";

export * from "./api";
export { aoMudar } from "./eventos";
