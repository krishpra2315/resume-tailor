import scoreHTTPClient, { GetScoreResponseBody } from "@/http/scoreHTTPClient";
import { Inria_Sans } from "next/font/google";
import Head from "next/head";
import { useState } from "react";
import Link from "next/link";
import { GetServerSidePropsContext } from "next";

const inriaSans = Inria_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const { resultId } = context.params as { resultId: string };
  try {
    const result: GetScoreResponseBody = await scoreHTTPClient.getScore(
      resultId
    );
    return {
      props: { result },
    };
  } catch (error) {
    console.error("Failed to fetch score:", error);
    return { notFound: true };
  }
}

const getScoreColor = (score: number): string => {
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
};

const getScoreDescription = (score: number): string => {
  if (score >= 85) return "Great!";
  if (score >= 70) return "Good!";
  if (score >= 50) return "Okay";
  return "Needs Improvement";
};

export default function ScorePage({
  result,
}: {
  result: GetScoreResponseBody;
}) {
  const [activeTab, setActiveTab] = useState<"resume" | "jobDescription">(
    "resume"
  );
  const scoreColor = getScoreColor(result.score);
  const scoreDescription = getScoreDescription(result.score);

  // Tab styles
  const activeTabClass = "bg-purple-600 text-white shadow-md";
  const inactiveTabClass =
    "text-gray-400 hover:text-purple-300 hover:bg-slate-700/50";

  return (
    <div
      className={`flex flex-col min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 text-gray-200 ${inriaSans.className}`}
    >
      <Head>
        <title>Your Score & Feedback - Resume Tailor</title>
        <meta
          name="description"
          content="View your tailored resume score and improvement suggestions."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <nav className="shadow-lg w-full py-4 px-8 flex justify-between items-center text-white sticky top-0 z-50 bg-slate-800/30 backdrop-blur-md">
        <div className="flex flex-1 flex-row items-center gap-4">
          <Link href="/">
            <span className="text-2xl font-bold cursor-pointer hover:text-purple-300">
              Resume Tailor
            </span>
          </Link>
          <span className="text-2xl text-gray-500">&gt;</span>
          <span className="text-2xl text-gray-200">Results</span>
        </div>
      </nav>

      <div className="flex flex-1 flex-col lg:flex-row pt-2 px-2 gap-6 lg:gap-8">
        <div className="flex-1 lg:w-1/2 h-[90vh] flex flex-col bg-slate-800/50 backdrop-blur-md rounded-xl shadow-xl border border-slate-700 overflow-hidden">
          <div className="flex p-1 bg-slate-700/30 border-b border-slate-600">
            <button
              className={`flex-1 py-2.5 px-4 text-center font-semibold rounded-md transition-all duration-200 ${
                activeTab === "resume" ? activeTabClass : inactiveTabClass
              }`}
              onClick={() => setActiveTab("resume")}
            >
              Resume
            </button>
            <button
              className={`flex-1 py-2.5 px-4 text-center font-semibold rounded-md transition-all duration-200 ${
                activeTab === "jobDescription"
                  ? activeTabClass
                  : inactiveTabClass
              }`}
              onClick={() => setActiveTab("jobDescription")}
            >
              Job Description
            </button>
          </div>

          <div className="flex-1">
            {activeTab === "resume" && (
              <iframe
                src={`${result.fileContent}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                className="w-full h-[84vh] border-0 rounded-lg"
                title="Resume Preview"
              />
            )}
            {activeTab === "jobDescription" && (
              <div className="w-full bg-slate-800 p-4 md:p-6 overflow-y-scroll rounded-lg">
                <h3 className="text-xl font-semibold mb-4 text-white border-b border-slate-600 pb-2">
                  Job Description
                </h3>
                <pre className="whitespace-pre-wrap text-sm md:text-base text-gray-300 leading-relaxed font-sans">
                  {result.jobDescription}
                </pre>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 lg:w-1/2 flex flex-col h-[90vh] gap-3">
          <div className="w-full bg-slate-800/50 backdrop-blur-md p-6 rounded-xl shadow-xl text-center border border-slate-700 flex flex-col items-center">
            <h2 className="text-2xl font-semibold text-white mb-1">
              Your Score
            </h2>
            <p className={`text-7xl font-bold ${scoreColor}`}>{result.score}</p>
            <p className={`text-2xl font-semibold mt-2 ${scoreColor}`}>
              {scoreDescription}
            </p>
          </div>

          <h2 className="text-2xl font-semibold text-white px-1">
            Feedback & Suggestions
          </h2>
          <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
            {result.feedback
              .filter((item) => typeof item === "string" && item.trim() !== "")
              .map((item, index) => (
                <div
                  key={index}
                  className="bg-slate-700/50 hover:bg-slate-600/50 p-5 rounded-lg shadow-lg border border-slate-600 backdrop-blur-sm"
                >
                  <p className="text-gray-300 leading-relaxed">{item}</p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
