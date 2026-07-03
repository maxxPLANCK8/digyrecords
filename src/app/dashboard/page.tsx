import { redirect } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

type Membership = {
  orgs?: { name?: string } | { name?: string }[] | null;
};

function orgNameFor(membership: Membership) {
  if (Array.isArray(membership.orgs)) {
    return membership.orgs[0]?.name;
  }

  return membership.orgs?.name;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("org_members")
    .select("display_name, orgs(name)")
    .eq("user_id", user.id);

  const { data: pickups, error } = await supabase
    .from("pickups")
    .select(
      "tracking_number, recipient_name, recipient_phone, scanned_at, org_id",
    )
    .order("tracking_number", { ascending: true });

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-8 text-zinc-950">
      <section className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-700">ParcelLog</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Dashboard
            </h1>
            <p className="mt-2 text-sm text-zinc-600">{user.email}</p>
          </div>
          <form action={logout}>
            <button className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:border-emerald-600">
              Log out
            </button>
          </form>
        </header>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-600">Visible pickups</p>
            <p className="mt-2 text-3xl font-semibold">{pickups?.length ?? 0}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 sm:col-span-2">
            <p className="text-sm text-zinc-600">Org membership</p>
            <p className="mt-2 text-lg font-medium">
              {(memberships as Membership[] | null)
                ?.map(orgNameFor)
                .filter(Boolean)
                .join(", ") || "No org linked"}
            </p>
          </div>
        </div>

        {error ? (
          <p className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error.message}
          </p>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-zinc-100 text-zinc-700">
              <tr>
                <th className="px-4 py-3 font-medium">Tracking #</th>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Scanned at</th>
                <th className="px-4 py-3 font-medium">Org ID</th>
              </tr>
            </thead>
            <tbody>
              {pickups?.map((pickup) => (
                <tr
                  className="border-t border-zinc-100"
                  key={`${pickup.org_id}-${pickup.tracking_number}`}
                >
                  <td className="px-4 py-3 font-medium">
                    {pickup.tracking_number}
                  </td>
                  <td className="px-4 py-3">{pickup.recipient_name}</td>
                  <td className="px-4 py-3">{pickup.recipient_phone}</td>
                  <td className="px-4 py-3">
                    {new Date(pickup.scanned_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                    {pickup.org_id}
                  </td>
                </tr>
              ))}
              {!pickups?.length ? (
                <tr>
                  <td className="px-4 py-6 text-zinc-600" colSpan={5}>
                    No pickups visible for this logged-in user.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
