import scoreHTTPClient, { GetScoreResponseBody } from "@/http/scoreHTTPClient";
import { Inria_Sans } from "next/font/google";
import Head from "next/head";
import { useState } from "react";
import Link from "next/link";

const inriaSans = Inria_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

export async function getServerSideProps(context: any) {
  const { resultId } = context.params;
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
  if (score >= 80) return "text-green-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
};

// Function to determine score description
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
  const activeTabClass = "bg-white text-black shadow-sm";
  const inactiveTabClass =
    "text-gray-500 hover:text-gray-800 hover:bg-gray-100";

  return (
    <div
      className={`flex flex-col min-h-screen bg-gradient-to-r from-blue-100 via-white to-purple-100 ${inriaSans.className}`}
    >
      <Head>
        <title>Your Score & Feedback - Resume Tailor</title>
        <meta
          name="description"
          content="View your tailored resume score and improvement suggestions."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <nav className="shadow-md w-full py-3 px-6 flex justify-between items-center text-black sticky bg-gradient-to-r from-blue-100 via-white to-purple-100 top-0 z-10">
        <div className="flex flex-1 flex-row items-center gap-4">
          <Link href="/">
            <span className="text-3xl font-bold cursor-pointer">
              Resume Tailor
            </span>
          </Link>
          <span className="text-3xl font-bold">&gt;</span>
          <span className="text-3xl font-bold">Results</span>
        </div>
      </nav>

      <div className="flex flex-1 flex-col lg:flex-row p-4 md:p-8 gap-6 lg:gap-8">
        <div className="flex-1 lg:w-1/2 flex flex-col bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <div className="flex p-1 bg-gray-100 border-b border-gray-200">
            <button
              className={`flex-1 py-2 px-4 text-center font-semibold rounded-md transition-all duration-200 ${
                activeTab === "resume" ? activeTabClass : inactiveTabClass
              }`}
              onClick={() => setActiveTab("resume")}
            >
              Resume
            </button>
            <button
              className={`flex-1 py-2 px-4 text-center font-semibold rounded-md transition-all duration-200 ${
                activeTab === "jobDescription"
                  ? activeTabClass
                  : inactiveTabClass
              }`}
              onClick={() => setActiveTab("jobDescription")}
            >
              Job Description
            </button>
          </div>

          <div className="flex-1 p-1">
            {activeTab === "resume" && (
              <iframe
                src={`${result.fileContent}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                className="w-full h-[80vh] border-0 rounded-lg"
                title="Resume Preview"
              />
            )}
            {activeTab === "jobDescription" && (
              <div className="w-full h-[80vh] bg-white p-4 md:p-6 overflow-y-auto rounded-lg">
                <h3 className="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">
                  Job Description
                </h3>
                <pre className="whitespace-pre-wrap text-sm md:text-base text-gray-700 leading-relaxed font-sans">
                  {result.jobDescription}
                </pre>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 lg:w-1/2 flex flex-col gap-6">
          <div className="w-full bg-white p-6 rounded-xl shadow-lg text-center border border-gray-200 flex flex-col items-center">
            <h2 className="text-2xl font-semibold text-gray-700 mb-1">
              Your Score
            </h2>
            <p className={`text-7xl font-bold ${scoreColor}`}>{result.score}</p>
            <p className={`text-2xl font-semibold mt-2 ${scoreColor}`}>
              {scoreDescription}
            </p>
          </div>

          <div className="flex flex-col gap-4 flex-1">
            <h2 className="text-2xl font-semibold text-gray-700 px-1">
              Feedback & Suggestions
            </h2>
            {result.feedback
              .filter((item) => typeof item === "string" && item.trim() !== "")
              .map((item, index) => (
                <div
                  key={index}
                  className="bg-white p-5 rounded-lg shadow-md border border-gray-200"
                >
                  <p className="text-gray-700 leading-relaxed">{item}</p>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
