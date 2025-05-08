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
  faXmark,
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
import dynamic from "next/dynamic";

// Import html2pdf directly in the dashboard component
let html2pdfLib: any = null;
if (typeof window !== "undefined") {
  import("html2pdf.js").then((module) => {
    html2pdfLib = module.default;
  });
}

// Import the ResumeView component directly for client-side only
const ClientSideResumeView = dynamic(() => import("@/components/ResumeView"), {
  ssr: false,
});

// Create a simple wrapper component for ResumeView
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
  const [tailoredJobDescription, setTailoredJobDescription] =
    useState<string>("");
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
          const tailoredResumes = await masterHTTPClient.getTailoredResumes();
          console.log(tailoredResumes);
          setMasterResumeUrl(resumeData.url);
          setResumeEntries(resumeData.entries);
          setTailoredResumes(tailoredResumes.files);
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

  // Auto-select the first tailored resume when switching to tailored tab or when tailored resumes are loaded
  useEffect(() => {
    if (
      activeTab === "tailored" &&
      tailoredResumes.length > 0 &&
      !selectedTailoredResume
    ) {
      setSelectedTailoredResume(tailoredResumes[0]);
    }
  }, [activeTab, tailoredResumes, selectedTailoredResume]);

  // Reset selected tailored resume when switching tabs
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

  useEffect(() => {
    // This ensures html2pdf.js is only loaded in the browser
    if (typeof window !== "undefined") {
      // Optional: You can preload html2pdf.js here if needed
      // const loadHtml2Pdf = async () => {
      //   await import('html2pdf.js');
      // };
      // loadHtml2Pdf();
    }
  }, []);

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

  const handleDownloadPdf = useCallback(() => {
    if (resumeViewRef.current && typeof window !== "undefined") {
      try {
        if (savePdfFilename === "") {
          resumeViewRef.current.downloadAsPdf();
        } else {
          resumeViewRef.current.downloadAsPdf(savePdfFilename);
        }
      } catch (error) {
        console.error("Error downloading PDF:", error);
        // Show some user-friendly error message
        alert("Failed to download PDF. Please try again.");
      }
    } else {
      console.warn("Resume view reference is not available");
    }
  }, [savePdfFilename]);

  const handleSavePdf = useCallback(async () => {
    if (resumeViewRef.current && typeof window !== "undefined") {
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
  }, [savePdfFilename]);

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

      const response = await scoreHTTPClient.scoreResume(
        s3Key,
        tailoredJobDescription
      );

      const resultId = response.resultId;
      router.push(`/score/${resultId}`);
    } catch (error) {
      console.error("Scoring failed:", error);
      alert("Failed to score resume. Please try again.");
    } finally {
      setIsScoring(false);
    }
  };

  const handleSelectTailoredResume = (resume: {
    name: string;
    url: string;
  }) => {
    setSelectedTailoredResume(resume);
    // Reset the job description when selecting a new resume
    setTailoredJobDescription("");
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div
      className={`flex flex-col min-h-screen bg-gradient-to-r from-blue-100 via-white to-purple-100 ${inriaSans.className}`}
    >
      {(isTailoring || isScoring) && (
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

              <div
                className={`w-full lg:w-1/3 flex flex-col ${
                  viewTailoredResume ? "hidden" : "block"
                }`}
              >
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
                className={`w-full lg:w-1/2 flex flex-col h-[80vh] ${
                  viewTailoredResume ? "block" : "hidden"
                }`}
              >
                <input
                  type="text"
                  value={savePdfFilename}
                  onChange={(e) => setSavePdfFilename(e.target.value)}
                  placeholder="Enter filename..."
                  className="p-3 text-black border border-gray-300 mb-2 rounded-lg bg-white shadow w-full resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex-1 overflow-hidden">
                  <SimpleResumeViewWrapper
                    ref={resumeViewRef}
                    resumeEntries={tailoredResumeEntries}
                  />
                </div>
                <div className="mt-2 flex flex-row justify-center items-center">
                  <button
                    onClick={() => setViewTailoredResume(false)}
                    className="mr-4 w-1/3 px-4 py-2 text-md font-semibold text-white bg-red-600 rounded-md shadow hover:bg-red-700 transition duration-200 ease-in-out flex items-center justify-center gap-2"
                  >
                    Go Back <FontAwesomeIcon icon={faXmark} />
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    className="mr-4 w-1/3 px-4 py-2 text-md font-semibold text-white bg-green-600 rounded-md shadow hover:bg-green-700 transition duration-200 ease-in-out flex items-center justify-center gap-2"
                  >
                    Download as PDF <FontAwesomeIcon icon={faDownload} />
                  </button>
                  <button
                    onClick={handleSavePdf}
                    className={`w-1/3 px-4 py-2 text-md font-semibold text-white bg-blue-500 rounded-md shadow hover:bg-blue-600 transition duration-200 ease-in-out flex items-center justify-center gap-2 ${
                      isSavingPdf ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    disabled={isSavingPdf}
                  >
                    {isSavingPdf ? (
                      <>
                        <FontAwesomeIcon icon={faSpinner} spin /> Saving...
                      </>
                    ) : (
                      <>
                        Save <FontAwesomeIcon icon={faSave} />
                      </>
                    )}
                  </button>
                </div>

                {savePdfStatus && (
                  <p
                    className={`mt-2 text-sm ${
                      savePdfStatus.includes("successfully")
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {savePdfStatus}
                  </p>
                )}
              </div>

              <div
                className={`flex flex-col w-full lg:w-1/3 ml-6 h-[80vh] ${
                  viewTailoredResume ? "block" : "hidden"
                }`}
              >
                <div
                  className={`bg-white p-4 md:p-6 border border-gray-300 overflow-y-auto rounded-lg`}
                >
                  <pre className="whitespace-pre-wrap text-sm md:text-base text-gray-700 leading-relaxed font-sans">
                    {jobDescription}
                  </pre>
                </div>
                <div className="flex-1 flex flex-col mt-2 justify-center items-center">
                  <button
                    onClick={handleScore}
                    className="w-1/2 px-4 py-2 text-md font-semibold text-white bg-green-600 rounded-md shadow hover:bg-green-700 transition duration-200 ease-in-out flex items-center justify-center gap-2"
                  >
                    Score <FontAwesomeIcon icon={faChevronRight} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "tailored" && (
          <div className="w-full flex-1 flex flex-row">
            {/* Left panel: List of tailored resumes */}
            <div className="w-1/3 pr-4 overflow-y-auto max-h-[80vh]">
              <h2 className="text-2xl font-semibold text-gray-700 mb-4">
                Tailored Resumes
              </h2>
              {tailoredResumes.length > 0 ? (
                <div className="space-y-3">
                  {tailoredResumes.map((resume) => (
                    <div
                      key={resume.name}
                      onClick={() => handleSelectTailoredResume(resume)}
                      className={`p-4 rounded-lg cursor-pointer transition-all duration-200 ${
                        selectedTailoredResume?.name === resume.name
                          ? "bg-blue-100 border-2 border-blue-500 shadow-md"
                          : "bg-white border border-gray-200 hover:border-blue-300 hover:bg-blue-50 hover:shadow"
                      }`}
                    >
                      <div className="flex items-center">
                        <FontAwesomeIcon
                          icon={faFileWord}
                          className="text-blue-500 mr-3"
                        />
                        <div>
                          <h3 className="font-medium text-lg text-gray-800">
                            {resume.name}.pdf
                          </h3>
                          <p className="text-xs text-gray-500 mt-1">
                            Created: {new Date().toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center p-8 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-gray-500">No tailored resumes yet.</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Create tailored resumes in the Master Resume tab.
                  </p>
                </div>
              )}
            </div>

            {/* Right panel: Selected resume preview */}
            <div className="w-2/3 pl-4">
              {selectedTailoredResume ? (
                <div className="flex flex-col h-full">
                  <h2 className="text-2xl font-semibold text-gray-700 mb-4 flex items-center">
                    <FontAwesomeIcon
                      icon={faFileWord}
                      className="text-blue-500 mr-3"
                    />
                    {selectedTailoredResume.name}.pdf
                  </h2>
                  <div className="flex-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                    <iframe
                      src={`${selectedTailoredResume.url}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                      className="w-full h-full border-0 min-h-[60vh]"
                      title="Tailored Resume Preview"
                    />
                  </div>
                  <div className="mt-4 flex flex-col">
                    <div className="mb-4">
                      <label
                        htmlFor="tailoredJobDescription"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Job Description (for scoring)
                      </label>
                      <textarea
                        id="tailoredJobDescription"
                        className="p-3 text-black border border-gray-300 rounded-lg bg-white shadow w-full resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Paste job description for scoring..."
                        value={tailoredJobDescription}
                        onChange={(e) =>
                          setTailoredJobDescription(e.target.value)
                        }
                        rows={4}
                      />
                      {!tailoredJobDescription.trim() && (
                        <p className="mt-1 text-xs text-gray-500">
                          Enter a job description to enable scoring against this
                          resume.
                        </p>
                      )}
                    </div>
                    <div className="flex justify-end space-x-4">
                      <a
                        href={selectedTailoredResume.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-2 text-sm font-semibold text-white bg-blue-500 rounded-md shadow hover:bg-blue-600 transition duration-200 flex items-center gap-2"
                      >
                        <FontAwesomeIcon icon={faDownload} /> Download PDF
                      </a>
                      <button
                        className={`px-6 py-2 text-sm font-semibold text-white bg-green-600 rounded-md shadow hover:bg-green-700 transition duration-200 flex items-center gap-2 ${
                          !tailoredJobDescription.trim()
                            ? "opacity-50 cursor-not-allowed"
                            : ""
                        }`}
                        onClick={handleScoreTailoredResume}
                        disabled={!tailoredJobDescription.trim()}
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
                <div className="flex flex-col items-center justify-center h-full bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-10">
                  <FontAwesomeIcon
                    icon={faFileWord}
                    className="text-gray-400 text-5xl mb-4"
                  />
                  <p className="text-xl font-semibold text-gray-600 mb-2">
                    No Resume Selected
                  </p>
                  <p className="text-gray-500 text-center">
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
