"use client";

import { NextPage } from "next";
import { useEffect } from "react";

const ErrorPage: NextPage = () => {
  useEffect(() => {
    window.parent.postMessage(
      { type: "sso-check", sso: false },
      process.env.NEXT_PUBLIC_FULL_APP_URL!
    );
  }, []);

  return <h1>Error on siging process</h1>;
};

export default ErrorPage;
