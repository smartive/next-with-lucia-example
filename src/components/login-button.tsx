"use client";

import { login } from "@/utils/session-actions";

export const LoginButton = () => {
  return <button onClick={async () => await login()}>Login</button>;
};
