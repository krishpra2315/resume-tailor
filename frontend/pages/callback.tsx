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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 text-gray-200">
      <p className="text-xl">Logging in...</p>
      {/* You could add the themed Loading component here for better UX */}
      {/* Example: <Loading loadingText="Finalizing login..." /> */}
    </div>
  );
}
