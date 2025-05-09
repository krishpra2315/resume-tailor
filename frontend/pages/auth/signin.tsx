import React, { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { signIn } from "@aws-amplify/auth";
import { Amplify } from "aws-amplify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSignInAlt, faSpinner } from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";

const SignInPage: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    console.log(
      "Vercel @ handleSignIn: Attempting signIn with username:",
      username
    );

    // Log current Amplify config right before calling signIn
    try {
      const currentConfig = Amplify.getConfig();
      console.log(
        "Vercel @ handleSignIn: Current Amplify Auth Config:",
        currentConfig.Auth
      );
    } catch (configError) {
      console.error(
        "Vercel @ handleSignIn: Error getting Amplify config:",
        configError
      );
    }

    try {
      const signInPromise = signIn({ username, password });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("SignIn timed out after 15 seconds")),
          15000
        )
      );

      const result = await Promise.race([signInPromise, timeoutPromise]);

      // If we reach here, signInPromise resolved before timeout
      // @ts-expect-error could be a timeout error or a signIn error
      const { isSignedIn, nextStep } = result;

      console.log("Vercel @ handleSignIn: signIn() output:", {
        isSignedIn,
        nextStep,
      });

      if (isSignedIn) {
        const redirectPath = (router.query.redirect as string) || "/dashboard";
        console.log(
          "Vercel @ handleSignIn: isSignedIn is true. Redirecting to:",
          redirectPath
        );
        router.push(redirectPath);
      } else {
        console.log(
          "Vercel @ handleSignIn: isSignedIn is false. Next step:",
          nextStep
        );
        setError(
          "Sign-in successful, but further steps might be required. Please check console."
        );
        // Potentially redirect to a page to handle nextStep, e.g., MFA
        // router.push(`/auth/confirm-signin?username=${username}`);
      }
    } catch (err) {
      // Catch block will now also catch the timeout error
      console.error(
        "Vercel @ handleSignIn: Error signing in (or timeout):",
        err
      );
      if ((err as Error).message === "SignIn timed out after 15 seconds") {
        setError(
          "Sign-in attempt timed out. Please check your network or try again."
        );
      } else {
        setError(
          (err as Error).message ||
            "An unexpected error occurred. Please try again."
        );
      }
    } finally {
      console.log("Vercel @ handleSignIn: finally block.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-gray-200 py-12 px-4 sm:px-6 lg:px-8">
      <Head>
        <title>Sign In - Resume Tailor</title>
      </Head>
      <div className="max-w-md w-full space-y-8 bg-slate-700/50 backdrop-blur-md shadow-2xl p-10 rounded-xl">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
            Sign in to your account
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSignIn}>
          <input type="hidden" name="remember" defaultValue="true" />
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">
                Email address or Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-600 bg-slate-800 placeholder-gray-500 text-gray-200 rounded-t-md focus:outline-none focus:ring-sky-500 focus:border-sky-500 focus:z-10 sm:text-sm"
                placeholder="Email address or Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-600 bg-slate-800 placeholder-gray-500 text-gray-200 rounded-b-md focus:outline-none focus:ring-sky-500 focus:border-sky-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          {error && (
            <div
              className="bg-red-700/30 border border-red-500 text-red-300 px-4 py-3 rounded relative backdrop-blur-sm"
              role="alert"
            >
              <span className="block sm:inline">{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            {/* TODO: Implement forgot password functionality if desired, then re-enable this link.
            <div className="text-sm">
              <Link href="/auth/forgot-password">
                <span className="font-medium text-sky-400 hover:text-sky-300 cursor-pointer">
                  Forgot your password?
                </span>
              </Link>
            </div>
            */}
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 focus:ring-offset-slate-800 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <FontAwesomeIcon
                    icon={faSpinner}
                    spin
                    className="mr-2 text-white"
                  />
                  Signing In...
                </>
              ) : (
                <>
                  <FontAwesomeIcon
                    icon={faSignInAlt}
                    className="mr-2 text-white"
                  />
                  Sign In
                </>
              )}
            </button>
          </div>
        </form>
        <div className="text-sm text-center mt-4">
          <p className="text-gray-400">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup">
              <span className="font-medium text-sky-400 hover:text-sky-300 cursor-pointer">
                Sign Up
              </span>
            </Link>
          </p>
        </div>
        <div className="text-sm text-center mt-2">
          <Link href="/">
            <span className="font-medium text-sky-400 hover:text-sky-300 cursor-pointer">
              Back to Home
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SignInPage;
