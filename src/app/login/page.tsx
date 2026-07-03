import Link from "next/link";
import { login } from "@/app/auth/actions";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-kraft-paper px-6 py-12 text-ledger-ink">
      <section className="w-full max-w-md">
        <Link
          className="font-display text-3xl font-extrabold uppercase leading-none text-manifest-green focus-visible:outline-2 focus-visible:outline-offset-2"
          href="/"
        >
          ParcelLog
        </Link>
        <h1 className="mt-6 font-display text-5xl font-extrabold uppercase leading-none">
          Log in
        </h1>
        <p className="mt-2 text-sm leading-6 text-ledger-ink/70">
          Use your shop staff email and password.
        </p>

        {params.message ? (
          <p className="mt-6 border border-manifest-green bg-paper-light p-3 text-sm text-manifest-green">
            {params.message}
          </p>
        ) : null}
        {params.error ? (
          <p className="mt-6 border border-stamp-red bg-paper-light p-3 text-sm text-stamp-red">
            {params.error}
          </p>
        ) : null}

        <form
          action={login}
          className="mt-8 border-x-2 border-b-2 border-dashed border-perforation-grey bg-paper-light px-4 pb-5 pt-5 shadow-[0_8px_0_rgba(20,32,43,0.12)]"
        >
          <label className="block">
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
              autoComplete="current-password"
              required
            />
          </label>

          <button className="mt-6 w-full rounded-[6px] bg-manifest-amber px-4 py-3 text-sm font-bold text-ledger-ink transition hover:bg-[#c87d1d] active:translate-y-px active:bg-[#a76312] active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2">
            Log in
          </button>
        </form>

        <p className="mt-6 text-sm text-ledger-ink/70">
          Need an account?{" "}
          <Link
            className="font-medium text-manifest-green underline-offset-4 active:text-manifest-amber focus-visible:outline-2"
            href="/signup"
          >
            Sign up
          </Link>
        </p>
      </section>
    </main>
  );
}
