/**
 * NOTBREMSE — /dev-exit
 *
 * Standalone Server-Component AUSSERHALB von (app)/ und /partner/-Layouts.
 * Loescht das View-As-Cookie und redirected zum Dashboard. Wird gebraucht
 * wenn ein Redirect-Loop zwischen (app) und /partner entsteht (z.B. weil
 * effective-role != real-role und beide Layouts sich gegenseitig weg-
 * redirecten). URL im Browser tippen: /dev-exit
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { IMPERSONATE_COOKIE } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export default async function DevExitPage() {
  const store = await cookies();
  store.delete(IMPERSONATE_COOKIE);
  redirect("/dashboard");
}
