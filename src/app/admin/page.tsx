import Link from "next/link";
import { redirect } from "next/navigation";
import { createOrg } from "@/app/admin/actions";
import { logout } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { formatPickupTimestamp } from "@/lib/format";

type AdminPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
    org?: string;
  }>;
};

type Org = {
  id: string;
  name: string;
  created_at: string;
};

type Pickup = {
  org_id: string;
  tracking_number: string;
  recipient_name: string | null;
  recipient_phone: string | null;
  scanned_at: string;
};

type StaffMember = {
  id: string;
  org_id: string;
  user_id: string;
  display_name: string;
  created_at: string;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: adminRow } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminRow) {
    redirect("/dashboard");
  }

  const { data: orgs } = await supabase
    .from("orgs")
    .select("id, name, created_at")
    .order("name", { ascending: true });
  const typedOrgs = (orgs || []) as Org[];
  const selectedOrgId =
    params.org && typedOrgs.some((org) => org.id === params.org)
      ? params.org
      : "";
  const orgNameById = new Map(typedOrgs.map((org) => [org.id, org.name]));

  let pickupsQuery = supabase
    .from("pickups")
    .select("org_id, tracking_number, recipient_name, recipient_phone, scanned_at")
    .order("scanned_at", { ascending: false })
    .limit(200);

  if (selectedOrgId) {
    pickupsQuery = pickupsQuery.eq("org_id", selectedOrgId);
  }

  let staffQuery = supabase
    .from("org_members")
    .select("id, org_id, user_id, display_name, created_at")
    .order("display_name", { ascending: true });

  if (selectedOrgId) {
    staffQuery = staffQuery.eq("org_id", selectedOrgId);
  }

  const [{ data: pickups, error: pickupError }, { data: staff, error: staffError }] =
    await Promise.all([pickupsQuery, staffQuery]);
  const typedPickups = (pickups || []) as Pickup[];
  const typedStaff = (staff || []) as StaffMember[];

  return (
    <main className="min-h-screen bg-kraft-paper px-5 py-6 text-ledger-ink sm:px-8">
      <section className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-perforation-grey pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-xs font-medium uppercase text-manifest-green">
              ParcelLog
            </p>
            <h1 className="mt-1 font-display text-4xl font-extrabold uppercase leading-none text-ledger-ink sm:text-5xl">
              Platform Admin
            </h1>
            <p className="mt-2 text-sm text-ledger-ink/70">{user.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              className="rounded-[6px] border border-ledger-ink px-3 py-2 font-semibold text-ledger-ink transition hover:bg-ledger-ink hover:text-kraft-paper active:translate-y-px active:bg-manifest-amber active:text-ledger-ink active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2"
              href="/dashboard"
            >
              Dashboard
            </Link>
            <form action={logout}>
              <button className="rounded-[6px] border border-ledger-ink px-3 py-2 font-semibold text-ledger-ink transition hover:bg-ledger-ink hover:text-kraft-paper active:translate-y-px active:bg-stamp-red active:text-kraft-paper active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2">
                Log out
              </button>
            </form>
          </div>
        </header>

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

        <section className="mt-8 grid gap-6 lg:grid-cols-[340px_1fr]">
          <div className="border-y border-dashed border-perforation-grey py-5">
            <h2 className="font-display text-3xl font-extrabold uppercase">
              Orgs
            </h2>
            <form action={createOrg} className="mt-4 bg-paper-light p-4">
              <label className="block">
                <span className="font-mono text-xs font-medium uppercase text-ledger-ink/70">
                  New org name
                </span>
                <input
                  className="mt-1 w-full border-0 border-b border-dashed border-perforation-grey bg-transparent px-0 py-3 text-base text-ledger-ink outline-none focus:border-manifest-amber focus-visible:outline-2 focus-visible:outline-offset-2"
                  name="name"
                  placeholder="Kilimall Pickup Westlands"
                  required
                />
              </label>
              <button className="mt-4 w-full rounded-[6px] bg-manifest-amber px-4 py-3 text-sm font-bold text-ledger-ink transition hover:bg-[#c87d1d] active:translate-y-px active:bg-[#a76312] active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2">
                Create org
              </button>
            </form>

            <div className="mt-5 space-y-2">
              <Link
                className={`block border px-3 py-2 text-sm font-semibold transition active:translate-y-px active:shadow-inner ${
                  selectedOrgId
                    ? "border-perforation-grey bg-paper-light"
                    : "border-ledger-ink bg-ledger-ink text-kraft-paper"
                }`}
                href="/admin"
              >
                All orgs
              </Link>
              {typedOrgs.map((org) => (
                <Link
                  className={`block border px-3 py-2 text-sm transition active:translate-y-px active:shadow-inner ${
                    selectedOrgId === org.id
                      ? "border-ledger-ink bg-ledger-ink text-kraft-paper"
                      : "border-perforation-grey bg-paper-light text-ledger-ink hover:border-ledger-ink"
                  }`}
                  href={`/admin?org=${org.id}`}
                  key={org.id}
                >
                  <span className="block font-semibold">{org.name}</span>
                  <span className="font-mono text-xs opacity-75">{org.id}</span>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-xs font-medium uppercase text-ledger-ink/70">
                  Pickup activity
                </p>
                <h2 className="font-display text-3xl font-extrabold uppercase">
                  {selectedOrgId
                    ? orgNameById.get(selectedOrgId)
                    : "All shops"}
                </h2>
              </div>
              <p className="font-mono text-xs text-ledger-ink/70">
                {typedPickups.length} visible records
              </p>
            </div>

            {pickupError ? (
              <p className="mt-4 border border-stamp-red bg-paper-light p-3 text-sm text-stamp-red">
                {pickupError.message}
              </p>
            ) : null}

            <div className="mt-4 overflow-x-auto border-y border-perforation-grey">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-ledger-ink">
                    <th className="py-3 pr-5 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                      Org
                    </th>
                    <th className="px-5 py-3 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                      Tracking #
                    </th>
                    <th className="px-5 py-3 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                      Recipient
                    </th>
                    <th className="px-5 py-3 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                      Phone
                    </th>
                    <th className="py-3 pl-5 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                      Scanned at
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {typedPickups.map((pickup) => (
                    <tr
                      className="border-t border-dashed border-perforation-grey"
                      key={`${pickup.org_id}-${pickup.tracking_number}-${pickup.scanned_at}`}
                    >
                      <td className="py-4 pr-5">{orgNameById.get(pickup.org_id)}</td>
                      <td className="px-5 py-4 font-mono font-medium">
                        {pickup.tracking_number}
                      </td>
                      <td className="px-5 py-4">
                        {pickup.recipient_name || "Unverified"}
                      </td>
                      <td className="px-5 py-4 font-mono">
                        {pickup.recipient_phone || "-"}
                      </td>
                      <td className="py-4 pl-5 font-mono text-ledger-ink/75">
                        {formatPickupTimestamp(pickup.scanned_at)}
                      </td>
                    </tr>
                  ))}
                  {!typedPickups.length ? (
                    <tr>
                      <td className="py-8 text-ledger-ink/70" colSpan={5}>
                        No pickup records visible for this filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <section className="mt-8 border-t border-dashed border-perforation-grey pt-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-xs font-medium uppercase text-ledger-ink/70">
                    Staff
                  </p>
                  <h2 className="font-display text-3xl font-extrabold uppercase">
                    Org members
                  </h2>
                </div>
                <p className="font-mono text-xs text-ledger-ink/70">
                  {typedStaff.length} members
                </p>
              </div>

              {staffError ? (
                <p className="mt-4 border border-stamp-red bg-paper-light p-3 text-sm text-stamp-red">
                  {staffError.message}
                </p>
              ) : null}

              <div className="mt-4 overflow-x-auto border-y border-perforation-grey">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-ledger-ink">
                      <th className="py-3 pr-5 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                        Org
                      </th>
                      <th className="px-5 py-3 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                        Display name
                      </th>
                      <th className="px-5 py-3 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                        User ID
                      </th>
                      <th className="py-3 pl-5 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                        Joined
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {typedStaff.map((member) => (
                      <tr
                        className="border-t border-dashed border-perforation-grey"
                        key={member.id}
                      >
                        <td className="py-4 pr-5">
                          {orgNameById.get(member.org_id)}
                        </td>
                        <td className="px-5 py-4 font-semibold">
                          {member.display_name}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs">
                          {member.user_id}
                        </td>
                        <td className="py-4 pl-5 font-mono text-ledger-ink/75">
                          {formatPickupTimestamp(member.created_at)}
                        </td>
                      </tr>
                    ))}
                    {!typedStaff.length ? (
                      <tr>
                        <td className="py-8 text-ledger-ink/70" colSpan={4}>
                          No staff records visible for this filter.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}
