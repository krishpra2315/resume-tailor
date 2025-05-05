import { Inria_Sans } from "next/font/google";
import Head from "next/head";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faChevronLeft,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import { getCurrentUser } from "@aws-amplify/auth";
import type { AuthUser } from "@aws-amplify/auth";
import masterHTTPClient, {
  GetMasterResumeResponseBody,
} from "@/http/masterHTTPClient";
import { fileToBase64 } from "@/utils/upload";
import DismissableAlert from "@/components/DismissableAlert";
import {
  faUpload,
  faSpinner,
  faBriefcase,
  faGraduationCap,
  faLightbulb,
  faFileLines,
} from "@fortawesome/free-solid-svg-icons";

const inriaSans = Inria_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

type ActiveTab = "master" | "tailored";

interface ResumeEntry {
  type: "experience" | "education" | "project" | string;
  title?: string;
  organization?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export default function Dashboard() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [masterResumeUrl, setMasterResumeUrl] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState<boolean>(true);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("master");
  const [resumeEntries, setResumeEntries] = useState<ResumeEntry[] | null>(
    null
  );
  const [jobDescription, setJobDescription] = useState<string>("");
  const [isResumePreviewCollapsed, setIsResumePreviewCollapsed] =
    useState<boolean>(false);

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkUserAndFetchResume = async () => {
      setLoading(true);
      setResumeLoading(true);
      try {
        const currentUser: AuthUser | null = await getCurrentUser();
        setUser(currentUser);

        try {
          const resumeData = await masterHTTPClient.getMasterResume();
          setMasterResumeUrl(resumeData.url);
          setResumeEntries(resumeData.entries);
          setResumeError(null);
        } catch (fetchError: any) {
          console.log("Failed to fetch master resume data:", fetchError);
          if (
            fetchError.message?.includes("404") ||
            fetchError.status === 404
          ) {
            setMasterResumeUrl(null);
            setResumeEntries(null);
            setResumeError(null);
          } else {
            setMasterResumeUrl(null);
            setResumeEntries(null);
            setResumeError(
              "Failed to load master resume data. Please try again later."
            );
          }
        } finally {
          setResumeLoading(false);
        }
      } catch (error) {
        router.push("/");
      } finally {
        setLoading(false);
      }
    };
    checkUserAndFetchResume();
  }, [router]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      setUploadStatus(null);
      const file = event.target.files ? event.target.files[0] : null;
      event.target.value = "";

      if (!file) return;

      if (
        file.type !== "application/pdf" &&
        file.type !==
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
        file.type !== "text/plain"
      ) {
        setUploadStatus({
          message: "Please select a PDF, DOCX, or TXT file.",
          type: "error",
        });
        return;
      }

      setIsUploading(true);
      try {
        const fileBase64 = await fileToBase64(file);
        await masterHTTPClient.processMasterResume(fileBase64);

        const resumeData = await masterHTTPClient.getMasterResume();
        setMasterResumeUrl(resumeData.url);
        setResumeEntries(resumeData.entries);
        setResumeError(null);
        setUploadStatus({
          message: "Master resume uploaded successfully!",
          type: "success",
        });
      } catch (error) {
        console.error("Upload failed:", error);
        setUploadStatus({
          message: "Master resume upload failed. Please try again.",
          type: "error",
        });
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  const handleToggleCollapse = () => {
    setIsResumePreviewCollapsed(!isResumePreviewCollapsed);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div
      className={`flex flex-col min-h-screen bg-gradient-to-r from-blue-100 via-white to-purple-100 ${inriaSans.className}`}
    >
      <Head>
        <title>Dashboard - Resume Tailor</title>
        <meta
          name="description"
          content="View your dashboard to see your master & tailored resumes"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <nav className="shadow-md w-full py-3 px-6 flex justify-between items-center text-black sticky bg-gradient-to-r from-blue-100 via-white to-purple-100 top-0 z-10">
        <div className="flex flex-1 flex-row items-center gap-4">
          <Link href="/">
            <span className="text-2xl font-bold cursor-pointer">
              Resume Tailor
            </span>
          </Link>
          <span className="text-2xl">&gt;</span>
          <span className="text-2xl">Dashboard</span>
        </div>
      </nav>

      {/* Tabs Outside Content Area */}
      <div className="w-xl pl-5 justify-start">
        <button
          onClick={() => setActiveTab("master")}
          className={`flex-1 py-3 px-6 text-center font-semibold rounded-t-md transition-all duration-200 ${
            activeTab === "master"
              ? "bg-white text-black shadow-sm"
              : "text-gray-500 hover:text-gray-800 hover:bg-gray-200"
          }`}
        >
          Master Resume
        </button>
        <button
          onClick={() => setActiveTab("tailored")}
          className={`flex-1 py-3 px-6 text-center font-semibold rounded-t-md transition-all duration-200 ${
            activeTab === "tailored"
              ? "bg-white text-black shadow-sm"
              : "text-gray-500 hover:text-gray-800 hover:bg-gray-200"
          }`}
        >
          Tailored Resumes
        </button>
      </div>

      <div className="flex-1 flex flex-col p-8 justify-start items-center bg-white mx-2 mb-2 rounded-xl">
        {activeTab === "master" && (
          <>
            <div className="w-full max-w-6xl mb-4">
              {uploadStatus && (
                <DismissableAlert
                  message={uploadStatus.message}
                  type={uploadStatus.type}
                  onDismiss={() => setUploadStatus(null)}
                />
              )}
            </div>

            <div className="flex flex-col lg:flex-row w-full">
              {/* Left Column: Resume Preview & Upload (Collapsible) */}
              <div
                className={`flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
                  isResumePreviewCollapsed
                    ? "w-full lg:w-0 lg:opacity-0 lg:mr-0 lg:p-0 lg:border-0"
                    : "w-full lg:w-1/3 mr-6"
                }`}
              >
                <div className="flex-1 flex flex-col min-h-[60vh]">
                  {resumeLoading ? (
                    <div className="flex-1 flex justify-center items-center text-gray-600 bg-gray-50 rounded-lg border border-gray-200">
                      <div>
                        <FontAwesomeIcon icon={faSpinner} spin size="2x" />
                        <p className="mt-2">Loading Master Resume...</p>
                      </div>
                    </div>
                  ) : resumeError && !masterResumeUrl ? (
                    <div className="flex-1 flex justify-center items-center text-center text-red-600 bg-red-100 p-4 rounded-md border border-red-300">
                      <p>{resumeError}</p>
                    </div>
                  ) : masterResumeUrl ? (
                    <div className="w-full h-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                      <iframe
                        src={`${masterResumeUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                        className="w-full h-full border-0 min-h-[60vh]"
                        title="Master Resume Preview"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col justify-center items-center bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-10 text-center">
                      <FontAwesomeIcon
                        icon={faUpload}
                        className="text-gray-400 text-5xl mb-4"
                      />
                      <p className="text-xl font-semibold text-gray-600 mb-2">
                        No Master Resume Uploaded
                      </p>
                      <p className="text-gray-500 mb-6">
                        Upload your master resume (PDF, DOCX, or TXT) to view it
                        and see extracted items.
                      </p>
                    </div>
                  )}
                  {!resumeLoading && (
                    <div className="mt-4 w-full flex justify-center">
                      <button
                        onClick={handleUploadClick}
                        className={`px-6 py-3 text-sm font-semibold text-white bg-blue-500 rounded-md shadow hover:bg-blue-600 transition duration-200 ease-in-out flex items-center gap-2 ${
                          isUploading ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <>
                            <FontAwesomeIcon icon={faSpinner} spin />{" "}
                            Uploading...
                          </>
                        ) : masterResumeUrl ? (
                          <>
                            <FontAwesomeIcon icon={faUpload} /> Replace
                          </>
                        ) : (
                          <>
                            <FontAwesomeIcon icon={faUpload} /> Upload
                          </>
                        )}
                      </button>
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".pdf,.docx,.txt"
                        onChange={handleFileChange}
                        disabled={isUploading}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Collapse Button */}
              <button
                onClick={handleToggleCollapse}
                className={`text-white bg-blue-500 h-10 w-10 rounded-full my-auto hover:bg-blue-600 lg:inline-block hidden p-1 mr-4 transition-all duration-300 ease-in-out ml-[-40px]`}
                aria-label={
                  isResumePreviewCollapsed
                    ? "Expand Preview"
                    : "Collapse Preview"
                }
              >
                <FontAwesomeIcon
                  icon={
                    isResumePreviewCollapsed ? faChevronRight : faChevronLeft
                  }
                  size="lg"
                />
              </button>

              {/* Middle Column: Extracted Items */}
              <div
                className={`flex flex-col mr-6 transition-[width] duration-300 ease-in-out ${
                  isResumePreviewCollapsed
                    ? "w-full lg:w-2/3"
                    : "w-full lg:w-1/3"
                }`}
              >
                <h2 className="text-2xl font-semibold text-gray-700 mb-4 flex justify-between items-center">
                  Resume Items
                </h2>
                <div className="flex-1 bg-gray-50 p-4 rounded-lg border border-gray-200 overflow-y-auto max-h-[70vh]">
                  {resumeLoading ? (
                    <div className="flex justify-center items-center h-full text-gray-500">
                      <FontAwesomeIcon icon={faSpinner} spin size="lg" />
                      <span className="ml-2">Loading items...</span>
                    </div>
                  ) : resumeError && !resumeEntries ? (
                    <div className="text-center text-red-500 p-4">
                      Failed to load extracted items. {resumeError}
                    </div>
                  ) : !masterResumeUrl ? (
                    <div className="text-center text-gray-500 p-4">
                      Upload a master resume to see extracted items.
                    </div>
                  ) : resumeEntries && resumeEntries.length > 0 ? (
                    <div
                      className={`${
                        isResumePreviewCollapsed
                          ? "grid grid-cols-1 md:grid-cols-2 gap-4"
                          : "space-y-4"
                      }`}
                    >
                      {resumeEntries.map((entry, index) => {
                        if (entry.type !== "userInfo") {
                          return <EntryCard key={index} entry={entry} />;
                        }
                      })}
                    </div>
                  ) : resumeEntries ? (
                    <div className="text-center text-gray-500 p-4">
                      No items were extracted from the resume. This might be due
                      to the document format or content.
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 p-4">
                      Waiting for items...
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Job Description Input */}
              <div className="w-full lg:w-1/3 flex flex-col">
                <h2 className="text-2xl font-semibold text-gray-700 mb-4">
                  Tailor Resume
                </h2>
                <div className="flex-1 flex flex-col">
                  <textarea
                    id="jobDescription"
                    className="p-4 text-black border border-gray-300 rounded-lg bg-white shadow w-full h-full resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Paste job description..."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    disabled={!masterResumeUrl || isUploading}
                  />
                  <button
                    // onClick={handleTailorClick} // Add functionality later
                    className={`mt-4 w-full px-4 py-2 text-md font-semibold text-white bg-green-600 rounded-md shadow hover:bg-green-700 transition duration-200 ease-in-out flex items-center justify-center gap-2 ${
                      !masterResumeUrl || !jobDescription || isUploading
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    disabled={
                      !masterResumeUrl || !jobDescription || isUploading
                    } // Disable if no resume, no JD, or uploading
                  >
                    Tailor
                  </button>
                  {!masterResumeUrl && (
                    <p className="text-xs text-center text-gray-500 mt-2">
                      Upload a master resume first.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "tailored" && (
          <div className="w-full max-w-4xl flex-1 flex flex-col items-center justify-center">
            <h1 className="text-4xl font-bold mb-8 text-gray-800">
              Tailored Resumes
            </h1>
            <p className="text-gray-600">
              Tailored resumes content will go here.
            </p>
            {/* Placeholder for tailored resumes list or creation */}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper Component for Entry Card
const EntryCard = ({ entry }: { entry: ResumeEntry }) => {
  const getIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "experience":
        return faBriefcase;
      case "education":
        return faGraduationCap;
      case "project":
        return faLightbulb;
      default:
        return faFileLines; // Generic icon for unknown types
    }
  };

  const icon = getIcon(entry.type);

  return (
    <div className="bg-white p-4 rounded-lg shadow border border-gray-200 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center mb-2">
        <FontAwesomeIcon icon={icon} className="text-blue-500 mr-3 text-xl" />
        <div>
          <h3 className="font-semibold text-lg text-gray-800">
            {entry.title || "Untitled Item"}
          </h3>
          {entry.organization && (
            <p className="text-sm text-gray-600">{entry.organization}</p>
          )}
        </div>
      </div>
      {(entry.startDate || entry.endDate) && (
        <p className="text-xs text-gray-500 mb-2">
          {entry.startDate} {entry.startDate && entry.endDate && " - "}{" "}
          {entry.endDate}
        </p>
      )}
      {entry.description && (
        <ul className="text-sm text-gray-700 list-disc pl-5">
          {entry.description.split("\n").map(
            (point, index) =>
              point.trim() && (
                <li key={index} className="mb-1">
                  {point.trim()}
                </li>
              )
          )}
        </ul>
      )}
      <p className="text-xs text-gray-400 mt-2 capitalize">
        Type: {entry.type}
      </p>
    </div>
  );
};
