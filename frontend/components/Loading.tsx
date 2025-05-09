import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { Inria_Sans } from "next/font/google";

const inriaSans = Inria_Sans({
  subsets: ["latin"],
  weight: ["400", "700"],
});

const Loading: React.FC<{ loadingText?: string }> = ({ loadingText }) => {
  return (
    <div
      className={`flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 text-gray-200 ${inriaSans.className}`}
    >
      <FontAwesomeIcon
        icon={faSpinner}
        spin
        size="3x"
        className="text-sky-400 mb-4"
      />
      <p className="text-xl font-semibold">
        {loadingText || "Loading, please wait..."}
      </p>
    </div>
  );
};

export default Loading;
