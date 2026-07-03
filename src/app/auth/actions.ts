"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function requiredString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = requiredString(formData, "email");
  const password = requiredString(formData, "password");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const email = requiredString(formData, "email");
  const password = requiredString(formData, "password");
  const displayName = requiredString(formData, "display_name");
  const mode = requiredString(formData, "org_mode");
  const orgId = requiredString(formData, "org_id");
  const orgName = requiredString(formData, "org_name");

  if (mode === "join" && !orgId) {
    redirect("/signup?error=Org invite code is required.");
  }

  if (mode === "create" && !orgName) {
    redirect("/signup?error=Org name is required to create a new org.");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        org_mode: mode,
        org_id: mode === "join" ? orgId : undefined,
        org_name: mode === "create" ? orgName : undefined,
      },
    },
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  if (!data.user?.id || !data.session) {
    redirect("/login?message=Account created. Log in to continue.");
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
