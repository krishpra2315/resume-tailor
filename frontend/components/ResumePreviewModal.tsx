import React, { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload,
  faSave,
  faXmark,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";
import ResumeView, { ResumeViewHandles } from "./ResumeView";
import { ResumeEntry } from "./EditableEntryCard";

interface ResumePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  resumeEntries: ResumeEntry[];
  onSave: (s3Key: string, filename: string) => void;
}

const ResumePreviewModal: React.FC<ResumePreviewModalProps> = ({
  isOpen,
  onClose,
  resumeEntries,
  onSave,
}) => {
  const [filename, setFilename] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);
  const resumeViewRef = useRef<ResumeViewHandles>(null);

  if (!isOpen) return null;

  const handleDownloadPdf = () => {
    if (resumeViewRef.current && typeof window !== "undefined") {
      try {
        if (filename === "") {
          resumeViewRef.current.downloadAsPdf();
        } else {
          resumeViewRef.current.downloadAsPdf(filename);
        }
      } catch (error) {
        console.error("Error downloading PDF:", error);
        alert("Failed to download PDF. Please try again.");
      }
    } else {
      console.warn("Resume view reference is not available");
    }
  };

  const handleSavePdf = async () => {
    if (resumeViewRef.current && typeof window !== "undefined") {
      if (filename === "") {
        setSavingStatus("Please enter a filename.");
        return;
      }

      setIsSaving(true);
      setSavingStatus("Saving PDF...");
      try {
        const s3Key = await resumeViewRef.current.savePdfToServer(filename);
        onSave(s3Key, filename);
        setSavingStatus("PDF saved successfully!");
      } catch (error) {
        setSavingStatus("Failed to save PDF. Please try again.");
        console.error("Failed to save PDF to server:", error);
      } finally {
        setIsSaving(false);
        setTimeout(() => setSavingStatus(null), 5000);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[95vh] flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Resume Preview</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <FontAwesomeIcon icon={faXmark} size="lg" />
          </button>
        </div>

        <div className="flex-1 min-h-0 p-4 bg-slate-700/30 overflow-auto">
          <div className="bg-white rounded-lg shadow h-full">
            {typeof window !== "undefined" && (
              <ResumeView ref={resumeViewRef} resumeEntries={resumeEntries} />
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-700 space-y-4">
          <div className="flex items-center space-x-4">
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Enter filename (without extension)"
              className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={handleDownloadPdf}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faDownload} /> Download
            </button>
            <button
              onClick={handleSavePdf}
              className={`px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors flex items-center gap-2 ${
                isSaving ? "opacity-70 cursor-not-allowed" : ""
              }`}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin /> Saving...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faSave} /> Save
                </>
              )}
            </button>
          </div>

          {savingStatus && (
            <p
              className={`text-sm ${
                savingStatus.includes("successfully")
                  ? "text-green-400"
                  : savingStatus.includes("Please")
                  ? "text-yellow-400"
                  : "text-red-400"
              }`}
            >
              {savingStatus}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResumePreviewModal;
