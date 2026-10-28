import { useMemo } from "react";
import { useApp } from "@/app/contexto";
import { contraparteDaAcao } from "@/domain/rules/acoes";
import type { AcaoNecessaria } from "@/domain/types";
import { api } from "@/services";
import { useConsulta } from "./useConsulta";

/** Nome curto do fornecedor (ou cliente) de cada ação: nome fantasia, ou razão social. */
export function useContraparteAcao(): (ref: AcaoNecessaria["referencia"]) => string {
  const { fornecedor, cliente } = useApp();
  const { dados: contratos } = useConsulta(() => api.listarContratos(), []);
  const { dados: processos } = useConsulta(() => api.listarProcessos(), []);
  return useMemo(() => {
    const nome = {
      fornecedor: (id: string) => { const f = fornecedor(id); return f ? f.nomeFantasia || f.razaoSocial : undefined; },
      cliente: (id: string) => { const c = cliente(id); return c ? c.nomeFantasia || c.razaoSocial : undefined; },
    };
    return (ref) => (contratos && processos ? contraparteDaAcao(ref, contratos, processos, nome) : "…");
  }, [contratos, processos, fornecedor, cliente]);
}
