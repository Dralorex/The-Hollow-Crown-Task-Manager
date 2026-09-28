import { redirect } from "next/navigation";

/** Legacy email-link resets redirect into the code-based flow. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await searchParams;
  redirect("/forgot-password");
}
