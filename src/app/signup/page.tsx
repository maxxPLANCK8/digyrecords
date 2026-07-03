import Link from "next/link";
import { signup } from "@/app/auth/actions";

type SignupPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-kraft-paper px-6 py-12 text-ledger-ink">
      <section className="w-full max-w-lg">
        <Link
          className="font-display text-3xl font-extrabold uppercase leading-none text-manifest-green focus-visible:outline-2 focus-visible:outline-offset-2"
          href="/"
        >
          ParcelLog
        </Link>
        <h1 className="mt-6 font-display text-5xl font-extrabold uppercase leading-none">
          Create staff account
        </h1>
        <p className="mt-2 text-sm leading-6 text-ledger-ink/70">
          Join an approved shop with its org UUID invite code.
        </p>

        {params.error ? (
          <p className="mt-6 border border-stamp-red bg-paper-light p-3 text-sm text-stamp-red">
            {params.error}
          </p>
        ) : null}

        <form
          action={signup}
          className="mt-8 border-x-2 border-b-2 border-dashed border-perforation-grey bg-paper-light px-4 pb-5 pt-5 shadow-[0_8px_0_rgba(20,32,43,0.12)]"
        >
          <label className="block">
            <span className="font-mono text-xs font-medium uppercase text-ledger-ink/70">
              Display name
            </span>
            <input
              className="mt-1 w-full border-0 border-b border-dashed border-perforation-grey bg-transparent px-0 py-3 text-base text-ledger-ink outline-none focus:border-manifest-amber focus-visible:outline-2 focus-visible:outline-offset-2"
              name="display_name"
              autoComplete="name"
              required
            />
          </label>

          <label className="mt-4 block">
            <span className="font-mono text-xs font-medium uppercase text-ledger-ink/70">
              Email
            </span>
            <input
              className="mt-1 w-full border-0 border-b border-dashed border-perforation-grey bg-transparent px-0 py-3 text-base text-ledger-ink outline-none focus:border-manifest-amber focus-visible:outline-2 focus-visible:outline-offset-2"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="mt-4 block">
            <span className="font-mono text-xs font-medium uppercase text-ledger-ink/70">
              Password
            </span>
            <input
              className="mt-1 w-full border-0 border-b border-dashed border-perforation-grey bg-transparent px-0 py-3 text-base text-ledger-ink outline-none focus:border-manifest-amber focus-visible:outline-2 focus-visible:outline-offset-2"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label className="mt-4 block">
            <span className="font-mono text-xs font-medium uppercase text-ledger-ink/70">
              Org invite code
            </span>
            <input
              className="mt-1 w-full border-0 border-b border-dashed border-perforation-grey bg-transparent px-0 py-3 font-mono text-sm text-ledger-ink outline-none focus:border-manifest-amber focus-visible:outline-2 focus-visible:outline-offset-2"
              name="org_id"
              placeholder="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
              required
            />
          </label>

          <button className="mt-6 w-full rounded-[6px] bg-manifest-amber px-4 py-3 text-sm font-bold text-ledger-ink transition hover:bg-[#c87d1d] active:translate-y-px active:bg-[#a76312] active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2">
            Create account
          </button>
        </form>

        <p className="mt-6 text-sm text-ledger-ink/70">
          Already have an account?{" "}
          <Link
            className="font-medium text-manifest-green underline-offset-4 active:text-manifest-amber focus-visible:outline-2"
            href="/login"
          >
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
}
