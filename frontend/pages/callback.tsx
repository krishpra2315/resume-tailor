import { useEffect } from "react";
import { getCurrentUser } from "@aws-amplify/auth";
import { useRouter } from "next/router";

export default function Callback() {
  const router = useRouter();
  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        console.log("Successfully signed in via callback:", user);
        router.push("/");
      })
      .catch((err) => {
        console.error(
          "Error during sign-in callback processing (check network tab for Cognito token exchange issues):",
          err
        );
        router.push("/?error=auth_failed_callback");
      });
  }, [router]);

  return <p>Logging in...</p>;
}
