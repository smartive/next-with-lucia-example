"use client";

import { useSession } from "@/utils/use-session";
import { NextPage } from "next";
import { useEffect } from "react";

const SingleSignOnCheckedPage: NextPage = () => {
  const { user } = useSession();
  useEffect(() => {
    window.parent.postMessage(
      { type: "sso-check", sso: user !== null },
      process.env.NEXT_PUBLIC_FULL_APP_URL!
    );
  }, []);

  return <h1>Checking Single Sign-On...</h1>;
};

export default SingleSignOnCheckedPage;
