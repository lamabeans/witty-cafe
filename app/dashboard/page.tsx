import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const { userId } = auth();

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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-zinc-900">
      <main className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white p-10 shadow-lg">
        <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
          Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight">
          Welcome, {name}
        </h1>
        <p className="mt-4 text-lg text-zinc-600">
          You are signed in and can see this protected page.
        </p>
      </main>
    </div>
  );
}
