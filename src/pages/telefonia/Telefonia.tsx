import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Download, Pencil, Phone, Plus, UserPlus, Wallet } from "lucide-react";
import { useApp } from "@/app/contexto";
import { exportarCsv } from "@/app/exportar";
import { Badge, type Tom } from "@/components/ui/Badge";
import { BarrasRanking } from "@/components/ui/BarrasRanking";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { GradeValores, Input, InputNumero, Select, Textarea, Valor } from "@/components/ui/Campos";
import { Aviso, Carregando, Kpi } from "@/components/ui/Diversos";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabela } from "@/components/ui/Tabela";
import { Tabs } from "@/components/ui/Tabs";
import { formatarData, hoje } from "@/domain/datas";
import { formatarMoeda, formatarNumero, formatarPercentual } from "@/domain/formatacao";
import { alertasTelefonia, erroUsoLinha, errosLinha, formatarLinha, linhaCobrada, resumoTelefonia, usoAtivo } from "@/domain/rules/telefonia";
import { AREAS_PADRAO } from "@/domain/rules/usuario";
import type { LinhaTelefonica, SituacaoLinha } from "@/domain/types";
import { useConsulta } from "@/hooks/useConsulta";
import { api, type DadosLicencas } from "@/services";
import { ImportacaoCsv } from "../licencas/Importacao";
import { useContextoBase } from "../licencas/Licencas";

const ABAS = [
  { id: "dashboard", rotulo: "Dashboard" },
  { id: "linhas", rotulo: "Linhas" },
  { id: "importar", rotulo: "Importar CSV" },
] as const;
type Aba = (typeof ABAS)[number]["id"];
const TOM_SITUACAO: Record<SituacaoLinha, Tom> = { Ativa: "sucesso", Suspensa: "alerta", Cancelada: "neutro", Portada: "neutro" };

/** Linhas telefônicas: separado das licenças de software. Valor mensal em BRL, sem câmbio e sem IOF. */
export function Telefonia() {
  const { pode, usuario } = useApp();
  const [params, setParams] = useSearchParams();
  const podeGerir = pode("gerir_licencas");
  const temAcesso = podeGerir || pode("ver_licencas_da_area") || pode("ver_licencas_agregado");
  const { dados, carregando } = useConsulta(() => (temAcesso ? api.listarLicencas(usuario.id) : Promise.resolve(undefined)), [usuario.id, temAcesso]);
  const { dados: contratos } = useConsulta(() => api.listarContratos(), []);
  const base = useContextoBase(dados, contratos);

  // Gestor: linhas da sua área (pelo usuário atual ou pela área da linha).
  const linhas = useMemo(() => {
    if (!dados) return [];
    if (dados.visao !== "area") return dados.linhas;
    return dados.linhas.filter((l) => {
      const u = usoAtivo(l.id, dados.usosLinha);
      const area = (u && base.colaborador(u.colaboradorId)?.area) || l.area;
      return area === usuario.area;
    });
  }, [dados, base, usuario.area]);

  if (!temAcesso) return <Aviso tom="alerta" titulo="Acesso restrito">Telefonia é acessada por Suprimentos e Administrador, por gestores (só a própria área) e pelo perfil Leitura (só totais).</Aviso>;
  if (carregando && !dados) return <Carregando />;
  if (!dados) return null;
  const agregada = dados.visao === "agregada";
  const abas = ABAS.filter((a) => podeGerir || a.id !== "importar");
  const pedida = params.get("aba") as Aba;
  const aba = abas.some((a) => a.id === pedida) ? pedida : "dashboard";
  const irPara = (a: Aba, item?: string) => setParams(item ? { aba: a, item } : { aba: a });

  return (
    <>
      <PageHeader titulo="Telefonia" descricao={dados.visao === "area" ? `Linhas da sua área (${usuario.area ?? "—"}).` : "Linhas telefônicas contratadas e quem usa. Separado das licenças de software; o real pago fica em Contas a pagar."} />
      <Tabs className="mb-4" abas={[...abas]} ativa={aba} onChange={(a) => setParams({ aba: a })} />
      {aba === "dashboard" && <DashboardTelefonia dados={dados} linhas={linhas} agregada={agregada} nome={base.nomeColaborador} irPara={irPara} />}
      {aba === "linhas" && <Linhas dados={dados} linhas={linhas} podeGerir={podeGerir} agregada={agregada} base={base} item={params.get("item") ?? undefined} irPara={irPara} contratos={contratos ?? []} />}
      {aba === "importar" && <ImportacaoCsv tipos={["linhas"]} />}
    </>
  );
}

