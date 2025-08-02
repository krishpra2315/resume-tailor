import { Inria_Sans } from "next/font/google";
import Head from "next/head";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faChevronLeft,
  faDownload,
  faFileWord,
} from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState, useRef, useCallback, forwardRef } from "react";
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
import Loading from "@/components/Loading";
import MultiStepProcessingLoader from "@/components/MultiStepProcessingLoader";
import TextareaWithCounter from "@/components/TextareaWithCounter";
import TailoredResumeEditor from "@/components/TailoredResumeEditor";
import TailoredDiffViewer from "@/components/TailoredDiffViewer";
import ResumePreviewModal from "@/components/ResumePreviewModal";
import { TailoredResumeEntry } from "@/http/masterHTTPClient";

// Add these constants near the top of the file, after the imports
const MAX_CHARACTERS = 5000; // You can adjust this number as needed

// Define the structure for a single processing step (can be co-located or imported if used elsewhere)
interface ProcessingStep {
  id: number | string;
  text: string;
  duration: number;
}

// Tab styles
const activeTabClass = "bg-slate-700 text-white shadow-md";
const inactiveTabClass = "text-gray-400 hover:bg-slate-700/50";

const SimpleResumeViewWrapper = forwardRef<
  ResumeViewHandles,
  { resumeEntries: ResumeEntry[] }
>((props, ref) => {
  return (
    <div className="resume-wrapper h-full w-full flex-1 overflow-hidden flex justify-center">
      {typeof window !== "undefined" && <ResumeView {...props} ref={ref} />}
    </div>
  );
});

