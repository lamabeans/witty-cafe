import type { Metadata } from "next";
import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AiCreationStudio } from "../../components/AiCreationStudio";

export const metadata: Metadata = {
  title: "Create with AI",
  description: "Generate Witty.Cafe ideas into new or existing collections.",
  alternates: {
    canonical: "/create/ai",
  },
};

export default async function AiCreatePage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await currentUser();
  const name =
    user?.firstName ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress ||
    "there";

  return (
    <div className="min-h-screen bg-[var(--canvas)] px-4 py-6 text-[var(--ink)]">
      <main className="mx-auto grid w-full max-w-[1040px] gap-6">
        <nav className="flex items-center gap-2 text-sm font-black text-[var(--muted)]">
          <Link href="/">Witty.Cafe</Link>
          <span>/</span>
          <Link href="/collections">Collections</Link>
          <span>/</span>
          <span>Create with AI</span>
        </nav>

        <section className="wc-card p-6">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--muted)]">
            Beta creation
          </p>
          <h1 className="font-display mt-2 text-4xl font-black leading-tight">
            Create with AI, {name}
          </h1>
          <p className="mt-4 max-w-2xl text-base font-bold leading-7 text-[var(--muted)]">
            Start a new collection or add ideas to an existing collection.
          </p>
        </section>

        <AiCreationStudio mode="selectableCollection" />
      </main>
    </div>
  );
}
