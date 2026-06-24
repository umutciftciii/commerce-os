import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StoreLoginClient } from "../../components/store-login-client";
import { SESSION_COOKIE_NAME } from "../../lib/server/session";

export default async function LoginPage() {
  const cookieStore = await cookies();
  if (cookieStore.get(SESSION_COOKIE_NAME)?.value) {
    redirect("/");
  }

  return <StoreLoginClient />;
}
