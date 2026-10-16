import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRightLeft, Pencil, Plus, UserPlus } from "lucide-react";
import { useApp } from "@/app/contexto";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { GradeValores, Input, Select, Valor } from "@/components/ui/Campos";
import { Aviso } from "@/components/ui/Diversos";
import { Tabela } from "@/components/ui/Tabela";
import { formatarData, hoje } from "@/domain/datas";
import { formatarMoeda, formatarNumero } from "@/domain/formatacao";
import { cambioNaData, equivalentes, posicaoNaData, rotuloTipoCobranca } from "@/domain/rules/licencas";
import type { Licenca } from "@/domain/types";
import { api } from "@/services";
import { AtribuirModal, LicencaModal, MovimentacaoModal, novaLicenca } from "./formularios";
import type { ContextoLicencas } from "./Licencas";

/** Lista de licenças e ficha de cada uma (dados, movimentações e quem usa). */
export function CadastroLicencas({ ctx }: { ctx: ContextoLicencas }) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("Ativa");
  const [editar, setEditar] = useState<Licenca>();
  const { dados } = ctx;
  const cambio = useMemo(() => cambioNaData(dados.cotacoes, dados.parametros, hoje()), [dados]);
  const doGestor = useMemo(() => {
    if (!ctx.areaFixa) return undefined;
    const pessoas = new Set(dados.colaboradores.filter((c) => c.nome && c.area === ctx.areaFixa).map((c) => c.id));
    return new Set(dados.licencas.filter((l) => l.area === ctx.areaFixa || dados.atribuicoes.some((a) => a.licencaId === l.id && a.status === "Ativa" && pessoas.has(a.colaboradorId))).map((l) => l.id));
  }, [ctx.areaFixa, dados]);

  const selecionada = ctx.item ? ctx.licenca(ctx.item) : undefined;
  if (selecionada && (!doGestor || doGestor.has(selecionada.id))) return <FichaLicenca l={selecionada} ctx={ctx} />;

  const b = busca.trim().toLowerCase();
  const linhas = dados.licencas
    .filter((l) => (!doGestor || doGestor.has(l.id)) && (!status || l.status === status) && (!b || `${l.produto} ${l.plano ?? ""} ${ctx.nomeFornecedor(l.fornecedorId)}`.toLowerCase().includes(b)))
    .map((l) => {
      const movs = dados.movimentacoes.filter((m) => m.licencaId === l.id);
      return { l, eq: equivalentes(l, movs, cambio), emUso: dados.atribuicoes.filter((a) => a.licencaId === l.id && a.status === "Ativa").length };
    })
    .sort((a, b) => (b.eq.anualBRL?.custoRealBRL ?? 0) - (a.eq.anualBRL?.custoRealBRL ?? 0));

  return (
    <Card>
      <CardHeader
        titulo="Licenças"
        subtitulo="Assentos e valores são calculados a partir das compras, reduções e renegociações"
        acoes={ctx.podeGerir && <Button icone={<Plus size={16} />} onClick={() => setEditar(novaLicenca())}>Nova licença</Button>}
      />
      <CardBody className="grid grid-cols-1 gap-3 border-b border-borda md:grid-cols-3">
        <Input rotulo="Buscar" placeholder="Produto, plano ou fornecedor" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Select rotulo="Situação" value={status} vazio="Todas" onChange={(e) => setStatus(e.target.value)} opcoes={[{ valor: "Ativa", rotulo: "Ativas" }, { valor: "Cancelada", rotulo: "Canceladas" }]} />
      </CardBody>
      <Tabela
        linhas={linhas}
        chave={(x) => x.l.id}
        onLinha={(x) => ctx.irPara("licencas", x.l.id)}
        vazio={ctx.podeGerir ? "Nenhuma licença. Use “Nova licença” ou a importação por CSV." : "Nenhuma licença da sua área."}
        minLargura="min-w-[1000px]"
        colunas={[
          { id: "produto", titulo: "Licença", render: (x) => <span><span className="font-medium">{x.l.produto}</span>{x.l.plano && <span className="ml-1 text-xs text-texto-suave">{x.l.plano}</span>}</span> },
          { id: "forn", titulo: "Fornecedor", render: (x) => ctx.nomeFornecedor(x.l.fornecedorId) },
          { id: "contrato", titulo: "Contrato", render: (x) => ctx.contrato(x.l.contrato_id)?.codigo ?? <span className="text-xs text-texto-fraco">sem contrato</span> },
          { id: "cobranca", titulo: "Cobrança", render: (x) => `${rotuloTipoCobranca(x.l.tipoCobranca)} · ${x.l.periodicidade.toLowerCase()} · ${x.l.moeda}` },
          { id: "uso", titulo: "Em uso / assentos", alinhamento: "direita", render: (x) => (x.l.tipoCobranca === "Assento" ? `${x.emUso} / ${x.eq.assentos}` : `${x.emUso} usuário(s)`) },
          { id: "mensal", titulo: "Equivalente mensal", alinhamento: "direita", render: (x) => (x.eq.mensalBRL ? formatarMoeda(x.eq.mensalBRL.custoRealBRL) : <span className="text-xs text-critico-600">sem câmbio</span>) },
          { id: "anual", titulo: "Equivalente anual", alinhamento: "direita", render: (x) => (x.eq.anualBRL ? formatarMoeda(x.eq.anualBRL.custoRealBRL) : "—") },
          { id: "venc", titulo: "Vencimento", render: (x) => (x.l.vencimentoTipo === "Data" ? formatarData(x.l.dataVencimento) : x.l.vencimentoTipo) },
          { id: "status", titulo: "Situação", render: (x) => <Badge tom={x.l.status === "Ativa" ? "sucesso" : "neutro"}>{x.l.status}</Badge> },
        ]}
      />
      {editar && <LicencaModal licenca={editar} ctx={ctx} onFechar={(r) => (setEditar(undefined), r && ctx.irPara("licencas", r.id))} />}
    </Card>
  );
}

