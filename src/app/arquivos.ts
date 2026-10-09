/**
 * Salvar um arquivo gerado pela página. Dentro do link publicado (claude.ai) o navegador bloqueia
 * downloads diretos: usamos a capacidade "downloads" do visualizador, que pede confirmação ao usuário.
 * Fora dele (ex.: npm run dev), cai para o download comum do navegador.
 */
type Downloads = { save(r: { filename: string; data: string | Blob }): Promise<{ status: string }> };
type ClaudeUse = { use(nome: "downloads"): Promise<Downloads | null> };

export async function salvarArquivo(nome: string, conteudo: string): Promise<"salvo" | "cancelado"> {
  const claude = (window as unknown as { claude?: ClaudeUse }).claude;
  if (claude?.use) {
    const downloads = await claude.use("downloads");
    if (downloads) {
      try {
        await downloads.save({ filename: nome, data: conteudo });
        return "salvo";
      } catch (e) {
        if ((e as { code?: string }).code === "declined") return "cancelado";
        throw new Error("Não foi possível salvar o arquivo neste ambiente.");
      }
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([conteudo], { type: "application/octet-stream" }));
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
  return "salvo";
}
