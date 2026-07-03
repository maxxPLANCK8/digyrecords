import { redirect } from "next/navigation";
import { logout } from "@/app/auth/actions";
import { DownloadPdfButton } from "@/app/dashboard/download-pdf-button";
import { createClient } from "@/lib/supabase/server";
import { formatPickupTimestamp } from "@/lib/format";

type Membership = {
  display_name?: string | null;
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
    .order("scanned_at", { ascending: false });

  const typedMemberships = memberships as Membership[] | null;
  const orgNames =
    typedMemberships?.map(orgNameFor).filter(Boolean).join(", ") ||
    "No org linked";
  const displayName = typedMemberships?.[0]?.display_name || user.email;

  return (
    <main className="min-h-screen bg-kraft-paper px-5 py-6 text-ledger-ink sm:px-8">
      <section className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-4 border-b border-perforation-grey pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-xs font-medium uppercase text-manifest-green">
              ParcelLog
            </p>
            <h1 className="mt-1 font-display text-4xl font-extrabold uppercase leading-none text-ledger-ink sm:text-5xl">
              {orgNames}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="text-ledger-ink/75">{displayName}</span>
            <span className="text-perforation-grey">/</span>
            <a
              className="rounded-[6px] border border-ledger-ink px-3 py-2 font-semibold text-ledger-ink transition hover:bg-ledger-ink hover:text-kraft-paper active:translate-y-px active:bg-manifest-amber active:text-ledger-ink active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2"
              href="/scan"
            >
              Scan
            </a>
            <DownloadPdfButton
              orgName={orgNames}
              pickups={(pickups || []).map((pickup) => ({
                tracking_number: pickup.tracking_number,
                recipient_name: pickup.recipient_name,
                recipient_phone: pickup.recipient_phone,
                scanned_at: pickup.scanned_at,
              }))}
            />
            <form action={logout}>
              <button className="rounded-[6px] border border-ledger-ink px-3 py-2 font-semibold text-ledger-ink transition hover:bg-ledger-ink hover:text-kraft-paper active:translate-y-px active:bg-stamp-red active:text-kraft-paper active:shadow-inner focus-visible:outline-2 focus-visible:outline-offset-2">
                Log out
              </button>
            </form>
          </div>
        </header>

        <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="-rotate-1 border-2 border-manifest-green bg-paper-light px-6 py-5 text-manifest-green shadow-[6px_6px_0_rgba(63,107,78,0.16)]">
            <p className="font-display text-2xl font-extrabold uppercase leading-none">
              Records
            </p>
            <p className="mt-2 font-display text-6xl font-extrabold leading-none">
              {pickups?.length ?? 0}
            </p>
            <p className="mt-1 text-sm font-semibold">visible pickups</p>
          </div>
          <div className="max-w-xl border-t border-dashed border-perforation-grey pt-4 text-sm text-ledger-ink/70 sm:text-right">
            <p>
              {pickups?.length ?? 0} visible record
              {(pickups?.length ?? 0) === 1 ? "" : "s"}
            </p>
            <p className="mt-1 font-mono text-xs">{user.email}</p>
          </div>
        </div>

        {error ? (
          <p className="mt-6 border border-stamp-red bg-paper-light p-3 text-sm text-stamp-red">
            {error.message}
          </p>
        ) : null}

        <div className="mt-8 overflow-x-auto border-y border-perforation-grey">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ledger-ink">
                <th className="py-3 pr-5 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                  Tracking #
                </th>
                <th className="px-5 py-3 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                  Recipient
                </th>
                <th className="px-5 py-3 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                  Phone
                </th>
                <th className="px-5 py-3 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                  Scanned at
                </th>
                <th className="py-3 pl-5 font-mono text-xs font-medium uppercase text-ledger-ink/70">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {pickups?.map((pickup) => (
                <tr
                  className="border-t border-dashed border-perforation-grey"
                  key={`${pickup.org_id}-${pickup.tracking_number}`}
                >
                  <td className="py-4 pr-5 font-mono font-medium text-ledger-ink">
                    {pickup.tracking_number}
                  </td>
                  <td className="px-5 py-4">
                    {pickup.recipient_name || "Unverified"}
                  </td>
                  <td className="px-5 py-4 font-mono">
                    {pickup.recipient_phone || "-"}
                  </td>
                  <td className="px-5 py-4 font-mono text-ledger-ink/75">
                    {formatPickupTimestamp(pickup.scanned_at)}
                  </td>
                  <td className="py-4 pl-5">
                    <span className="font-display text-xl font-extrabold uppercase text-manifest-green">
                      Received
                    </span>
                  </td>
                </tr>
              ))}
              {!pickups?.length ? (
                <tr>
                  <td className="py-8 text-ledger-ink/70" colSpan={5}>
                    No pickups logged yet today.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <section className="mt-8 border-t border-dashed border-perforation-grey pt-4">
          <div>
            <p className="font-mono text-xs font-medium uppercase text-ledger-ink/70">
              Org membership
            </p>
            <p className="mt-1 text-lg font-semibold text-ledger-ink">
              {orgNames}
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
