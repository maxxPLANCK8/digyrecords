import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScanClient } from "./scan-client";

type MembershipRow = {
  id: string;
  org_id: string;
  display_name: string;
  orgs?: { name?: string } | { name?: string }[] | null;
};

function orgNameFor(membership: MembershipRow) {
  if (Array.isArray(membership.orgs)) {
    return membership.orgs[0]?.name;
  }

  return membership.orgs?.name;
}

export default async function ScanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships, error } = await supabase
    .from("org_members")
    .select("id, org_id, display_name, orgs(name)")
    .eq("user_id", user.id)
    .limit(1);

  const membership = (memberships?.[0] ?? null) as MembershipRow | null;

  if (error || !membership) {
    return (
      <main className="min-h-screen bg-stone-50 px-6 py-8 text-zinc-950">
        <section className="mx-auto max-w-2xl">
          <Link className="text-sm font-semibold text-emerald-700" href="/">
            ParcelLog
          </Link>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight">
            No org membership
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            This account is logged in, but it is not linked to a pickup org yet.
          </p>
        </section>
      </main>
    );
  }

  return (
    <ScanClient
      displayName={membership.display_name}
      orgId={membership.org_id}
      orgName={orgNameFor(membership) ?? "Pickup org"}
      orgMemberId={membership.id}
      userEmail={user.email ?? ""}
    />
  );
}
