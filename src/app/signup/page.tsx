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
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-6 py-12 text-zinc-950">
      <section className="w-full max-w-lg">
        <Link className="text-sm font-semibold text-emerald-700" href="/">
          ParcelLog
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Create staff account
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Join an existing shop with its org UUID invite code, or create a new
          org for a new pickup point.
        </p>

        {params.error ? (
          <p className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {params.error}
          </p>
        ) : null}

        <form action={signup} className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-zinc-800">
              Display name
            </span>
            <input
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600"
              name="display_name"
              autoComplete="name"
              required
            />
          </label>

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
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <fieldset className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
            <legend className="px-1 text-sm font-medium text-zinc-800">
              Org setup
            </legend>
            <label className="flex items-start gap-3 text-sm text-zinc-700">
              <input
                className="mt-1"
                name="org_mode"
                type="radio"
                value="join"
                defaultChecked
              />
              Join existing org with invite UUID
            </label>
            <label className="flex items-start gap-3 text-sm text-zinc-700">
              <input className="mt-1" name="org_mode" type="radio" value="create" />
              Create a new org
            </label>
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium text-zinc-800">
              Org invite code
            </span>
            <input
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-3 font-mono text-sm outline-none focus:border-emerald-600"
              name="org_id"
              placeholder="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-800">
              New org name
            </span>
            <input
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-3 text-base outline-none focus:border-emerald-600"
              name="org_name"
              placeholder="Kilimall Pickup Westlands"
            />
          </label>

          <button className="w-full rounded-md bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800">
            Create account
          </button>
        </form>

        <p className="mt-6 text-sm text-zinc-600">
          Already have an account?{" "}
          <Link className="font-medium text-emerald-700" href="/login">
            Log in
          </Link>
        </p>
      </section>
    </main>
  );
}
