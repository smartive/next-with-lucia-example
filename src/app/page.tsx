import { LoginButton } from "@/components/login-button";
import { LogoutButton } from "@/components/logout-button";
import { getServerSession } from "@/utils/auth";

export default async function Home() {
  const session = await getServerSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <p className="m-0">
          <span className="text-2xl font-semibold">Next.js with Lucia</span>
          <span className="block text-xs opacity-50">
            OIDC Authentication with Next.js with lucia and redis for session
            storage
          </span>
        </p>
      </div>

      {session.user ? (
        <div className="flex flex-col pt-2 gap-4">
          <h1>Logged in</h1>
          <h2>{session.user.fullName}</h2>
          <LogoutButton />
        </div>
      ) : (
        <div className="flex flex-col pt-2 gap-4">
          <h1>Not logged in</h1>
          <LoginButton />
        </div>
      )}
    </main>
  );
}