function FichaLicenca({ l, ctx }: { l: Licenca; ctx: ContextoLicencas }) {
  const { usuario, executar } = useApp();
  const [editar, setEditar] = useState(false);
  const [mov, setMov] = useState(false);
  const [atribuir, setAtribuir] = useState(false);
  const [historico, setHistorico] = useState(false);
  const { dados } = ctx;
  const movs = dados.movimentacoes.filter((m) => m.licencaId === l.id).sort((a, b) => b.data.localeCompare(a.data) || b.registradoEm.localeCompare(a.registradoEm));
  const cambio = cambioNaData(dados.cotacoes, dados.parametros, hoje());
  const eq = equivalentes(l, movs, cambio);
  const pos = posicaoNaData(movs);
  const atribs = dados.atribuicoes.filter((a) => a.licencaId === l.id && (historico || a.status === "Ativa"));
  const ativas = dados.atribuicoes.filter((a) => a.licencaId === l.id && a.status === "Ativa").length;
  const livres = l.tipoCobranca === "Assento" ? Math.max(0, eq.assentos - ativas) : 0;
  const contrato = ctx.contrato(l.contrato_id);
  const outrasAreas = ctx.areaFixa ? atribs.filter((a) => !ctx.colaborador(a.colaboradorId)?.nome).length : 0;
  const m = (v?: number) => formatarMoeda(v, l.moeda);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="inline-flex items-center gap-1 text-sm text-primaria-800 hover:underline" onClick={() => ctx.irPara("licencas")}><ArrowLeft size={14} /> Todas as licenças</button>
        {ctx.podeGerir && (
          <div className="flex flex-wrap gap-2">
            <Button variante="secundario" icone={<Pencil size={14} />} onClick={() => setEditar(true)}>Editar</Button>
            <Button variante="secundario" icone={<ArrowRightLeft size={14} />} onClick={() => setMov(true)}>Registrar movimentação</Button>
            {l.status === "Ativa" && <Button icone={<UserPlus size={14} />} onClick={() => setAtribuir(true)}>Atribuir pessoa</Button>}
          </div>
        )}
      </div>
      <Card>
        <CardHeader titulo={<span className="flex items-center gap-2">{l.produto}{l.plano && <span className="text-sm font-normal text-texto-suave">{l.plano}</span>}<Badge tom={l.status === "Ativa" ? "sucesso" : "neutro"}>{l.status}</Badge></span>} subtitulo={ctx.nomeFornecedor(l.fornecedorId)} />
        <CardBody className="space-y-4">
          {!eq.anualBRL && <Aviso tom="critico">Licença em USD sem PTAX, spread ou IOF configurados: não há custo em reais.</Aviso>}
          <GradeValores colunas={4}>
            <Valor rotulo="Assentos contratados" origem="calculado">{l.tipoCobranca === "Assento" ? formatarNumero(eq.assentos) : rotuloTipoCobranca(l.tipoCobranca)}</Valor>
            <Valor rotulo="Em uso / disponíveis" origem="calculado">{l.tipoCobranca === "Assento" ? `${ativas} / ${livres}` : `${ativas} usuário(s)`}</Valor>
            <Valor rotulo={`Equivalente mensal (${l.moeda})`} origem="calculado">{m(eq.mensalOriginal)}</Valor>
            <Valor rotulo={`Equivalente anual (${l.moeda})`} origem="calculado">{m(eq.anualOriginal)}</Valor>
            <Valor rotulo="Equivalente mensal (custo real R$)" origem="calculado">{formatarMoeda(eq.mensalBRL?.custoRealBRL)}</Valor>
            <Valor rotulo="Equivalente anual (custo real R$)" origem="calculado">{formatarMoeda(eq.anualBRL?.custoRealBRL)}</Valor>
            <Valor rotulo="IOF anual" origem="calculado">{l.moeda === "USD" ? formatarMoeda(eq.anualBRL?.iofBRL) : "Não se aplica (BRL)"}</Valor>
            <Valor rotulo="Custo ocioso anual" origem="calculado">{eq.anualBRL && eq.assentos ? formatarMoeda((eq.anualBRL.custoRealBRL / eq.assentos) * livres) : "—"}</Valor>
            <Valor rotulo="Preço unitário vigente">{pos.lotes.length ? [...new Set(pos.lotes.map((x) => x.precoUnitario))].map((p) => m(p)).join(" / ") + ` por ${l.periodicidade === "Mensal" ? "mês" : "ano"}` : "—"}</Valor>
            <Valor rotulo="Contrato">{contrato ? <Link className="text-primaria-800 hover:underline" to={`/contratos/${contrato.contrato_id}`}>{contrato.codigo}</Link> : "Sem contrato"}</Valor>
            <Valor rotulo="Vencimento">{l.vencimentoTipo === "Data" ? formatarData(l.dataVencimento) : l.vencimentoTipo}{contrato && <span className="block text-xs text-texto-suave">Alertas pelo contrato</span>}</Valor>
            <Valor rotulo="Área · centro de custo">{[l.area, l.centroCusto].filter(Boolean).join(" · ") || "—"}</Valor>
            <Valor rotulo="Utilização" className="sm:col-span-2">{l.utilizacao || "—"}</Valor>
            <Valor rotulo="Responsável">{l.responsavel || "—"}</Valor>
            <Valor rotulo="Categoria">{l.categoria || "—"}</Valor>
            <Valor rotulo="Justificativa de manutenção" className="sm:col-span-2">{l.justificativaManutencao || "—"}</Valor>
            <Valor rotulo="Quem pode substituir">{l.substitutoPossivel || "—"}</Valor>
            <Valor rotulo="Riscos de trocar">{l.riscoTroca || "—"}</Valor>
            {l.tipoCobranca === "Consumo" && <Valor rotulo="Limite de consumo mensal">{l.limiteConsumoMensal ? m(l.limiteConsumoMensal) : <span className="text-alerta-600">Sem limite</span>}</Valor>}
          </GradeValores>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          titulo="Quem usa"
          subtitulo={outrasAreas ? `${outrasAreas} assento(s) com pessoas de outras áreas (nomes ocultos)` : "Assentos com pessoa atribuída"}
          acoes={<label className="flex items-center gap-2 text-xs text-texto-suave"><input type="checkbox" checked={historico} onChange={(e) => setHistorico(e.target.checked)} /> Mostrar histórico</label>}
        />
        <Tabela
          densa
          linhas={atribs.filter((a) => !ctx.areaFixa || ctx.colaborador(a.colaboradorId)?.nome)}
          chave={(a) => a.id}
          vazio="Ninguém atribuído."
          colunas={[
            { id: "nome", titulo: "Pessoa", render: (a) => <span className="font-medium">{ctx.nomeColaborador(a.colaboradorId)}{ctx.colaborador(a.colaboradorId)?.status === "Desligado" && <Badge tom="critico" className="ml-2">Desligado</Badge>}</span> },
            { id: "email", titulo: "E-mail", render: (a) => ctx.colaborador(a.colaboradorId)?.email },
            { id: "area", titulo: "Área", render: (a) => ctx.colaborador(a.colaboradorId)?.area ?? "—" },
            { id: "inicio", titulo: "Início", render: (a) => formatarData(a.dataInicio) },
            { id: "fim", titulo: "Fim", render: (a) => (a.status === "Ativa" ? "—" : formatarData(a.dataFim)) },
            {
              id: "acao",
              titulo: "",
              alinhamento: "direita",
              render: (a) =>
                ctx.podeGerir && a.status === "Ativa" ? (
                  <Button variante="fantasma" tamanho="sm" onClick={() => executar(() => api.encerrarAtribuicao(a.id, hoje(), usuario.id), "Licença retirada. O assento ficou disponível.")}>Retirar</Button>
                ) : null,
            },
          ]}
        />
      </Card>

      <Card>
        <CardHeader titulo="Movimentações" subtitulo="Histórico do contratado: cada linha guarda o valor anual antes e depois (economia ou aumento)" />
        <Tabela
          densa
          linhas={movs}
          chave={(x) => x.id}
          vazio="Sem movimentações."
          minLargura="min-w-[900px]"
          colunas={[
            { id: "data", titulo: "Data", render: (x) => formatarData(x.data) },
            { id: "tipo", titulo: "Tipo", render: (x) => x.tipo },
            { id: "qtd", titulo: "Assentos", alinhamento: "direita", render: (x) => (x.quantidade ? `${x.tipo === "Redução" ? "−" : "+"}${x.quantidade}` : "—") },
            { id: "preco", titulo: "Preço unitário", alinhamento: "direita", render: (x) => (x.precoUnitario !== undefined ? m(x.precoUnitario) : "—") },
            { id: "var", titulo: "Valor anual", alinhamento: "direita", render: (x) => <span>{m(x.valorAnualAntes)} → {m(x.valorAnualDepois)}</span> },
            { id: "delta", titulo: "Variação", alinhamento: "direita", render: (x) => <span className={x.valorAnualDepois < x.valorAnualAntes ? "text-sucesso-600" : "text-alerta-600"}>{x.valorAnualDepois < x.valorAnualAntes ? "−" : "+"}{m(Math.abs(x.valorAnualDepois - x.valorAnualAntes))}</span> },
            { id: "resp", titulo: "Responsável", render: (x) => x.responsavel },
            { id: "ped", titulo: "Pedido", render: (x) => x.referenciaPedido ?? "—" },
          ]}
        />
      </Card>

      {editar && <LicencaModal licenca={l} ctx={ctx} onFechar={() => setEditar(false)} />}
      {mov && <MovimentacaoModal licenca={l} ctx={ctx} onFechar={() => setMov(false)} />}
      {atribuir && <AtribuirModal licenca={l} ctx={ctx} onFechar={() => setAtribuir(false)} />}
    </div>
  );
}
