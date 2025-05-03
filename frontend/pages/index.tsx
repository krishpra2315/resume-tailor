import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  signInWithRedirect,
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
} from "@fortawesome/free-solid-svg-icons";

const inriaSans = Inria_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

const Home: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
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

  useEffect(() => {
    const checkUser = async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);

        try {
          const attributes = await fetchUserAttributes();
          const name = attributes.name || attributes.given_name;
          if (name) {
            setUserName(name);
          } else {
            setUserName(null);
          }
        } catch (attrError: any) {
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
    signInWithRedirect();
  };

  const handleSignUp = () => {
    signInWithRedirect();
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

  const handleResumeFileChange = useCallback(async (file: File | null) => {
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
      setCurrentResumeS3Key(null);
      setIsUploading(true);

      try {
        const fileBase64 = await fileToBase64(file);
        const response = await uploadHTTPClient.uploadResumeGuest(
          fileBase64,
          file.name
        );
        setCurrentResumeS3Key(response.s3_key);
        setUploadStatus({
          message: "Resume uploaded successfully!",
          type: "success",
        });
      } catch (error) {
        console.error("Error uploading resume:", error);
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
  }, []);

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

  const handleJobDescriptionChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setJobDescription(event.target.value);
  };

  return (
    <div
      className={`flex flex-col min-h-screen bg-gradient-to-r from-blue-200 via-white to-blue-200 ${inriaSans.className}`}
    >
      <Head>
        <title>Resume Tailor</title>
        <meta name="description" content="Tailor your resume to perfection" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <nav className="shadow-md w-full py-3 px-6 flex justify-between items-center text-black sticky top-0 z-10">
        <span className="text-3xl font-bold">Resume Tailor</span>
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-white">
                Welcome, {userName || user.username || "User"}!
              </span>
              <button
                onClick={handleLogout}
                className="px-3 py-1 text-sm font-semibold text-blue-600 bg-white rounded-md shadow-sm hover:bg-blue-100 transition duration-200 ease-in-out"
              >
                Logout
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={handleLogin}
                className="px-6 py-3 text-md font-semibold text-black bg-white rounded-md shadow-sm border border-black hover:bg-blue-100 transition duration-200 ease-in-out flex items-center gap-2"
              >
                Log In <FontAwesomeIcon icon={faSignInAlt} />
              </button>
              <button
                onClick={handleSignUp}
                className="px-6 py-3 text-md font-semibold text-black bg-white rounded-md shadow-sm border border-black hover:bg-blue-100 transition duration-200 ease-in-out flex items-center gap-2"
              >
                Sign Up <FontAwesomeIcon icon={faUserPlus} />
              </button>
            </>
          )}
        </div>
      </nav>

      <div className="flex flex-col flex-1 px-20 py-15">
        <p className="text-[50px] font-bold text-black max-w-2xl">
          Resume Tailoring, made easy.
        </p>
        <p className="text-xl text-gray-500 max-w-2xl ml-1">
          We use the most recent technology to tailor your resume to any job.{" "}
          <br />
          Start by uploading your resume and job description below, we'll take
          care of the rest.
          <br />
        </p>
        <div className="pt-4 text-gray-500 text-[16px] underline ml-1">
          <a href="#resume-upload-area">
            Score how well your resume matches a job description.
          </a>
          <br />
          <a
            onClick={() => {
              if (user) {
                router.push("/dashboard");
              } else {
                handleSignUp();
              }
            }}
            className="cursor-pointer"
          >
            Make an account and upload a master resume for our best tailoring
            features.
          </a>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center flex-1 text-center py-10 w-full max-w-3xl mx-auto">
        <p className="text-black text-[48px] font-bold">Master Resume</p>
        <p className="text-gray-500 text-[20px]">
          Make an account with us to have access to our Master Resume feature.
          This lets you upload your "master resume" which has all of your
          experiences, projects, and skills. Then, when you want to tailor it to
          a job, just add the description and we'll choose only your most
          relevant experiences to create the perfect resume for the job. This
          resume is then automatically saved and scored so you can see how well
          it matches the job description.
        </p>
        <button
          className="bg-blue-500 hover:bg-blue-600 transition-colors duration-300 text-white text-[20px] font-bold px-10 py-2 rounded-md mt-4"
          onClick={() => {
            if (user) {
              router.push("/dashboard");
            } else {
              handleSignUp();
            }
          }}
        >
          {user ? "Go to Dashboard" : "Get Started"}
        </button>
      </div>

      <div className="w-full flex flex-col text-center items-center justify-center py-10 px-4">
        <p className="text-black text-[48px] font-bold mb-5">Resume Scoring</p>

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
            className={`p-10 border-dashed border-2 rounded-lg shadow w-full md:w-1/2 h-100 flex flex-col justify-center items-center cursor-pointer transition-colors duration-200 ease-in-out ${
              isUploading
                ? "bg-gray-200 border-gray-400 cursor-wait" // Indicate loading
                : isDraggingOver
                ? "border-blue-500 bg-blue-30"
                : "border-blue-300 bg-white"
            }`}
          >
            {/* --- Loading Indicator --- */}
            {isUploading ? (
              <div className="flex flex-col items-center">
                {/* You could add a spinner icon here */}
                <p className="text-gray-600 text-lg font-semibold">
                  Uploading...
                </p>
              </div>
            ) : (
              <>
                <FontAwesomeIcon
                  icon={faUpload}
                  className="text-gray-400 text-3xl mb-3"
                />
                <p className="text-gray-500 text-lg font-semibold mb-2">
                  {resumeFile
                    ? `File: ${resumeFile.name}`
                    : "Drag & Drop Resume Here"}
                </p>
                <p className="text-gray-400 text-sm">
                  or click to select (PDF, DOCX, TXT)
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
                  disabled={isUploading}
                />
                <label
                  htmlFor="resume-file-input"
                  className={`mt-2 text-blue-500 hover:underline text-sm ${
                    isUploading
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer"
                  }`}
                >
                  {resumeFile ? "Change file" : "Select file"}
                </label>
              </>
            )}
          </div>

          <div className="w-full md:w-1/2 h-100 flex flex-col">
            <textarea
              placeholder="Paste the Job Description here..."
              value={jobDescription}
              onChange={handleJobDescriptionChange}
              className="p-4 text-black border border-gray-300 rounded-lg bg-white shadow w-full h-full resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          onClick={() => alert("Scoring not implemented yet!")}
          className={`mt-8 transition-colors duration-300 text-white text-lg font-semibold px-8 py-2 rounded-md shadow ${
            resumeFile && jobDescription && !isUploading
              ? "bg-blue-500 hover:bg-blue-600"
              : "bg-gray-400 cursor-not-allowed"
          }`}
          disabled={!(resumeFile && jobDescription) || isUploading}
        >
          {isUploading ? "Uploading..." : "Score Resume"}
        </button>
      </div>

      {/* Footer: White background, blue text */}
      <footer className="flex items-center justify-center w-full h-16 border-t border-blue-200 bg-white mt-auto">
        {" "}
        {/* Adjusted border and bg */}
        <p className="text-blue-800">© 2024 Resume Tailor</p> {/* Blue text */}
      </footer>
    </div>
  );
};

export default Home;
