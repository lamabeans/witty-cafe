"use client";

import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState } from "react";

export default function RagDemo() {
  const seed = useAction(api.rag.seed);
  const demoSearch = useAction(api.rag.demoSearch);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<unknown>(null);

  const handleSeed = async () => {
    setLoading(true);
    setResults(null);
    try {
      await seed({});
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    setLoading(true);
    try {
      const res = await demoSearch({});
      setResults(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-500">
        RAG Demo
      </h2>
      <p className="mt-2 text-sm text-zinc-600">
        Seed a few docs, then run a demo search.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={handleSeed}
          disabled={loading}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
        >
          Seed docs
        </button>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-60"
        >
          Run demo search
        </button>
      </div>
      {results ? (
        <pre className="mt-4 max-h-64 overflow-auto rounded-2xl bg-zinc-50 p-4 text-xs text-zinc-700">
          {JSON.stringify(results, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
