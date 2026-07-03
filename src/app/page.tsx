export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-stone-50 text-zinc-950">
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-6 py-12 sm:px-10">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
            ParcelLog
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 sm:text-6xl">
            Pickup records ready for the field.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-700">
            A deployable shell for the phone scanner, offline queue, and
            desktop pickup dashboard. The next checkpoint is Supabase tenant
            data and RLS verification.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <a
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-600"
            href="/scan"
          >
            <span className="text-sm font-medium text-emerald-700">
              Phone workflow
            </span>
            <h2 className="mt-2 text-2xl font-semibold">Scan pickup</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Camera scanning, manual recipient fields, and offline sync will
              live here.
            </p>
          </a>

          <a
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-600"
            href="/dashboard"
          >
            <span className="text-sm font-medium text-emerald-700">
              Desktop workflow
            </span>
            <h2 className="mt-2 text-2xl font-semibold">Dashboard</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Searchable pickup table, date filters, counts, and CSV export
              will live here.
            </p>
          </a>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            className="rounded-md bg-emerald-700 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-emerald-800"
            href="/login"
          >
            Log in
          </a>
          <a
            className="rounded-md border border-zinc-300 bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-800 transition hover:border-emerald-600"
            href="/signup"
          >
            Create account
          </a>
        </div>
      </section>
    </main>
  );
}
