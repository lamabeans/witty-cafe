import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AiContentStudio } from "./AiContentStudio";

export default async function DashboardPage() {
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
        <section className="wc-card p-6">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[var(--muted)]">
            Dashboard
          </p>
          <h1 className="font-display mt-2 text-4xl font-black leading-tight">
            Welcome, {name}
          </h1>
          <p className="mt-4 text-base font-bold text-[var(--muted)]">
            Manage publishing tools and background AI content generation.
          </p>
        </section>
        <AiContentStudio />
      </main>
    </div>
  );
}
