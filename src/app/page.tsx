export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-kraft-paper text-ledger-ink">
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-10 px-6 py-12 sm:px-10">
        <div className="grid items-end gap-8 lg:grid-cols-[1fr_280px]">
          <div>
            <p className="font-mono text-xs font-medium uppercase text-manifest-green">
              Pickup manifest
            </p>
            <h1 className="mt-3 font-display text-6xl font-extrabold uppercase leading-[0.9] text-ledger-ink sm:text-8xl">
              ParcelLog
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ledger-ink/75">
              Scan courier labels, verify recipient details, and keep a clean
              pickup ledger for every shop counter.
            </p>
          </div>
          <div className="-rotate-6 border-4 border-manifest-green bg-paper-light px-6 py-5 text-center text-manifest-green shadow-[8px_8px_0_rgba(63,107,78,0.16)]">
            <p className="font-display text-6xl font-extrabold uppercase leading-none">
              Received
            </p>
            <p className="mt-2 font-mono text-xs uppercase">Depot verified</p>
          </div>
        </div>

        <div className="grid gap-4 border-y border-dashed border-perforation-grey py-6 sm:grid-cols-3">
          <div>
            <span className="font-mono text-xs font-medium uppercase text-ledger-ink/60">
              Scan
            </span>
            <h2 className="mt-1 font-display text-3xl font-extrabold uppercase">
              Barcode to record
            </h2>
          </div>
          <div>
            <span className="font-mono text-xs font-medium uppercase text-ledger-ink/60">
              Verify
            </span>
            <h2 className="mt-1 font-display text-3xl font-extrabold uppercase">
              Editable OCR fields
            </h2>
          </div>
          <div>
            <span className="font-mono text-xs font-medium uppercase text-ledger-ink/60">
              Export
            </span>
            <h2 className="mt-1 font-display text-3xl font-extrabold uppercase">
              Manifest PDF
            </h2>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            className="rounded-[6px] bg-manifest-amber px-5 py-3 text-center text-sm font-bold text-ledger-ink transition hover:bg-[#c87d1d] active:translate-y-px active:bg-[#a76312] active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2"
            href="/login"
          >
            Log in
          </a>
        </div>
      </section>
    </main>
  );
}
