"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function requiredString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function createOrg(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const name = requiredString(formData, "name");

  if (!name) {
    redirect("/admin?error=Org name is required.");
  }

  const { error } = await supabase.from("orgs").insert({ name });

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  redirect("/admin?message=Org created.");
}

export async function updateMemberDisplayName(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const memberId = requiredString(formData, "member_id");
  const displayName = requiredString(formData, "display_name");
  const orgId = requiredString(formData, "org_id");

  if (!memberId || !displayName) {
    redirect("/admin?error=Staff member and display name are required.");
  }

  const { error } = await supabase
    .from("org_members")
    .update({ display_name: displayName })
    .eq("id", memberId);

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  redirect(`/admin?${orgId ? `org=${orgId}&` : ""}message=Staff updated.`);
}

export async function removeMember(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const memberId = requiredString(formData, "member_id");
  const orgId = requiredString(formData, "org_id");

  if (!memberId) {
    redirect("/admin?error=Staff member is required.");
  }

  const { error } = await supabase
    .from("org_members")
    .delete()
    .eq("id", memberId);

  if (error) {
    redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin");
  redirect(`/admin?${orgId ? `org=${orgId}&` : ""}message=Staff removed.`);
}