SimpleResumeViewWrapper.displayName = "SimpleResumeViewWrapper";

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
  const [tailoredJobDescription, setTailoredJobDescription] =
    useState<string>("");
  const [isResumePreviewCollapsed, setIsResumePreviewCollapsed] =
    useState<boolean>(false);
  const [isTailoring, setIsTailoring] = useState<boolean>(false);
  const [viewTailoredResume, setViewTailoredResume] = useState<boolean>(false);
  const [tailoredResumeEntries, setTailoredResumeEntries] = useState<
    TailoredResumeEntry[]
  >([]);
  const [savePdfPath, setSavePdfPath] = useState<string | null>(null);
  const [isResumePreviewModalOpen, setIsResumePreviewModalOpen] =
    useState<boolean>(false);

  const [isScoring, setIsScoring] = useState<boolean>(false);

  const [tailoredResumes, setTailoredResumes] = useState<
    {
      name: string;
      url: string;
    }[]
  >([]);

  const [selectedTailoredResume, setSelectedTailoredResume] = useState<{
    name: string;
    url: string;
  } | null>(null);

  const [isTailoredListCollapsed, setIsTailoredListCollapsed] =
    useState<boolean>(false);

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to handle rate limit errors
  const handleRateLimitError = (errorMessage: string) => {
    if (
      errorMessage.includes("Daily Bedrock API limit exceeded") ||
      errorMessage.includes("Daily Textract API limit exceeded") ||
      errorMessage.includes("limit exceeded")
    ) {
      const isGuestError =
        errorMessage.includes("guest") ||
        errorMessage.toLowerCase().includes("guest");
      const message = isGuestError
        ? "Daily limit reached! As a guest user, you have limited daily resume scoring attempts. Create an account for higher limits, or try again tomorrow."
        : "Daily API limit exceeded. You've reached your daily limit for resume scoring. Please try again tomorrow.";

      setUploadStatus({
        message,
        type: "error",
      });
      return true;
    }
    return false;
  };

  // Define steps for Master Resume Processing
  const masterResumeProcessingSteps: ProcessingStep[] = [
    { id: 1, text: "Uploading Resume", duration: 2000 },
    { id: 2, text: "Reading Text", duration: 4000 },
    { id: 3, text: "Extracting Items", duration: 6000 },
    { id: 4, text: "Adding to Database", duration: 1000 },
    { id: 5, text: "Finalizing...", duration: Infinity },
  ];

  // Define steps for Tailoring (as an example, you'll adjust these)
  const tailoringProcessingSteps: ProcessingStep[] = [
    { id: "tailor-2", text: "Analyzing Job Description", duration: 2000 },
    { id: "tailor-3", text: "Generating Tailored Content", duration: 4000 },
    {
      id: "tailor-4",
      text: "Finalizing Tailored Resume...",
      duration: Infinity,
    },
  ];

  // Define steps for Scoring
  const scoringProcessingSteps: ProcessingStep[] = [
    {
      id: "score-1",
      text: "Analyzing Resume and Job Description",
      duration: 3000,
    }, // Example duration
    { id: "score-2", text: "Calculating Score...", duration: Infinity }, // Stays until navigation
  ];

  useEffect(() => {
    const checkUserAndFetchResume = async () => {
      setLoading(true);
      setResumeLoading(true);
      try {
        const currentUser: AuthUser | null = await getCurrentUser();
        if (!currentUser) {
          router.push("/");
        }

        try {
          const resumeData = await masterHTTPClient.getMasterResume();
          const tailoredResumes = await masterHTTPClient.getTailoredResumes();
          setMasterResumeUrl(resumeData.url);
          setResumeEntries(resumeData.entries);
          setTailoredResumes(tailoredResumes.files);
          setResumeError(null);
        } catch (fetchError) {
          console.log("Failed to fetch master resume data:", fetchError);
          if ((fetchError as Error).message?.includes("404")) {
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
      } catch {
        router.push("/");
      } finally {
        setLoading(false);
      }
    };
    checkUserAndFetchResume();
  }, [router]);

  useEffect(() => {
    if (
      activeTab === "tailored" &&
      tailoredResumes.length > 0 &&
      !selectedTailoredResume
    ) {
      setSelectedTailoredResume(tailoredResumes[0]);
    }
  }, [activeTab, tailoredResumes, selectedTailoredResume]);

  useEffect(() => {
    if (activeTab === "master") {
      setSelectedTailoredResume(null);
      setTailoredJobDescription("");
    } else if (
      activeTab === "tailored" &&
      tailoredResumes.length > 0 &&
      !selectedTailoredResume
    ) {
      setSelectedTailoredResume(tailoredResumes[0]);
      setTailoredJobDescription("");
    }
  }, [activeTab, tailoredResumes]);

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

  // Extract tailored entries for PDF generation
  const extractTailoredEntries = (
    entries: TailoredResumeEntry[]
  ): ResumeEntry[] => {
    return entries.map((entry) => entry.tailored);
  };

  const handleOpenResumePreviewModal = useCallback(() => {
    setIsResumePreviewModalOpen(true);
  }, []);

  const handleCloseResumePreviewModal = useCallback(() => {
    setIsResumePreviewModalOpen(false);
  }, []);

  const handleSaveResume = useCallback((s3Key: string) => {
    setSavePdfPath(s3Key);
    // Close the modal after a short delay to let the user see the success message
    setTimeout(() => {
      setIsResumePreviewModalOpen(false);
    }, 2000);
  }, []);

  const handleScore = async () => {
    if (savePdfPath) {
      setIsScoring(true);
      try {
        // Check if user is authenticated
        let isAuthenticated = false;
        try {
          const currentUser = await getCurrentUser();
          isAuthenticated = true;
        } catch (error) {
          isAuthenticated = false;
        }

        const response = await scoreHTTPClient.scoreResume(
          savePdfPath as string,
          jobDescription,
          isAuthenticated
        );

        const resultId = response.resultId;
        router.push(`/score/${resultId}`);
      } catch (error) {
        console.error("Error scoring resume:", error);
        const errorMessage = (error as Error).message;

        // Check for rate limit errors
        if (handleRateLimitError(errorMessage)) {
          return;
        }
        setUploadStatus({
          message: "Failed to score resume. Please try again.",
          type: "error",
        });
      } finally {
        setIsScoring(false);
      }
    }
  };

  const handleScoreTailoredResume = async () => {
    if (!selectedTailoredResume) {
      alert("Please select a resume to score.");
      return;
    }

    if (!tailoredJobDescription.trim()) {
      alert("Please enter a job description to score against.");
      return;
    }

    setIsScoring(true);
    try {
      // Extract the S3 key from the URL
      // Assuming the URL is something like https://bucket-name.s3.region.amazonaws.com/path/to/file.pdf
      const urlParts = selectedTailoredResume.url.split("/");
      const s3Key = urlParts.slice(3).join("/");

      // Check if user is authenticated
      let isAuthenticated = false;
      try {
        const currentUser = await getCurrentUser();
        isAuthenticated = true;
      } catch (error) {
        isAuthenticated = false;
      }

      const response = await scoreHTTPClient.scoreResume(
        s3Key,
        tailoredJobDescription,
        isAuthenticated
      );

      const resultId = response.resultId;
      router.push(`/score/${resultId}`);
    } catch (error) {
      console.error("Scoring failed:", error);
      const errorMessage = (error as Error).message;

      // Check for rate limit errors
      if (handleRateLimitError(errorMessage)) {
        return;
      }
      setUploadStatus({
        message: "Failed to score resume. Please try again.",
        type: "error",
      });
    } finally {
      setIsScoring(false);
    }
  };

  const handleSelectTailoredResume = (resume: {
    name: string;
    url: string;
  }) => {
    setSelectedTailoredResume(resume);
    setTailoredJobDescription("");
  };

  if (loading) {
    return <Loading loadingText="Loading Dashboard..." />;
  }

  if (isUploading) {
    return (
      <MultiStepProcessingLoader
        title="Processing Your Master Resume..."
        steps={masterResumeProcessingSteps}
      />
    );
  }

  // Show MultiStepProcessingLoader for tailoring (when isTailoring is true)
  // You'll need to ensure isTailoring is set to true at the start of handleTailorClick
  // and false when done, similar to isUploading.
  if (isTailoring) {
    return (
      <MultiStepProcessingLoader
        title="Tailoring Your Resume..."
        steps={tailoringProcessingSteps}
      />
    );
  }

  // Show MultiStepProcessingLoader for scoring
  if (isScoring) {
    return (
      <MultiStepProcessingLoader
        title="Scoring Your Resume..."
        steps={scoringProcessingSteps}
      />
    );
  }

  return (
    <div
      className={`flex flex-col min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 text-gray-100 ${inriaSans.className}`}
    >
      <Head>
        <title>Dashboard - Resume Tailor</title>
        <meta
          name="description"
          content="View your dashboard to see your master & tailored resumes"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <nav className="shadow-lg w-full py-3 px-6 flex justify-between items-center text-white sticky top-0 z-10 bg-slate-800/30 backdrop-blur-md">
        <div className="flex flex-1 flex-row items-center gap-4">
          <Link href="/">
            <span className="text-xl font-bold cursor-pointer hover:text-purple-300">
              Resume Tailor
            </span>
          </Link>
          <span className="text-xl text-gray-500">&gt;</span>
          <span className="text-xl text-gray-200">Dashboard</span>
        </div>
      </nav>

      {/* Tabs Outside Content Area */}
      <div className="w-xl ml-5 mt-2 justify-start">
        <button
          onClick={() => setActiveTab("master")}
          className={`flex-1 py-3 px-6 text-center font-semibold rounded-t-md transition-all duration-200 ${
            activeTab === "master"
              ? activeTabClass
              : inactiveTabClass + " bg-slate-800/30"
          }`}
        >
          Master Resume
        </button>
        <button
          onClick={() => setActiveTab("tailored")}
          className={`flex-1 py-3 px-6 text-center font-semibold rounded-t-md transition-all duration-200 ${
            activeTab === "tailored"
              ? activeTabClass
              : inactiveTabClass + " bg-slate-800/30"
          }`}
        >
          Tailored Resumes
        </button>
      </div>

      <div className="flex-1 flex flex-col p-4 justify-start items-center bg-slate-800 backdrop-blur-md mx-2 mb-2 rounded-xl border border-slate-700">
        {activeTab === "master" && (
          <>
            <div
              className={`w-full max-w-6xl ${uploadStatus ? "mb-4" : "mb-0"}`}
            >
              {uploadStatus && (
                <DismissableAlert
                  message={uploadStatus.message}
                  type={uploadStatus.type}
                  onDismiss={() => setUploadStatus(null)}
                />
              )}
            </div>

            <div className="flex flex-col lg:flex-row w-full h-[82vh]">
              <div
                className={`flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
                  isResumePreviewCollapsed
                    ? "w-full lg:w-0 lg:opacity-0 lg:mr-0 lg:p-0 lg:border-0"
                    : "w-full lg:w-1/3"
                }`}
              >
                <div className="flex-1 flex flex-col bg-slate-700 rounded-lg p-4">
                  {resumeLoading ? (
                    <div className="flex-1 flex justify-center items-center text-gray-300 bg-slate-700/50 rounded-lg border border-slate-600">
                      <div>
                        <FontAwesomeIcon icon={faSpinner} spin size="2x" />
                        <p className="mt-2">Loading Master Resume...</p>
                      </div>
                    </div>
                  ) : masterResumeUrl && !resumeError ? (
                    <div className="w-full h-full bg-slate-700 rounded-xl shadow-xl border border-slate-600 overflow-hidden">
                      <iframe
                        src={`${masterResumeUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                        className="w-full h-full border-0 rounded-lg"
                        title="Master Resume Preview"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 text-center p-6 bg-slate-700/50 rounded-lg border border-slate-600">
                      <p className="text-gray-400 text-xl">
                        No Master Resume Uploaded
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        Upload your master resume (PDF, DOCX, or TXT) to get
                        started.
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

              {/* Collapse/Expand Handle for Resume Preview - LG screens only */}
              <div className="lg:flex hidden items-center justify-center mr-4 ml-[-5px]">
                <button
                  onClick={handleToggleCollapse}
                  className="text-white bg-slate-700 hover:bg-slate-600 h-16 w-7 rounded-md flex items-center justify-center transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-purple-500"
                  aria-label={
                    isResumePreviewCollapsed
                      ? "Expand Resume Preview"
                      : "Collapse Resume Preview"
                  }
                >
                  <FontAwesomeIcon
                    icon={
                      isResumePreviewCollapsed ? faChevronRight : faChevronLeft
                    }
                    size="xs"
                  />
                </button>
              </div>

              {/* Middle Column: Extracted Items */}
              <div
                className={`flex flex-col lg:ml-1 mr-6 transition-[width] duration-300 ease-in-out ${
                  viewTailoredResume ? "hidden" : "block"
                } ${
                  isResumePreviewCollapsed
                    ? "w-full lg:w-2/3"
                    : "w-full lg:w-1/3"
                }`}
              >
                <h2 className="text-2xl font-semibold text-gray-300 mb-4 flex justify-between items-center">
                  Resume Items
                </h2>
                <div className="flex-1 bg-slate-700/50 p-4 rounded-lg border border-slate-600 overflow-y-auto">
                  {resumeLoading ? (
                    <div className="flex justify-center items-center h-full text-gray-400">
                      <FontAwesomeIcon icon={faSpinner} spin size="lg" />
                      <span className="ml-2">Loading items...</span>
                    </div>
                  ) : !masterResumeUrl ? (
                    <div className="text-center text-gray-400 p-4">
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
                    <div className="text-center text-gray-400 p-4">
                      No items were extracted from the resume. This might be due
                      to the document format or content.
                    </div>
                  ) : (
                    <div className="text-center text-gray-400 p-4">
                      Waiting for items...
                    </div>
                  )}
                </div>
              </div>

              <div
                className={`w-full lg:w-1/3 flex flex-col ${
                  viewTailoredResume ? "hidden" : "block"
                }`}
              >
                <h2 className="text-2xl font-semibold text-gray-300 mb-4">
                  Tailor Resume
                </h2>
                <div className="flex-1 flex flex-col">
                  <TextareaWithCounter
                    value={jobDescription}
                    onChange={(e) =>
                      setJobDescription(e.target.value.slice(0, MAX_CHARACTERS))
                    }
                    placeholder="Paste the Job Description here..."
                    maxLength={MAX_CHARACTERS}
                    className="p-4 text-white border border-gray-600 rounded-lg bg-slate-800 shadow w-full h-full resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-500"
                  />
                  <button
                    onClick={handleTailorClick}
                    className={`mt-4 w-full px-4 py-2 text-md font-semibold text-white bg-green-600 rounded-md shadow hover:bg-green-700 transition duration-200 ease-in-out flex items-center justify-center gap-2 ${
                      !masterResumeUrl || !jobDescription || isUploading
                        ? "opacity-50 cursor-not-allowed"
                        : ""
                    }`}
                    disabled={
                      !masterResumeUrl || !jobDescription || isUploading
                    }
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

              <div
                className={`w-full flex flex-row ${
                  viewTailoredResume ? "block" : "hidden"
                }`}
              >
                <div className="w-2/3 h-full pr-4">
                  <TailoredDiffViewer entries={tailoredResumeEntries} />
                </div>

                <div className="w-1/3 flex flex-col h-full">
                  <h3 className="pl-1 text-lg font-semibold text-gray-300 mb-3">
                    Job Description
                  </h3>
                  <div
                    className={`bg-slate-700/50 backdrop-blur-md p-4 md:p-6 border border-slate-600 overflow-y-auto rounded-lg h-full`}
                  >
                    <pre className="whitespace-pre-wrap text-sm md:text-base text-gray-300 leading-relaxed font-sans">
                      {jobDescription}
                    </pre>
                  </div>

                  <div
                    className={`flex flex-row w-full mb-3 mt-3 ${
                      viewTailoredResume ? "flex" : "hidden"
                    }`}
                  >
                    <button
                      onClick={() => setViewTailoredResume(false)}
                      className="px-4 py-2 mr-2 text-md font-semibold text-white bg-red-600 rounded-md shadow hover:bg-red-700 transition duration-200 ease-in-out flex items-center justify-center gap-2"
                    >
                      Back to Resume Builder
                    </button>

                    <button
                      onClick={handleScore}
                      disabled={!savePdfPath}
                      className="ml-auto px-4 py-2 text-md font-semibold text-white bg-green-600 rounded-md shadow hover:bg-green-700 transition duration-200 ease-in-out flex items-center justify-center gap-2"
                    >
                      Score This Resume
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Resume Preview Modal */}
            <ResumePreviewModal
              isOpen={isResumePreviewModalOpen}
              onClose={handleCloseResumePreviewModal}
              resumeEntries={extractTailoredEntries(tailoredResumeEntries)}
              onSave={handleSaveResume}
            />
          </>
        )}

        {activeTab === "tailored" && (
          <div className="w-full flex-1 flex flex-row min-h-0 relative">
            {/* Collapse Button for Tailored List */}
            <button
              onClick={() =>
                setIsTailoredListCollapsed(!isTailoredListCollapsed)
              }
              className={`absolute top-1/2 -translate-y-1/2 z-20 text-white bg-slate-700 hover:bg-slate-600 h-16 w-7 rounded-r-md shadow-lg flex items-center justify-center transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-purple-500 ${
                isTailoredListCollapsed
                  ? "left-1"
                  : "left-[calc(33.333333%-0.875rem)]"
              }`}
              aria-label={
                isTailoredListCollapsed
                  ? "Expand Resume List"
                  : "Collapse Resume List"
              }
            >
              <FontAwesomeIcon
                icon={isTailoredListCollapsed ? faChevronRight : faChevronLeft}
                size="xs"
              />
            </button>

            {/* Left panel: List of tailored resumes */}
            <div
              className={`p-4 rounded-lg bg-slate-700 flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
                isTailoredListCollapsed ? "w-0 opacity-0" : "w-1/3"
              }`}
            >
              <h2 className="text-xl font-semibold text-gray-300 mb-3 shrink-0">
                Tailored Resumes
              </h2>
              {tailoredResumes.length > 0 ? (
                <div className="space-y-2 flex-1 overflow-y-auto min-h-0">
                  {tailoredResumes.map((resume) => (
                    <div
                      key={resume.name}
                      onClick={() => handleSelectTailoredResume(resume)}
                      className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                        selectedTailoredResume?.name === resume.name
                          ? "bg-purple-600/40 border-2 border-purple-500 shadow-md"
                          : "bg-slate-700/50 border border-slate-600 hover:border-purple-400 hover:bg-purple-700/20 hover:shadow"
                      }`}
                    >
                      <div className="flex items-center">
                        <FontAwesomeIcon
                          icon={faFileWord}
                          className="text-purple-400 mr-2 text-lg"
                        />
                        <div>
                          <h3 className="font-medium text-base text-gray-200">
                            {resume.name}.pdf
                          </h3>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6 bg-slate-700/50 rounded-lg border border-slate-600 flex-1">
                  <p className="text-gray-400">No tailored resumes yet.</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Create tailored resumes in the Master Resume tab.
                  </p>
                </div>
              )}
            </div>

            {/* Right panel: Selected resume preview & actions - will take full width if left is collapsed */}
            <div
              className={`flex flex-col min-h-0 transition-all duration-300 ease-in-out ${
                isTailoredListCollapsed ? "w-full pl-8" : "w-2/3 pl-4"
              }`}
            >
              {selectedTailoredResume ? (
                <div className="flex flex-row flex-1 min-h-0 gap-4">
                  <div className="flex-1 flex flex-col min-h-0">
                    <h2 className="text-xl font-semibold text-gray-300 mb-2 flex items-center shrink-0">
                      <FontAwesomeIcon
                        icon={faFileWord}
                        className="text-purple-400 mr-2"
                      />
                      {selectedTailoredResume.name}.pdf
                    </h2>
                    <div className="flex-1 bg-slate-700 rounded-xl shadow-lg border border-slate-600 overflow-hidden p-2 md:p-4 flex justify-center items-start">
                      <div className="w-full max-w-3xl h-full bg-white">
                        <iframe
                          src={`${selectedTailoredResume.url}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                          className="w-full h-full border-0"
                          title="Tailored Resume Preview"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="w-2/5 flex flex-col min-h-0">
                    <h2 className="text-xl font-semibold text-gray-300 mb-2 shrink-0">
                      Score Resume
                    </h2>
                    <TextareaWithCounter
                      value={tailoredJobDescription}
                      onChange={(e) =>
                        setTailoredJobDescription(
                          e.target.value.slice(0, MAX_CHARACTERS)
                        )
                      }
                      placeholder="Paste the Job Description here..."
                      maxLength={MAX_CHARACTERS}
                      className="p-4 text-white border border-gray-600 rounded-lg bg-slate-800 shadow w-full h-full resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-500"
                    />
                    <div className="flex flex-col pt-2 space-y-2 shrink-0 md:flex-row md:space-y-0 md:space-x-2 justify-end">
                      <a
                        href={selectedTailoredResume.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-md shadow hover:bg-purple-700 transition duration-200 flex items-center justify-center gap-2 md:w-auto w-full"
                      >
                        <FontAwesomeIcon icon={faDownload} /> Download
                      </a>
                      <button
                        className={`px-4 py-2 text-sm font-semibold text-white bg-green-600 rounded-md shadow hover:bg-green-700 transition duration-200 flex items-center justify-center gap-2 md:w-auto w-full ${
                          !tailoredJobDescription.trim() || isScoring
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                        onClick={handleScoreTailoredResume}
                        disabled={!tailoredJobDescription.trim() || isScoring}
                      >
                        {isScoring ? (
                          <>
                            <FontAwesomeIcon icon={faSpinner} spin /> Scoring...
                          </>
                        ) : (
                          <>
                            Score <FontAwesomeIcon icon={faChevronRight} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full bg-slate-700/50 rounded-lg border-2 border-dashed border-slate-600 p-10">
                  <FontAwesomeIcon
                    icon={faFileWord}
                    className="text-gray-500 text-5xl mb-4"
                  />
                  <p className="text-xl font-semibold text-gray-300 mb-2">
                    No Resume Selected
                  </p>
                  <p className="text-gray-400 text-center">
                    Select a tailored resume from the list to view it here.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
        return faFileLines;
    }
  };

  const icon = getIcon(entry.type);

  return (
    <div className="bg-slate-700/50 hover:bg-slate-600/50 p-4 rounded-lg shadow border border-slate-600 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center mb-2">
        <FontAwesomeIcon icon={icon} className="text-purple-400 mr-3 text-xl" />
        <div>
          <h3 className="font-semibold text-lg text-gray-200">
            {entry.title || "Untitled Item"}
          </h3>
          {entry.organization && (
            <p className="text-sm text-gray-400">{entry.organization}</p>
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
        <ul className="text-sm text-gray-300 list-disc pl-5">
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
      <p className="text-xs text-gray-500 mt-2 capitalize">
        Type: {entry.type}
      </p>
    </div>
  );
};
