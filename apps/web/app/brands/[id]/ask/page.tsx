import { AskChat } from "@/components/ask-chat";
import { PageHeader } from "@/components/shell/app-shell";
import { api } from "@/lib/api";
import { getBrand } from "@/lib/brand";

type Msg = { role: "user" | "assistant"; content: string };

export default async function AskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brand = await getBrand(id);

  async function ask(messages: Msg[]) {
    "use server";
    try {
      return await api<{ answer: string }>(`/brands/${id}/ask`, { method: "POST", body: JSON.stringify({ messages }) });
    } catch (e) {
      const msg = (e as Error).message.replace(/^API \d+: /, "");
      try {
        return { error: String(JSON.parse(msg).message) };
      } catch {
        return { error: msg };
      }
    }
  }

  return (
    <>
      <PageHeader title="Ask AI" description="Questions in plain English about your visibility, competitors and sources. Beta: answers can be wrong, so check the numbers on the other pages." />
      <AskChat brand={brand.name} ask={ask} />
    </>
  );
}
