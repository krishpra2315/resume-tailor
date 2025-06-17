import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  getCurrentUser,
  fetchUserAttributes,
  signOut,
} from "@aws-amplify/auth";
import type { AuthUser } from "@aws-amplify/auth";
import { Inria_Sans } from "next/font/google";
import uploadHTTPClient from "@/http/uploadHTTPClient";
import { fileToBase64 } from "@/utils/upload";
import DismissableAlert from "@/components/DismissableAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSignInAlt,
  faUserPlus,
  faUpload,
  faSignOutAlt,
  faSpinner,
  faFileUpload,
  faClipboardList,
  faMagic,
  faFileAlt,
  faSearchPlus,
  faChevronRight,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";
import scoreHTTPClient from "@/http/scoreHTTPClient";
import Image from "next/image";
import MultiStepProcessingLoader from "@/components/MultiStepProcessingLoader";
import TextareaWithCounter from "@/components/TextareaWithCounter";

interface ProcessingStep {
  id: number | string;
  text: string;
  duration: number;
}

const inriaSans = Inria_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

const MAX_CHARACTERS = 5000; // You can adjust this number as needed

const Home: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState<string>("");
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [currentResumeS3Key, setCurrentResumeS3Key] = useState<string | null>(
    null
  );
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [isScoring, setIsScoring] = useState<boolean>(false);
  const [isHowItWorksExpanded, setIsHowItWorksExpanded] =
    useState<boolean>(false);

  const scoringProcessingSteps: ProcessingStep[] = [
    {
      id: "score-idx-1",
      text: "Analyzing Resume and Job Description",
      duration: 3000,
    },
    { id: "score-idx-2", text: "Calculating Score...", duration: Infinity },
  ];

  const howItWorksSteps = [
    {
      title: "Upload Your Resume",
      icon: faFileUpload,
      description:
        "When you upload your master resume, we analyze it and extract all of your experiences, projects, and skills to make it easier to analyze.",
    },
    {
      title: "Provide the Job Description",
      icon: faClipboardList,
      description:
        "When you want to apply for a specific job, simply paste the job description into the provided text area.",
    },
    {
      title: "AI-Powered Tailoring",
      icon: faMagic,
      description:
        "Our system analyzes the job description to understand the key requirements, skills, and keywords the employer is looking for. Then, it intelligently selects the most relevant items from your master resume that best match the target job.",
    },
    {
      title: "Optimized Resume Generation",
      icon: faFileAlt,
      description:
        "A new, tailored resume is generated. This resume is optimized to highlight your qualifications for that specific role, increasing your chances of getting noticed.",
    },
    {
      title: "Review and Download",
      icon: faSearchPlus,
      description:
        "You can review the tailored resume, make any minor adjustments if needed, and then download it. You can also score the new resume to see how well it matches the job description.",
    },
  ];

  useEffect(() => {
    const checkUser = async () => {
      try {
        const currentUser: AuthUser | null = await getCurrentUser();
        console.log(currentUser);
        setUser(currentUser);
        try {
          const attributes = await fetchUserAttributes();
          const name = attributes.name || attributes.given_name;
          if (name) {
            setUserName(name);
          } else {
            setUserName(null);
          }
        } catch (attrError) {
          console.error("Error fetching user attributes:", attrError);
          setUserName(null);
        }
      } catch (error) {
        setUser(null);
        setUserName(null);
        console.log("No current user (error during getCurrentUser):", error);
      }
    };
    checkUser();
  }, []);

  const handleLogin = () => {
    router.push("/auth/signin");
  };

  const handleSignUp = () => {
    router.push("/auth/signup");
  };

  const handleLogout = async () => {
    try {
      await signOut();
      setUser(null);
      setUserName(null);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDraggingOver(true);
    },
    []
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDraggingOver(false);
    },
    []
  );

  const handleResumeFileChange = useCallback(
    async (file: File | null) => {
      setUploadStatus(null);

      if (!file) {
        setResumeFile(null);
        setCurrentResumeS3Key(null);
        return;
      }

      if (
        file.type === "application/pdf" ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.type === "text/plain"
      ) {
        setResumeFile(file);
        setIsUploading(true);

        try {
          const fileBase64 = await fileToBase64(file);

          let response;
          console.log(user);
          if (user) {
            response = await uploadHTTPClient.uploadResume(fileBase64);
            setCurrentResumeS3Key(response.s3_key);
          } else {
            response = await uploadHTTPClient.uploadResumeGuest(fileBase64);
            setCurrentResumeS3Key(response.s3_key);
          }
          console.log(response);
          console.log(currentResumeS3Key);
          setUploadStatus({
            message: "Resume uploaded successfully!",
            type: "success",
          });
        } catch {
          setUploadStatus({
            message: "Resume upload failed. Please try again.",
            type: "error",
          });

          setResumeFile(null);
          setCurrentResumeS3Key(null);
        } finally {
          setIsUploading(false);
        }
      } else {
        setUploadStatus({
          message: "Please select a PDF, DOCX, or TXT file.",
          type: "error",
        });

        setResumeFile(null);
        setCurrentResumeS3Key(null);
      }
    },
    [user]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDraggingOver(false);
      if (event.dataTransfer.files && event.dataTransfer.files[0]) {
        const file = event.dataTransfer.files[0];
        handleResumeFileChange(file);
      }
    },
    [handleResumeFileChange]
  );

  const handleScoreResume = async () => {
    setIsScoring(true);
    try {
      const response = await scoreHTTPClient.scoreResume(
        currentResumeS3Key as string,
        jobDescription
      );
      const resultId = response.resultId;
      router.push(`/score/${resultId}`);
    } catch (error) {
      console.error("Error scoring resume:", error);
      setUploadStatus({
        message: "Failed to score resume. Please try again.",
        type: "error",
      });
    } finally {
      setIsScoring(false);
    }
  };

  const toggleHowItWorks = () => {
    setIsHowItWorksExpanded(!isHowItWorksExpanded);
  };

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
        <title>Resume Tailor</title>
        <meta name="description" content="Tailor your resume to perfection" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <nav className="shadow-lg w-full py-4 px-8 flex justify-between items-center text-white sticky top-0 z-50 bg-slate-800/30 backdrop-blur-md">
        <span className="text-3xl font-bold">Resume Tailor</span>
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-[20px] text-gray-200">
                Welcome, {userName || user.username || "User"}!
              </span>
              <button
                onClick={handleLogout}
                className="px-6 py-3 text-md text-white bg-purple-600 hover:bg-purple-700 rounded-md shadow-md transition duration-200 ease-in-out flex items-center gap-2"
              >
                Logout <FontAwesomeIcon icon={faSignOutAlt} />
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={handleLogin}
                className="px-5 py-2.5 text-md font-semibold text-gray-200 bg-transparent rounded-md shadow-sm border border-gray-500 hover:bg-slate-700 hover:text-white transition duration-200 ease-in-out flex items-center gap-2"
              >
                Log In <FontAwesomeIcon icon={faSignInAlt} />
              </button>
              <button
                onClick={handleSignUp}
                className="px-5 py-2.5 text-md font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-md shadow-md transition duration-200 ease-in-out flex items-center gap-2"
              >
                Sign Up <FontAwesomeIcon icon={faUserPlus} />
              </button>
            </>
          )}
        </div>
      </nav>

      <div className="flex flex-row items-center justify-center min-h-[100vh] px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-900 via-slate-800 to-purple-900">
        <div className="flex flex-1 flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16 px-4">
          <div className="flex flex-col">
            <p className="text-[50px] font-bold text-white max-w-2xl">
              Resume Tailoring, made easy.
            </p>
            <p className="text-xl text-gray-300 max-w-2xl ml-1">
              We use the most recent technology to tailor your resume to any
              job. <br />
              Start by uploading your resume and job description below,
              we&apos;ll take care of the rest.
              <br />
            </p>
            <div className="pt-4 ml-1 flex flex-col sm:flex-row gap-4 items-start">
              <button
                onClick={() => {
                  document
                    .getElementById("resume-upload-area")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className="px-6 py-3 text-md font-semibold text-white bg-transparent border border-white hover:bg-slate-600 rounded-md shadow-md transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-75"
              >
                Score your Resume{" "}
                <span className="ml-2">
                  <FontAwesomeIcon icon={faChevronDown} />
                </span>
              </button>
              <button
                onClick={() => {
                  if (user) {
                    router.push("/dashboard");
                  } else {
                    router.push("/auth/signup");
                  }
                }}
                className="px-6 py-3 text-md font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-md shadow-sm transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-300 focus:ring-opacity-75"
              >
                {user ? "Go to your Dashboard" : "Get Started with an Account"}
                <span className="ml-2">
                  <FontAwesomeIcon icon={faChevronRight} />
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex w-full lg:w-1/2 items-center justify-center p-6">
          <Image
            src="/images/resume-tailor-preview.svg"
            alt="Resume Tailor Logo"
            width={0}
            height={0}
            className="w-full h-full"
            sizes="100vw"
          />
        </div>
      </div>

      <div className="flex flex-col items-center justify-center flex-1 w-full bg-slate-800 py-16 sm:py-20 lg:py-24">
        <div className="mx-auto py-10 text-center max-w-3xl">
          <p className="text-white text-[48px] font-bold">Master Resume</p>
          <p className="text-gray-300 text-[20px]">
            Make an account with us to have access to our Master Resume feature.
            This lets you upload your &quot;master resume&quot; which has all of
            your experiences, projects, and skills. Then, when you want to
            tailor it to a job, just add the description and we&apos;ll choose
            only your most relevant experiences to create the perfect resume for
            the job. This resume is then automatically saved and scored so you
            can see how well it matches the job description.
          </p>
          <button
            className="bg-purple-700 hover:bg-purple-800 transition-colors duration-300 text-white text-[20px] font-bold px-10 py-3 rounded-lg mt-6 shadow-lg"
            onClick={() => {
              if (user) {
                router.push("/dashboard");
              } else {
                router.push("/auth/signup");
              }
            }}
          >
            {user ? "Go to Dashboard" : "Get Started"}
          </button>
        </div>

        <div className="flex flex-col items-center justify-center mt-4">
          <button
            onClick={toggleHowItWorks}
            className="text-purple-400 hover:text-purple-300 underline text-lg"
          >
            How it works {isHowItWorksExpanded ? "▲" : "▼"}
          </button>
          <div
            className={`transition-all duration-700 ease-in-out overflow-hidden w-full max-w-5xl ${
              isHowItWorksExpanded
                ? "max-h-[1800px] opacity-100 mt-4"
                : "max-h-0 opacity-0 mt-0 p-0"
            } `}
          >
            {isHowItWorksExpanded && (
              <>
                <div className="space-y-6">
                  {howItWorksSteps.map((step, index) => (
                    <div
                      key={index}
                      className={`flex flex-col p-5 duration-300 ${
                        index % 2 === 0
                          ? "items-start text-left"
                          : "items-end text-right"
                      }`}
                    >
                      <div
                        className={`flex items-center ${
                          index % 2 === 0 ? "flex-row" : "flex-row-reverse"
                        } mb-2`}
                      >
                        <FontAwesomeIcon
                          icon={step.icon}
                          className="text-purple-400 text-3xl"
                        />
                        <h3
                          className={`text-2xl font-semibold text-white ${
                            index % 2 === 0 ? "ml-3" : "mr-3"
                          }`}
                        >
                          {`${step.title}`}
                        </h3>
                      </div>
                      <p className="text-gray-300 leading-relaxed text-lg max-w-xl">
                        {step.description}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-8 text-center text-gray-400 italic text-sm sm:text-base">
                  This process ensures that you always present the most
                  compelling version of your experience for every application,
                  without the manual effort of rewriting your resume each time.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col text-center items-center justify-center py-16 sm:py-20 lg:py-24 px-4 bg-gradient-to-br from-slate-900 to-slate-700">
        <p className="text-white text-[48px] font-bold mb-5">Resume Scoring</p>

        {uploadStatus && (
          <DismissableAlert
            message={uploadStatus.message}
            type={uploadStatus.type}
            onDismiss={() => setUploadStatus(null)}
          />
        )}

        <div className="w-full max-w-6xl flex flex-col md:flex-row gap-6 justify-center">
          <div
            id="resume-upload-area"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`p-10 border-dashed border-2 hover:border-purple-400 rounded-lg shadow w-full md:w-1/2 h-100 flex flex-col justify-center items-center cursor-pointer transition-colors duration-200 ease-in-out ${
              isUploading
                ? "bg-slate-700 border-gray-500"
                : isDraggingOver
                ? "border-purple-500 bg-purple-700/30"
                : resumeFile
                ? "border-purple-500 bg-slate-800"
                : "border-gray-600 bg-slate-800"
            }`}
          >
            {isUploading ? (
              <div className="flex flex-col items-center">
                <p className="text-gray-300 text-lg font-semibold">
                  Uploading...
                </p>
              </div>
            ) : (
              <>
                <FontAwesomeIcon
                  icon={faUpload}
                  className="text-gray-500 text-3xl mb-3"
                />
                <p
                  className={`text-gray-300 text-lg font-semibold mb-2 ${
                    resumeFile ? "text-purple-500" : ""
                  }`}
                >
                  {resumeFile
                    ? `File: ${resumeFile.name}`
                    : "Drag & Drop Resume Here"}
                </p>
                <p className="text-gray-500 text-sm">
                  or click to select (PDF, DOCX, TXT)
                  <br />
                  Must be one page.
                </p>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => {
                    handleResumeFileChange(
                      e.target.files ? e.target.files[0] : null
                    );
                  }}
                  onClick={(e) => ((e.target as HTMLInputElement).value = "")}
                  id="resume-file-input"
                  ref={fileInputRef}
                  disabled={isUploading}
                />
              </>
            )}
          </div>

          <div className="w-full md:w-1/2 h-100 flex flex-col">
            <TextareaWithCounter
              value={jobDescription}
              onChange={(e) =>
                setJobDescription(e.target.value.slice(0, MAX_CHARACTERS))
              }
              placeholder="Paste the Job Description here..."
              maxLength={MAX_CHARACTERS}
              className="p-4 text-white border border-gray-600 rounded-lg bg-slate-800 shadow w-full h-full resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-500"
            />
          </div>
        </div>
        <button
          onClick={handleScoreResume}
          className={`mt-8 transition-colors duration-300 text-lg font-semibold px-8 py-2 rounded-md shadow flex items-center justify-center gap-2 ${
            resumeFile && jobDescription && !isUploading && !isScoring
              ? "bg-purple-700 hover:bg-purple-800 text-white"
              : "bg-slate-600 cursor-not-allowed text-gray-400"
          }`}
          disabled={!(resumeFile && jobDescription) || isUploading || isScoring}
        >
          {isScoring ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin /> Scoring...
            </>
          ) : isUploading ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin /> Uploading...
            </>
          ) : (
            "Score Resume"
          )}
        </button>
      </div>

      <footer className="flex items-center justify-center w-full h-20 border-t border-slate-700 bg-slate-800 mt-auto">
        <p className="text-gray-400">© 2024 Resume Tailor</p>
      </footer>
    </div>
  );
};

export default Home;
