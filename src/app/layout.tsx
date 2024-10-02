import { getServerSession } from "@/utils/auth";
import type { Metadata } from "next";
import "./globals.css";
import RootLayoutProvider from "./layout-provider";

export const metadata: Metadata = {
  title: "Next App with Lucia",
  description:
    "OIDC Authentication with Next.js with lucia and redis for session storage",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, session } = await getServerSession();

  return (
    <RootLayoutProvider
      user={user}
      sessionState={
        session
          ? {
              error: session.error,
              accessTokenExpiresAt: session.accessTokenExpiresAt,
              userId: user.id,
            }
          : undefined
      }
    >
      {children}
    </RootLayoutProvider>
  );
}
