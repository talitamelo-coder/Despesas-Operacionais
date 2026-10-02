import { lazy, Suspense, type ComponentType } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Carregando } from "@/components/ui/Diversos";
import { ProvedorApp } from "./contexto";

// Carregamento sob demanda por tela: reduz o bundle inicial.
const tela = <K extends string>(carregar: () => Promise<Record<K, ComponentType>>, nome: K) => lazy(() => carregar().then((m) => ({ default: m[nome] })));

const Dashboard = tela(() => import("@/pages/dashboard/Dashboard"), "Dashboard");
const CentralContratos = tela(() => import("@/pages/central/CentralContratos"), "CentralContratos");
const NovoProcesso = tela(() => import("@/pages/processos/NovoProcesso"), "NovoProcesso");
const ProcessoDetalhe = tela(() => import("@/pages/processos/ProcessoDetalhe"), "ProcessoDetalhe");
const CapaContrato = tela(() => import("@/pages/contratos/CapaContrato"), "CapaContrato");
const AvaliacaoRenovacao = tela(() => import("@/pages/contratos/AvaliacaoRenovacao"), "AvaliacaoRenovacao");
const Documentos = tela(() => import("@/pages/documentos/Documentos"), "Documentos");
const AcoesNecessarias = tela(() => import("@/pages/acoes/AcoesNecessarias"), "AcoesNecessarias");
const Administracao = tela(() => import("@/pages/admin/Administracao"), "Administracao");
const NaoEncontrado = tela(() => import("@/pages/NaoEncontrado"), "NaoEncontrado");

/** Rotas do módulo. Prefixáveis (ex.: /contratos/*) na incorporação à Akross Atende. */
export function App() {
  return (
    <BrowserRouter>
      <ProvedorApp>
        <Suspense fallback={<Carregando />}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="contratos" element={<CentralContratos />} />
              <Route path="contratos/:id" element={<CapaContrato />} />
              <Route path="contratos/:id/avaliacao" element={<AvaliacaoRenovacao />} />
              <Route path="processos/novo" element={<NovoProcesso />} />
              <Route path="processos/:id" element={<ProcessoDetalhe />} />
              <Route path="acoes" element={<AcoesNecessarias />} />
              <Route path="documentos" element={<Documentos />} />
              <Route path="admin" element={<Administracao />} />
              <Route path="*" element={<NaoEncontrado />} />
            </Route>
          </Routes>
        </Suspense>
      </ProvedorApp>
    </BrowserRouter>
  );
}
