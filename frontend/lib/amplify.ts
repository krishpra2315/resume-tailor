import { Amplify } from "aws-amplify";

export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: "us-east-2_c7gmXmRmx",
      userPoolClientId: "3cjdn2n907cjjsq6d71djfd28l",
      loginWith: {
        oauth: {
          domain: "us-east-2c7gmxmrmx.auth.us-east-2.amazoncognito.com",
          scopes: [
            "email",
            "openid",
            "profile",
            "phone",
            "aws.cognito.signin.user.admin",
          ],
          redirectSignIn: [
            "http://localhost:3000/callback",
            "https://resume-tailor-kp.vercel.app/callback",
          ],
          redirectSignOut: [
            "http://localhost:3000",
            "https://resume-tailor-kp.vercel.app",
          ],
          responseType: "code" as const,
        },
      },
    },
  },
};

// Configure Amplify using the exported object
Amplify.configure(amplifyConfig);