function DashboardTelefonia({ dados, linhas, agregada, nome, irPara }: { dados: DadosLicencas; linhas: LinhaTelefonica[]; agregada: boolean; nome: (id?: string) => string; irPara: (a: Aba, item?: string) => void }) {
  const { usuario } = useApp();
  const [dim, setDim] = useState<"Pessoa" | "Área" | "Operadora">(agregada ? "Operadora" : "Pessoa");
  const r = resumoTelefonia(linhas, dados.usosLinha, dados.colaboradores);
  const alertas = agregada ? [] : alertasTelefonia(linhas, dados.usosLinha, dados.colaboradores);
  if (!dados.linhas.length)
    return (
      <Card>
        <CardHeader titulo="Comece por aqui" subtitulo="Nenhuma linha cadastrada." />
        <CardBody className="text-sm text-texto-suave">Cadastre as linhas em “Linhas” (número com DDD, operadora, plano e valor mensal) ou importe o CSV com o modelo. Depois entregue cada linha a uma pessoa: uma linha tem um usuário por vez, e o histórico fica guardado.</CardBody>
      </Card>
    );
  const pct = (v: number) => (r.custoMensal ? (v / r.custoMensal) * 100 : 0);
  const top = 15;
  const pessoas = r.porPessoa.map((p) => ({ chave: p.colaboradorId, rotulo: nome(p.colaboradorId), valor: p.valor, legenda: `${formatarMoeda(p.valor)}/mês · ${p.linhas} linha(s) · ${formatarPercentual(pct(p.valor))}` }));
  const demais = pessoas.slice(top).reduce((a, p) => a + p.valor, 0);
  const itens =
    dim === "Operadora"
      ? r.porOperadora.map((o) => ({ chave: o.chave, rotulo: o.chave, valor: o.valor, legenda: `${formatarMoeda(o.valor)}/mês · ${o.linhas} linha(s) · ${formatarPercentual(o.percentual)}` }))
      : dim === "Área"
        ? r.porArea.map((o) => ({ chave: o.chave, rotulo: o.chave, valor: o.valor, legenda: `${formatarMoeda(o.valor)}/mês · ${o.linhas} linha(s) · ${formatarPercentual(o.percentual)}` }))
        : [
            ...pessoas.slice(0, top),
            ...(demais ? [{ chave: "Demais", rotulo: "Demais", valor: demais, legenda: `${formatarMoeda(demais)}/mês · ${formatarPercentual(pct(demais))}`, resumo: true }] : []),
            ...(r.custoSemUsuarioMensal ? [{ chave: "Sem usuário", rotulo: "Sem usuário", valor: r.custoSemUsuarioMensal, legenda: `${formatarMoeda(r.custoSemUsuarioMensal)}/mês · ${r.semUsuario} linha(s) · ${formatarPercentual(pct(r.custoSemUsuarioMensal))}`, resumo: true }] : []),
          ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rotulo="Linhas ativas" valor={formatarNumero(r.linhasAtivas)} detalhe="Ativas e suspensas (ainda cobradas)" icone={<Phone size={18} />} />
        <Kpi rotulo="Custo mensal contratado" valor={formatarMoeda(r.custoMensal)} detalhe="Soma do valor mensal das linhas" icone={<Wallet size={18} />} />
        <Kpi rotulo="Custo anual" valor={formatarMoeda(r.custoAnual, "BRL", true)} detalhe="Mensal × 12" icone={<Wallet size={18} />} />
        <Kpi rotulo="Linhas sem usuário" valor={formatarNumero(r.semUsuario)} detalhe={`${formatarMoeda(r.custoSemUsuarioMensal)}/mês sem ninguém usando`} icone={<AlertTriangle size={18} />} tom={r.semUsuario ? "alerta" : "neutro"} />
      </div>
      <Card>
        <CardHeader
          titulo="Maiores custos"
          subtitulo={`Do maior para o menor. As barras somam ${formatarMoeda(r.custoMensal)}/mês.`}
          acoes={
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-borda-forte p-0.5" role="radiogroup" aria-label="Agrupar por">
                {(["Pessoa", "Área", "Operadora"] as const).filter((d) => !(agregada && d === "Pessoa")).map((d) => (
                  <button key={d} role="radio" aria-checked={dim === d} onClick={() => setDim(d)} className={`h-7 rounded px-3 text-xs font-medium ${dim === d ? "bg-primaria-800 text-white" : "text-texto-suave hover:bg-fundo"}`}>{d}</button>
                ))}
              </div>
              <Button variante="fantasma" tamanho="sm" icone={<Download size={14} />} onClick={() => exportarCsv(`telefonia-por-${dim.toLowerCase()}.csv`, [dim.toLowerCase(), "valor_mensal_brl", "percentual"], itens.map((i) => [i.rotulo, i.valor, pct(i.valor)]), usuario.id)}>CSV</Button>
            </div>
          }
        />
        <CardBody><BarrasRanking itens={itens} /></CardBody>
      </Card>
      {alertas.length > 0 && (
        <Card>
          <CardHeader titulo={`Alertas (${alertas.length})`} icone={<AlertTriangle size={16} />} />
          <ul className="divide-y divide-borda">
            {alertas.map((a) => (
              <li key={a.linhaId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Badge tom={a.gravidade === "Crítico" ? "critico" : "alerta"}>{a.tipo}</Badge>
                <button className="hover:underline" onClick={() => irPara("linhas", a.linhaId)}>{a.mensagem}</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

type Base = ReturnType<typeof useContextoBase>;

function novaLinha(): LinhaTelefonica {
  return { id: "", numero: "", operadora: "", valorMensal: 0, situacao: "Ativa", criadoEm: "", atualizadoEm: "" };
}

function Linhas({ dados, linhas, podeGerir, agregada, base, item, irPara, contratos }: { dados: DadosLicencas; linhas: LinhaTelefonica[]; podeGerir: boolean; agregada: boolean; base: Base; item?: string; irPara: (a: Aba, item?: string) => void; contratos: { contrato_id: string; codigo: string; objeto: string; status: string }[] }) {
  const { usuario, executar } = useApp();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("");
  const [editar, setEditar] = useState<LinhaTelefonica>();
  const [entregar, setEntregar] = useState<LinhaTelefonica>();
  const sel = item ? linhas.find((l) => l.id === item) : undefined;

  if (sel) {
    const uso = usoAtivo(sel.id, dados.usosLinha);
    const historico = dados.usosLinha.filter((u) => u.linhaId === sel.id).sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button className="inline-flex items-center gap-1 text-sm text-primaria-800 hover:underline" onClick={() => irPara("linhas")}><ArrowLeft size={14} /> Todas as linhas</button>
          {podeGerir && (
            <div className="flex gap-2">
              <Button variante="secundario" icone={<Pencil size={14} />} onClick={() => setEditar(sel)}>Editar</Button>
              {uso ? (
                <Button variante="secundario" onClick={() => executar(() => api.encerrarUsoLinha(uso.id, hoje(), usuario.id), "Linha devolvida.")}>Registrar devolução</Button>
              ) : (
                linhaCobrada(sel) && <Button icone={<UserPlus size={14} />} onClick={() => setEntregar(sel)}>Entregar a uma pessoa</Button>
              )}
            </div>
          )}
        </div>
        <Card>
          <CardHeader titulo={<span className="flex items-center gap-2">{formatarLinha(sel.numero)}<Badge tom={TOM_SITUACAO[sel.situacao]}>{sel.situacao}</Badge></span>} subtitulo={sel.operadora} />
          <CardBody>
            <GradeValores colunas={4}>
              <Valor rotulo="Usuário atual">{uso ? (agregada ? "Pessoa" : base.nomeColaborador(uso.colaboradorId)) : <span className="text-alerta-600">Sem usuário</span>}</Valor>
              <Valor rotulo="Plano · franquia">{[sel.plano, sel.franquia].filter(Boolean).join(" · ") || "—"}</Valor>
              <Valor rotulo="Valor mensal">{formatarMoeda(sel.valorMensal)}</Valor>
              <Valor rotulo="Valor anual" origem="calculado">{formatarMoeda(sel.valorMensal * 12)}</Valor>
              <Valor rotulo="Contrato">{base.contrato(sel.contrato_id)?.codigo ?? "Sem contrato"}</Valor>
              <Valor rotulo="Área · centro de custo">{[sel.area, sel.centroCusto].filter(Boolean).join(" · ") || "—"}</Valor>
              <Valor rotulo="Observação" className="sm:col-span-2">{sel.observacao || "—"}</Valor>
            </GradeValores>
          </CardBody>
        </Card>
        {!agregada && (
          <Card>
            <CardHeader titulo="Histórico de uso" subtitulo="Nunca apagado" />
            <Tabela densa linhas={historico} chave={(u) => u.id} vazio="Sem histórico." colunas={[
              { id: "p", titulo: "Pessoa", render: (u) => base.nomeColaborador(u.colaboradorId) },
              { id: "i", titulo: "Início", render: (u) => formatarData(u.dataInicio) },
              { id: "f", titulo: "Fim", render: (u) => (u.dataFim ? formatarData(u.dataFim) : "—") },
              { id: "s", titulo: "Situação", render: (u) => <Badge tom={u.status === "Ativa" ? "sucesso" : "neutro"}>{u.status}</Badge> },
            ]} />
          </Card>
        )}
        {editar && <LinhaModal linha={editar} dados={dados} contratos={contratos} onFechar={() => setEditar(undefined)} />}
        {entregar && <EntregarModal linha={entregar} dados={dados} onFechar={() => setEntregar(undefined)} />}
      </div>
    );
  }

  const b = busca.replace(/\D/g, "") || busca.trim().toLowerCase();
  const lista = linhas.filter((l) => (!situacao || l.situacao === situacao) && (!busca || l.numero.includes(b) || l.operadora.toLowerCase().includes(b) || (!agregada && base.nomeColaborador(usoAtivo(l.id, dados.usosLinha)?.colaboradorId).toLowerCase().includes(b))));
  return (
    <Card>
      <CardHeader titulo="Linhas" subtitulo="Uma linha tem um usuário por vez" acoes={podeGerir && <Button icone={<Plus size={16} />} onClick={() => setEditar(novaLinha())}>Nova linha</Button>} />
      <CardBody className="grid grid-cols-1 gap-3 border-b border-borda md:grid-cols-3">
        <Input rotulo="Buscar" placeholder="Número, operadora ou pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select rotulo="Situação" value={situacao} vazio="Todas" onChange={(e) => setSituacao(e.target.value)} opcoes={(["Ativa", "Suspensa", "Cancelada", "Portada"] as const).map((s) => ({ valor: s, rotulo: s }))} />
      </CardBody>
      <Tabela
        linhas={lista}
        chave={(l) => l.id}
        onLinha={(l) => irPara("linhas", l.id)}
        vazio="Nenhuma linha."
        colunas={[
          { id: "n", titulo: "Número", render: (l) => <span className="font-medium tabular">{formatarLinha(l.numero)}</span> },
          { id: "o", titulo: "Operadora", render: (l) => l.operadora },
          { id: "p", titulo: "Plano", render: (l) => l.plano ?? "—" },
          { id: "u", titulo: "Usuário", render: (l) => { const u = usoAtivo(l.id, dados.usosLinha); return u ? (agregada ? "Pessoa" : base.nomeColaborador(u.colaboradorId)) : <span className="text-xs text-alerta-600">sem usuário</span>; } },
          { id: "v", titulo: "Valor mensal", alinhamento: "direita", render: (l) => formatarMoeda(l.valorMensal) },
          { id: "s", titulo: "Situação", render: (l) => <Badge tom={TOM_SITUACAO[l.situacao]}>{l.situacao}</Badge> },
        ]}
      />
      {editar && <LinhaModal linha={editar} dados={dados} contratos={contratos} onFechar={() => setEditar(undefined)} />}
    </Card>
  );
}

function LinhaModal({ linha, dados, contratos, onFechar }: { linha: LinhaTelefonica; dados: DadosLicencas; contratos: { contrato_id: string; codigo: string; objeto: string; status: string }[]; onFechar: () => void }) {
  const { usuario, executar, cad } = useApp();
  const [l, setL] = useState(linha);
  const [tentou, setTentou] = useState(false);
  const set = (p: Partial<LinhaTelefonica>) => setL({ ...l, ...p });
  const erros = errosLinha(l, dados.linhas);
  const salvar = async () => {
    setTentou(true);
    if (erros.length) return;
    const r = await executar(() => api.salvarLinha(l, usuario.id), l.id ? "Linha atualizada." : "Linha cadastrada.");
    if (r) onFechar();
  };
  return (
    <Modal aberto titulo={l.id ? `Editar ${formatarLinha(l.numero)}` : "Nova linha"} largura="lg" onFechar={onFechar} rodape={<><Button variante="secundario" onClick={onFechar}>Cancelar</Button><Button onClick={salvar}>Salvar</Button></>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Input rotulo="Número (com DDD)" obrigatorio value={l.numero} onChange={(e) => set({ numero: e.target.value })} placeholder="(11) 98765-4321" />
        <Input rotulo="Operadora" obrigatorio value={l.operadora} onChange={(e) => set({ operadora: e.target.value })} />
        <Input rotulo="Plano" value={l.plano ?? ""} onChange={(e) => set({ plano: e.target.value || undefined })} />
        <Input rotulo="Franquia" value={l.franquia ?? ""} onChange={(e) => set({ franquia: e.target.value || undefined })} />
        <InputNumero rotulo="Valor mensal (R$)" obrigatorio valor={l.valorMensal} onValor={(v) => set({ valorMensal: v ?? 0 })} />
        <Select rotulo="Situação" vazio={false} value={l.situacao} onChange={(e) => set({ situacao: e.target.value as SituacaoLinha })} opcoes={(["Ativa", "Suspensa", "Cancelada", "Portada"] as const).map((s) => ({ valor: s, rotulo: s }))} ajuda="Cancelada ou portada encerra o uso atual." />
        <Select rotulo="Contrato vinculado" vazio="Sem contrato" value={l.contrato_id ?? ""} onChange={(e) => set({ contrato_id: e.target.value || undefined })} opcoes={contratos.filter((c) => c.status === "Vigente" || c.contrato_id === l.contrato_id).map((c) => ({ valor: c.contrato_id, rotulo: `${c.codigo} · ${c.objeto.slice(0, 40)}` }))} />
        <Select rotulo="Área" value={l.area ?? ""} onChange={(e) => set({ area: e.target.value || undefined })} opcoes={(cad.config.listasAuxiliares["Áreas"] ?? AREAS_PADRAO).map((a) => ({ valor: a, rotulo: a }))} />
        <Input rotulo="Centro de custo" value={l.centroCusto ?? ""} onChange={(e) => set({ centroCusto: e.target.value || undefined })} />
        <Textarea className="md:col-span-2" rotulo="Observação" value={l.observacao ?? ""} onChange={(e) => set({ observacao: e.target.value || undefined })} />
      </div>
      {tentou && erros.length > 0 && <div className="mt-3"><Aviso tom="critico">{erros.join(" ")}</Aviso></div>}
    </Modal>
  );
}

function EntregarModal({ linha, dados, onFechar }: { linha: LinhaTelefonica; dados: DadosLicencas; onFechar: () => void }) {
  const { usuario, executar } = useApp();
  const [busca, setBusca] = useState("");
  const [id, setId] = useState("");
  const [data, setData] = useState(hoje());
  const b = busca.trim().toLowerCase();
  const candidatos = dados.colaboradores.filter((c) => c.nome && c.status === "Ativo" && (!b || c.nome.toLowerCase().includes(b) || c.email.includes(b))).slice(0, 50);
  const c = dados.colaboradores.find((x) => x.id === id);
  const erro = c ? erroUsoLinha(linha, dados.usosLinha, c) : undefined;
  return (
    <Modal aberto titulo={`Entregar ${formatarLinha(linha.numero)}`} onFechar={onFechar} rodape={<><Button variante="secundario" onClick={onFechar}>Cancelar</Button><Button disabled={!id || Boolean(erro)} onClick={async () => (await executar(() => api.atribuirLinha(linha.id, id, data, usuario.id), "Linha entregue.")) && onFechar()}>Entregar</Button></>}>
      <div className="space-y-3">
        <Input rotulo="Buscar pessoa" placeholder="Nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <ul className="max-h-60 divide-y divide-borda overflow-auto rounded-md border border-borda">
          {candidatos.map((x) => (
            <li key={x.id}><button onClick={() => setId(x.id)} className={`flex w-full justify-between px-3 py-2 text-left text-sm ${id === x.id ? "bg-primaria-50" : "hover:bg-fundo"}`}><span>{x.nome}</span><span className="text-xs text-texto-suave">{x.email}</span></button></li>
          ))}
          {!candidatos.length && <li className="px-3 py-2 text-sm text-texto-suave">Ninguém encontrado. Cadastre a pessoa em Licenças → Pessoas.</li>}
        </ul>
        <Input rotulo="Início" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        {erro && <Aviso tom="critico">{erro}</Aviso>}
      </div>
    </Modal>
  );
}
