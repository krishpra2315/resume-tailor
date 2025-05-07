import { Inria_Sans } from "next/font/google";
import Head from "next/head";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faChevronLeft,
  faDownload,
  faSave,
  faFileWord,
} from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import { getCurrentUser } from "@aws-amplify/auth";
import type { AuthUser } from "@aws-amplify/auth";
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
import masterHTTPClient from "@/http/masterHTTPClient";
import ResumeView, { ResumeViewHandles } from "@/components/ResumeView";
import scoreHTTPClient from "@/http/scoreHTTPClient";
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
  const [isTailoring, setIsTailoring] = useState<boolean>(false);
  const [viewTailoredResume, setViewTailoredResume] = useState<boolean>(false);
  const [tailoredResumeEntries, setTailoredResumeEntries] = useState<
    ResumeEntry[]
  >([]);
  const [isSavingPdf, setIsSavingPdf] = useState<boolean>(false);
  const [savePdfStatus, setSavePdfStatus] = useState<string | null>(null);
  const [savePdfFilename, setSavePdfFilename] = useState<string>("");
  const [savePdfPath, setSavePdfPath] = useState<string | null>(null);

  const [isScoring, setIsScoring] = useState<boolean>(false);

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resumeViewRef = useRef<ResumeViewHandles>(null);

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

  const handleTailorClick = async () => {
    try {
      setIsTailoring(true);
      const response = await masterHTTPClient.tailorMasterResume(
        jobDescription
      );
      setTailoredResumeEntries(response.resumeItems);
      setIsTailoring(false);
      setViewTailoredResume(true);
    } catch (error) {
      console.error("Tailor failed:", error);
    } finally {
      setIsTailoring(false);
    }
  };

  const handleDownloadPdf = () => {
    if (resumeViewRef.current) {
      if (savePdfFilename === "") {
        resumeViewRef.current.downloadAsPdf();
      } else {
        resumeViewRef.current.downloadAsPdf(savePdfFilename);
      }
    }
  };

  const handleSavePdf = async () => {
    if (resumeViewRef.current) {
      if (savePdfFilename === "") {
        setSavePdfStatus("Please enter a filename.");
        return;
      }

      setIsSavingPdf(true);
      setSavePdfStatus("Saving PDF...");
      try {
        const s3Key = await resumeViewRef.current.savePdfToServer(
          savePdfFilename
        );
        setSavePdfPath(s3Key);
        setSavePdfStatus("PDF saved successfully!");
      } catch (error) {
        setSavePdfStatus("Failed to save PDF. Please try again.");
        console.error("Failed to save PDF to server:", error);
      } finally {
        setIsSavingPdf(false);
        setTimeout(() => setSavePdfStatus(null), 5000);
      }
    }
  };

  const handleScore = async () => {
    if (savePdfPath) {
      setIsScoring(true);
      const response = await scoreHTTPClient.scoreResume(
        savePdfPath as string,
        jobDescription
      );

      const resultId = response.resultId;
      router.push(`/score/${resultId}`);
      setIsScoring(false);
    } else {
      setSavePdfStatus("Please save the PDF before scoring.");
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div
      className={`flex flex-col min-h-screen bg-gradient-to-r from-blue-100 via-white to-purple-100 ${inriaSans.className}`}
    >
      {isTailoring && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.75)" }}
        >
          <FontAwesomeIcon
            icon={faSpinner}
            spin
            className="text-white text-[100px]"
          />
        </div>
      )}

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

      <div className="flex-1 flex flex-col p-4 justify-start items-center bg-white mx-2 mb-2 rounded-xl">
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
                className={`text-white bg-blue-500 h-10 w-10 rounded-full my-auto hover:bg-blue-600 lg:inline-block hidden p-1 mr-4 transition-all duration-300 ease-in-out ml-[-35px]`}
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
                  viewTailoredResume ? "hidden" : "block"
                } ${
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

              {/* MODIFICATION: Original tailored view sections (lines 488-549) are replaced by the following block */}
              {viewTailoredResume && (
                <div
                  className={`relative flex flex-col lg:flex-row ${
                    isResumePreviewCollapsed
                      ? "w-full lg:w-full"
                      : "w-full lg:w-2/3"
                  } flex-grow`}
                >
                  <button
                    onClick={() => setViewTailoredResume(false)}
                    className="absolute top-2 right-2 z-20 bg-gray-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-lg font-semibold hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    aria-label="Close tailored view"
                    title="Close tailored view"
                  >
                    ✕
                  </button>

                  {/* Column 1: Tailored Resume View */}
                  <div className="w-full lg:w-[60%] flex flex-col h-[80vh] p-1 lg:pr-3">
                    <input
                      type="text"
                      value={savePdfFilename}
                      onChange={(e) => setSavePdfFilename(e.target.value)}
                      placeholder="Enter filename..."
                      className="p-3 text-black border border-gray-300 mb-2 rounded-lg bg-white shadow w-full resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <ResumeView
                      ref={resumeViewRef}
                      resumeEntries={tailoredResumeEntries}
                    />
                    <div className="flex flex-row mt-2 justify-between items-center gap-2 md:gap-4">
                      <button
                        onClick={handleDownloadPdf}
                        className="flex-1 px-3 py-2 text-xs sm:text-sm lg:text-md font-semibold text-white bg-green-600 rounded-md shadow hover:bg-green-700 transition duration-200 ease-in-out flex items-center justify-center gap-1 lg:gap-2"
                      >
                        Download{" "}
                        <FontAwesomeIcon
                          icon={faDownload}
                          className="hidden sm:inline ml-1"
                        />
                      </button>
                      <button
                        onClick={handleSavePdf}
                        className={`flex-1 px-3 py-2 text-xs sm:text-sm lg:text-md font-semibold text-white bg-blue-500 rounded-md shadow hover:bg-blue-600 transition duration-200 ease-in-out flex items-center justify-center gap-1 lg:gap-2 ${
                          isSavingPdf ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                        disabled={isSavingPdf}
                      >
                        {isSavingPdf ? (
                          <>
                            <FontAwesomeIcon
                              icon={faSpinner}
                              spin
                              className="mr-1 lg:mr-2"
                            />{" "}
                            Saving...
                          </>
                        ) : (
                          <>
                            Save{" "}
                            <FontAwesomeIcon
                              icon={faSave}
                              className="hidden sm:inline ml-1"
                            />
                          </>
                        )}
                      </button>
                    </div>
                    {savePdfStatus && (
                      <p
                        className={`mt-2 text-sm text-center ${
                          savePdfStatus.includes("successfully")
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {savePdfStatus}
                      </p>
                    )}
                  </div>

                  {/* Column 2: Job Description for Tailored View */}
                  <div className="flex flex-col w-full lg:w-[40%] h-[80vh] mt-4 lg:mt-0 p-1 lg:pl-3">
                    <div className="bg-white p-3 md:p-4 border border-gray-300 overflow-y-auto rounded-lg flex-grow mb-2">
                      <pre className="whitespace-pre-wrap text-xs md:text-sm text-gray-700 leading-relaxed font-sans">
                        {jobDescription}
                      </pre>
                    </div>
                    <div className="flex flex-col justify-center items-center">
                      <button
                        onClick={handleScore}
                        className="w-full sm:w-3/4 md:w-1/2 px-4 py-2 text-md font-semibold text-white bg-green-600 rounded-md shadow hover:bg-green-700 transition duration-200 ease-in-out flex items-center justify-center gap-2"
                      >
                        Score <FontAwesomeIcon icon={faChevronRight} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
