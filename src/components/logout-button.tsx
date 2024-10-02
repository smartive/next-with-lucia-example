"use client";

import { logout } from "@/utils/session-actions";

export const LogoutButton = () => {
  return <button onClick={async () => await logout(false)}>Logout</button>;
};
