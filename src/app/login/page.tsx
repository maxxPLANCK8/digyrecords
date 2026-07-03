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
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6 py-12 text-zinc-950">
      <section className="w-full max-w-md">
        <Link className="text-sm font-semibold text-emerald-700" href="/">
          ParcelLog
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Log in</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Use your shop staff email and password.
        </p>

        {params.message ? (
          <p className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {params.message}
          </p>
        ) : null}
        {params.error ? (
          <p className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {params.error}
          </p>
        ) : null}

        <form action={login} className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-zinc-800">Email</span>
            <input
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-800">Password</span>
            <input
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>

          <button className="w-full rounded-md bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800">
            Log in
          </button>
        </form>

        <p className="mt-6 text-sm text-zinc-600">
          Need an account?{" "}
          <Link className="font-medium text-emerald-700" href="/signup">
            Sign up
          </Link>
        </p>
      </section>
    </main>
  );
}
