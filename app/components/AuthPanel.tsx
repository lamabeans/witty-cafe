"use client";

import {
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function AuthPanel() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const upsertUser = useMutation(api.users.upsert);
  const hasSyncedRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn || !user || hasSyncedRef.current) {
      return;
    }

    hasSyncedRef.current = true;

    void upsertUser({
      clerkUserId: user.id,
      email: user.primaryEmailAddress?.emailAddress,
      name: user.fullName ?? undefined,
      imageUrl: user.imageUrl ?? undefined,
    });
  }, [isSignedIn, upsertUser, user]);

  return (
    <main className="w-full max-w-2xl rounded-3xl border border-zinc-200 bg-white p-10 shadow-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
            Clerk Ready
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight">
            Welcome to your new auth setup
          </h1>
        </div>
        {isSignedIn ? <UserButton /> : null}
      </div>

      <p className="mt-4 text-lg text-zinc-600">
        This project is configured with Clerk. Sign in to continue, or create an
        account to get started.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        {isSignedIn ? null : (
          <SignInButton mode="modal">
            <button className="rounded-full bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800">
              Sign in
            </button>
          </SignInButton>
        )}
        {isSignedIn ? null : (
          <SignUpButton mode="modal">
            <button className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50">
              Create account
            </button>
          </SignUpButton>
        )}
        {isSignedIn ? (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
            You are signed in
          </span>
        ) : null}
      </div>
    </main>
  );
}
