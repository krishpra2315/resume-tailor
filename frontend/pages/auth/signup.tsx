import React, { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { signUp, confirmSignUp, autoSignIn } from "@aws-amplify/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserPlus,
  faSpinner,
  faCheckCircle,
} from "@fortawesome/free-solid-svg-icons";
import Link from "next/link";

type SignUpStep = "DETAILS" | "CONFIRM";

const SignUpPage: React.FC = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");

  const [currentStep, setCurrentStep] = useState<SignUpStep>("DETAILS");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const router = useRouter();

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { nextStep } = await signUp({
        username,
        password,
        options: {
          userAttributes: {
            email,
            name,
          },
          autoSignIn: true, // Attempts to auto sign-in after confirmation
        },
      });

      if (nextStep.signUpStep === "CONFIRM_SIGN_UP") {
        setCurrentStep("CONFIRM");
        setSuccessMessage(
          "Confirmation code sent to your email. Please check your inbox (and spam folder)."
        );
      } else if (nextStep.signUpStep === "COMPLETE_AUTO_SIGN_IN") {
        setSuccessMessage("Sign up successful! Redirecting...");
        await handleAutoSignIn();
      } else {
        setSuccessMessage("Sign up process initiated.");
      }
    } catch (err) {
      console.error("Error signing up:", err);
      setError(
        (err as Error).message ||
          "An unexpected error occurred during sign up. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await confirmSignUp({ username, confirmationCode });
      setSuccessMessage(
        "Account confirmed successfully! Attempting to sign you in..."
      );
      await handleAutoSignIn();
    } catch (err) {
      console.error("Error confirming sign up:", err);
      setError(
        (err as Error).message ||
          "Invalid confirmation code or an error occurred. Please try again."
      );
      setIsLoading(false);
    }
  };

  const handleAutoSignIn = async () => {
    console.log("Vercel @ handleAutoSignIn: Attempting autoSignIn...");
    try {
      const signInOutput = await autoSignIn();
      console.log(
        "Vercel @ handleAutoSignIn: autoSignIn() output:",
        signInOutput
      );
      if (signInOutput.isSignedIn) {
        setSuccessMessage(
          "Sign up and sign in successful! Redirecting to dashboard..."
        );
        console.log(
          "Vercel @ handleAutoSignIn: isSignedIn is true. Redirecting to /dashboard."
        );
        router.push("/dashboard");
      } else {
        setSuccessMessage("Account confirmed. Please sign in.");
        console.log(
          "Vercel @ handleAutoSignIn: isSignedIn is false. Next step:",
          signInOutput.nextStep,
          "Redirecting to /auth/signin."
        );
        router.push("/auth/signin");
      }
    } catch (error) {
      console.error(
        "Vercel @ handleAutoSignIn: Error during autoSignIn:",
        error
      );
      setError("Auto sign-in failed. Please try signing in manually.");
      router.push(
        "/auth/signin?message=confirmation_successful_please_sign_in"
      );
    } finally {
      console.log("Vercel @ handleAutoSignIn: finally block.");
      setIsLoading(false);
    }
  };

  const renderDetailsForm = () => (
    <form className="mt-8 space-y-6" onSubmit={handleSignUp}>
      <div className="rounded-md shadow-sm -space-y-px">
        <div>
          <label htmlFor="full-name-signup" className="sr-only">
            Full Name
          </label>
          <input
            id="full-name-signup"
            name="name"
            type="text"
            autoComplete="name"
            required
            className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <div>
          <label htmlFor="username-signup" className="sr-only">
            Username
          </label>
          <input
            id="username-signup"
            name="username"
            type="text"
            autoComplete="username"
            required
            className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <div>
          <label htmlFor="email-address-signup" className="sr-only">
            Email address
          </label>
          <input
            id="email-address-signup"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <div>
          <label htmlFor="password-signup" className="sr-only">
            Password
          </label>
          <input
            id="password-signup"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
          />
        </div>
      </div>

      {error && (
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mt-4"
          role="alert"
        >
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      {successMessage && !error && (
        <div
          className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mt-4"
          role="alert"
        >
          <FontAwesomeIcon icon={faCheckCircle} className="mr-2" />
          {successMessage}
        </div>
      )}

      <div>
        <button
          type="submit"
          className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
              Creating Account...
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faUserPlus} className="mr-2" />
              Create Account
            </>
          )}
        </button>
      </div>
    </form>
  );

  const renderConfirmForm = () => (
    <form className="mt-8 space-y-6" onSubmit={handleConfirmSignUp}>
      <p className="text-center text-gray-700">
        A confirmation code was sent to{" "}
        <span className="font-medium">{email}</span>. Please enter it below.
      </p>
      <div className="rounded-md shadow-sm">
        <label htmlFor="confirmation-code" className="sr-only">
          Confirmation Code
        </label>
        <input
          id="confirmation-code"
          name="confirmationCode"
          type="text"
          required
          className="appearance-none rounded-md relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
          placeholder="Confirmation Code"
          value={confirmationCode}
          onChange={(e) => setConfirmationCode(e.target.value)}
          disabled={isLoading}
        />
      </div>

      {error && (
        <div
          className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mt-4"
          role="alert"
        >
          <span className="block sm:inline">{error}</span>
        </div>
      )}
      {successMessage && !error && (
        <div
          className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative mt-4"
          role="alert"
        >
          <FontAwesomeIcon icon={faCheckCircle} className="mr-2" />
          {successMessage}
        </div>
      )}

      <div>
        <button
          type="submit"
          className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
              Confirming...
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faCheckCircle} className="mr-2" />
              Confirm Account
            </>
          )}
        </button>
      </div>
      <div className="text-sm text-center">
        <button
          type="button"
          onClick={() => setCurrentStep("DETAILS")}
          className="font-medium text-blue-600 hover:text-blue-500"
          disabled={isLoading}
        >
          Back to sign up details
        </button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-r from-blue-100 via-white to-purple-100 py-12 px-4 sm:px-6 lg:px-8">
      <Head>
        <title>Sign Up - Resume Tailor</title>
      </Head>
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-xl">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {currentStep === "DETAILS"
              ? "Create your account"
              : "Confirm your account"}
          </h2>
        </div>

        {currentStep === "DETAILS" ? renderDetailsForm() : renderConfirmForm()}

        <div className="text-sm text-center mt-4">
          <p className="text-gray-600">
            {currentStep === "DETAILS"
              ? "Already have an account?"
              : "Changed your mind?"}{" "}
            <Link href="/auth/signin">
              <span className="font-medium text-blue-600 hover:text-blue-500 cursor-pointer">
                Sign In
              </span>
            </Link>
          </p>
        </div>
        <div className="text-sm text-center mt-2">
          <Link href="/">
            <span className="font-medium text-blue-600 hover:text-blue-500 cursor-pointer">
              Back to Home
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SignUpPage;
