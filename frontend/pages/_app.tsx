import "@/styles/globals.css";
import "@/lib/amplify";
import { Hub } from "aws-amplify/utils";
import { useEffect } from "react";

import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    const hubListenerCancel = Hub.listen("auth", (data) => {
      console.log(
        "Amplify Hub [auth event]:",
        data.payload.event,
        data.payload
      );
    });

    Hub.listen("api", (data) => {
      console.log("Amplify Hub [api event]:", data.payload.event, data.payload);
    });

    Hub.listen("storage", (data) => {
      console.log(
        "Amplify Hub [storage event]:",
        data.payload.event,
        data.payload
      );
    });

    const allMessagesListenerCancel = Hub.listen("core", (data) => {
      console.log(
        "Amplify Hub [core event]:",
        data.payload.event,
        data.payload
      );
    });

    return () => {
      hubListenerCancel();
      allMessagesListenerCancel();
    };
  }, []);

  return <Component {...pageProps} />;
}
