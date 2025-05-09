import React, { useState, useEffect } from "react";
import { Amplify } from "aws-amplify";
import { signIn } from "@aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

// Hardcoded config for this minimal test page ONLY
const minimalAmplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: "us-east-2_c7gmXmRmx", // YOUR User Pool ID
      userPoolClientId: "3cjdn2n907cjjsq6d71djfd28l", // YOUR User Pool Client ID
    },
  },
};

const MinimalSignInPage: React.FC = () => {
  const [message, setMessage] = useState("Minimal Sign-In Test Page");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    console.log("MinimalSignInPage: Configuring Amplify for this page...");
    try {
      Amplify.configure(minimalAmplifyConfig);
      console.log(
        "MinimalSignInPage: Amplify configured on this page. Current Auth config:",
        Amplify.getConfig().Auth
      );
    } catch (e) {
      console.error(
        "MinimalSignInPage: Error configuring Amplify on this page",
        e
      );
      setMessage("Error configuring Amplify on this page. Check console.");
      return;
    }

    const hubListener = Hub.listen("auth", ({ payload }) => {
      console.log(
        `MinimalSignInPage: Hub Auth Event: ${payload.event}`,
        payload
      );
      setMessage(
        `Hub Auth Event: ${payload.event} - Check console for details`
      );
    });

    console.log("MinimalSignInPage: Hub listener for 'auth' attached.");

    return () => {
      console.log("MinimalSignInPage: Cleaning up Hub listener.");
      hubListener();
    };
  }, []);

  const handleMinimalSignIn = async () => {
    setIsLoading(true);
    setMessage("Attempting minimal sign-in...");
    console.log(
      "MinimalSignInPage @ handleMinimalSignIn: Attempting signIn..."
    );

    try {
      const currentConfig = Amplify.getConfig();
      console.log(
        "MinimalSignInPage @ handleMinimalSignIn: Current Amplify Auth Config before signIn call:",
        currentConfig.Auth
      );

      console.log(
        "MinimalSignInPage @ handleMinimalSignIn: BEFORE actual signIn() call."
      );
      // Use placeholder credentials, or credentials you know are valid but expect to fail if necessary
      // The goal is to see if signIn even tries or if it hangs before that.
      const output = await signIn({
        username: "testuser@example.com",
        password: "TestPassword123!",
      });
      console.log(
        "MinimalSignInPage @ handleMinimalSignIn: AFTER actual signIn() call. Output:",
        output
      );
      setMessage(
        `Sign-in attempt completed. isSignedIn: ${
          output.isSignedIn
        }. Next step: ${output.nextStep?.signInStep || "N/A"}`
      );
    } catch (error: any) {
      console.error(
        "MinimalSignInPage @ handleMinimalSignIn: Error during signIn:",
        error
      );
      setMessage(`Error during sign-in: ${error.message}. Check console.`);
    } finally {
      console.log("MinimalSignInPage @ handleMinimalSignIn: finally block.");
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{ padding: "20px", fontFamily: "sans-serif", textAlign: "center" }}
    >
      <h1>Minimal Sign-In Test</h1>
      <p>{message}</p>
      <button
        onClick={handleMinimalSignIn}
        disabled={isLoading}
        style={{ padding: "10px 20px", fontSize: "16px" }}
      >
        {isLoading ? "Signing In..." : "Attempt Sign-In"}
      </button>
      <div
        style={{
          marginTop: "20px",
          textAlign: "left",
          maxHeight: "300px",
          overflowY: "auto",
          border: "1px solid #ccc",
          padding: "10px",
        }}
      >
        <p>Console logs should appear here and in your browser's dev tools.</p>
      </div>
    </div>
  );
};

export default MinimalSignInPage;
