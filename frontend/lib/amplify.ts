import { Amplify } from "aws-amplify";

export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: "us-east-2_c7gmXmRmx",
      userPoolClientId: "3cjdn2n907cjjsq6d71djfd28l",
    },
  },
};

// Configure Amplify using the exported object
Amplify.configure(amplifyConfig);
