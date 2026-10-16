import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "@/app/contexto";
import { Aviso, Carregando } from "@/components/ui/Diversos";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import type { Colaborador, Contrato, Licenca } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api, type DadosLicencas } from "@/services";
import { CadastroLicencas } from "./Cadastro";
import { Configuracao } from "./Configuracao";
import { DashboardLicencas } from "./Dashboard";
import { ImportacaoCsv } from "./Importacao";
import { Pessoas } from "./Pessoas";

const ABAS = [
  { id: "dashboard", rotulo: "Dashboard" },
  { id: "licencas", rotulo: "Licenças" },
  { id: "pessoas", rotulo: "Pessoas" },
  { id: "importar", rotulo: "Importar CSV" },
  { id: "configuracao", rotulo: "Câmbio e parâmetros" },
] as const;
export type AbaLicencas = (typeof ABAS)[number]["id"];

export interface ContextoLicencas {
  dados: DadosLicencas;
  contratos: Contrato[];
  podeGerir: boolean;
  /** Gestor: área fixa nos filtros e listas. */
  areaFixa?: string;
  /** Leitura: só totais, sem pessoas. */
  agregada: boolean;
  nomeColaborador: (id?: string) => string;
  colaborador: (id?: string) => Colaborador | undefined;
  nomeFornecedor: (id?: string) => string;
  licenca: (id?: string) => Licenca | undefined;
  contrato: (id?: string) => Contrato | undefined;
  irPara: (aba: AbaLicencas, item?: string) => void;
  item?: string;
}

export function useContextoBase(dados: DadosLicencas | undefined, contratos: Contrato[] | undefined) {
  const { fornecedor } = useApp();
  return useMemo(() => {
    const colabs = new Map((dados?.colaboradores ?? []).map((c) => [c.id, c]));
    const lics = new Map((dados?.licencas ?? []).map((l) => [l.id, l]));
    const cts = new Map((contratos ?? []).map((c) => [c.contrato_id, c]));
    return {
      colaborador: (id?: string) => (id ? colabs.get(id) : undefined),
      nomeColaborador: (id?: string) => (id && colabs.get(id)?.nome) || "Pessoa (sem acesso ao nome)",
      nomeFornecedor: (id?: string) => (id && (fornecedor(id)?.nomeFantasia || fornecedor(id)?.razaoSocial)) || "—",
      licenca: (id?: string) => (id ? lics.get(id) : undefined),
      contrato: (id?: string) => (id ? cts.get(id) : undefined),
    };
  }, [dados, contratos, fornecedor]);
}

/**
 * Licenças de software: o contratado (assentos, preço, câmbio) e quem usa. Referencia contratos
 * pelo vínculo, sem alterá-los. O real pago é conferido em Pedidos/Contas a pagar.
 */
export function Licencas() {
  const { pode, usuario } = useApp();
  const [params, setParams] = useSearchParams();
  const podeGerir = pode("gerir_licencas");
  const podeArea = pode("ver_licencas_da_area");
  const podeAgregado = pode("ver_licencas_agregado");
  const { dados, carregando } = useConsulta(() => api.listarLicencas(usuario.id), [usuario.id]);
  const { dados: contratos } = useConsulta(() => api.listarContratos(), []);
  const base = useContextoBase(dados, contratos);

  if (!podeGerir && !podeArea && !podeAgregado)
    return <Aviso tom="alerta" titulo="Acesso restrito">Licenças são acessadas por Suprimentos e Administrador, por gestores (só a própria área) e pelo perfil Leitura (só totais).</Aviso>;
  if (carregando && !dados) return <Carregando />;
  if (!dados) return null;

  const agregada = dados.visao === "agregada";
  const abas = ABAS.filter((a) => podeGerir || a.id === "dashboard" || (!agregada && (a.id === "licencas" || a.id === "pessoas")));
  const pedida = params.get("aba") as AbaLicencas;
  const aba = abas.some((a) => a.id === pedida) ? pedida : "dashboard";
  const ctx: ContextoLicencas = {
    dados,
    contratos: contratos ?? [],
    podeGerir,
    areaFixa: dados.visao === "area" ? usuario.area ?? "—" : undefined,
    agregada,
    ...base,
    irPara: (a, item) => setParams(item ? { aba: a, item } : { aba: a }),
    item: params.get("item") ?? undefined,
  };

  return (
    <>
      <PageHeader
        titulo="Licenças de Software"
        descricao={
          agregada
            ? "Totais do contratado em licenças (sem dados de pessoas)."
            : ctx.areaFixa
              ? `Licenças e custos da sua área (${ctx.areaFixa}).`
              : "O contratado em licenças: assentos, preço, câmbio e quem usa. Contratos não são alterados aqui; o real pago fica em Contas a pagar."
        }
      />
      {ctx.areaFixa === "—" && <div className="mb-4"><Aviso tom="alerta">Seu usuário não tem área cadastrada; peça ao Administrador para preencher em Usuários e perfis.</Aviso></div>}
      <Tabs className="mb-4" abas={[...abas]} ativa={aba} onChange={(a) => setParams({ aba: a })} />
      {aba === "dashboard" && <DashboardLicencas ctx={ctx} />}
      {aba === "licencas" && <CadastroLicencas ctx={ctx} />}
      {aba === "pessoas" && <Pessoas ctx={ctx} />}
      {aba === "importar" && <ImportacaoCsv tipos={["licencas", "atribuicoes", "movimentacoes"]} />}
      {aba === "configuracao" && <Configuracao ctx={ctx} />}
    </>
  );
}
