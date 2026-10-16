import { Input, Select } from "@/components/ui/Campos";
import { UFS } from "@/domain/rules/fornecedor";
import type { Cliente } from "@/domain/types";

/** Cadastro de cliente (separado do de fornecedores). Sem dados bancários: recebimento é do Contas a receber. */
export function ClienteForm({ c, onChange, erros }: { c: Cliente; onChange: (c: Cliente) => void; erros: Record<string, string> }) {
  const set = (p: Partial<Cliente>) => onChange({ ...c, ...p });
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Input rotulo="Razão Social" obrigatorio className="md:col-span-2" value={c.razaoSocial} onChange={(e) => set({ razaoSocial: e.target.value })} erro={erros.razaoSocial} />
      <Input rotulo="Nome Fantasia" placeholder="Opcional" value={c.nomeFantasia} onChange={(e) => set({ nomeFantasia: e.target.value })} />
      <Select
        rotulo="Origem"
        vazio={false}
        opcoes={[{ valor: "nacional", rotulo: "Nacional (com CNPJ)" }, { valor: "exterior", rotulo: "No exterior (sem CNPJ)" }]}
        value={c.estrangeiro ? "exterior" : "nacional"}
        onChange={(e) => (e.target.value === "exterior" ? set({ estrangeiro: true, cnpj: undefined, uf: undefined }) : set({ estrangeiro: false, pais: undefined, identificacaoFiscalExterior: undefined }))}
      />
      {c.estrangeiro ? (
        <>
          <Input rotulo="País" value={c.pais ?? ""} onChange={(e) => set({ pais: e.target.value })} erro={erros.pais} />
          <Input rotulo="Identificação fiscal no exterior" placeholder="Opcional (Tax ID, VAT…)" value={c.identificacaoFiscalExterior ?? ""} onChange={(e) => set({ identificacaoFiscalExterior: e.target.value || undefined })} />
        </>
      ) : (
        <Input rotulo="CNPJ" obrigatorio placeholder="00.000.000/0000-00" value={c.cnpj ?? ""} onChange={(e) => set({ cnpj: e.target.value })} erro={erros.cnpj} />
      )}
      <Input rotulo="Código no Contas a receber" placeholder="Opcional (integração)" value={c.codigoCliente ?? ""} onChange={(e) => set({ codigoCliente: e.target.value || undefined })} />
      <Input rotulo="Contato" placeholder="Nome do contato comercial" value={c.contato ?? ""} onChange={(e) => set({ contato: e.target.value || undefined })} />
      <Input rotulo="E-mail" type="email" value={c.email ?? ""} onChange={(e) => set({ email: e.target.value || undefined })} erro={erros.email} />
      <Input rotulo="Telefone" value={c.telefone ?? ""} onChange={(e) => set({ telefone: e.target.value || undefined })} />
      <Input rotulo="Endereço" className="md:col-span-2" value={c.endereco ?? ""} onChange={(e) => set({ endereco: e.target.value || undefined })} />
      <Input rotulo="Cidade" value={c.cidade ?? ""} onChange={(e) => set({ cidade: e.target.value || undefined })} />
      {!c.estrangeiro && <Select rotulo="UF" opcoes={UFS.map((u) => ({ valor: u, rotulo: u }))} value={c.uf ?? ""} onChange={(e) => set({ uf: e.target.value || undefined })} />}
      <Select rotulo="Situação" vazio={false} opcoes={[{ valor: "Ativo", rotulo: "Ativo" }, { valor: "Inativo", rotulo: "Inativo" }]} value={c.statusCadastral} onChange={(e) => set({ statusCadastral: e.target.value as Cliente["statusCadastral"] })} />
    </div>
  );
}
