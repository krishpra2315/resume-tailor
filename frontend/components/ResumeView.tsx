import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { ResumeEntry } from "@/http/masterHTTPClient";
// Remove file-saver if only used for DOCX, but html2pdf.js handles saving.
// import { saveAs } from "file-saver"; // Keep if used elsewhere, or remove.
import html2pdf from "html2pdf.js"; // Import html2pdf.js
import uploadHTTPClient from "@/http/uploadHTTPClient"; // Import the upload client

// CSS for PDF rendering mode
const pdfStyles = `
  .pdf-render-mode {
    line-height: 0 !important;
  }
  .pdf-render-mode h1,
  .pdf-render-mode h2,
  .pdf-render-mode h3,
  .pdf-render-mode p,
  .pdf-render-mode li,
  .pdf-render-mode div,
  .pdf-render-mode span,
  .pdf-render-mode strong,
  .pdf-render-mode em {
    line-height: 1.4 !important; /* Or 'normal !important' - adjust as needed */
  }
  /* You might need to add more selectors if other text elements are used */
`;

const getPdfOptions = (filename?: string) => ({
  margin: 0,
  filename: filename || "resume.pdf",
  image: { type: "jpeg", quality: 0.98 },
  html2canvas: {
    scale: 2,
    useCORS: true,
    logging: true,
    y: 0,
  },
  jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
});

// Helper function to prepare element and return a cleanup function
const prepareElementAndGetCleanUp = (element: HTMLElement) => {
  const originalStyle = element.getAttribute("style");
  const originalClassName = element.className;

  element.style.width = "100%";
  element.style.height = "auto";
  element.style.maxWidth = "none";
  element.style.aspectRatio = "auto";
  element.style.padding = "0px";
  element.classList.add("pdf-render-mode");

  return () => {
    if (originalStyle) {
      element.setAttribute("style", originalStyle);
    } else {
      element.removeAttribute("style");
    }
    element.className = originalClassName;
  };
};

export interface ResumeViewHandles {
  downloadAsPdf: (filename?: string) => void;
  savePdfToServer: (filename: string) => Promise<string>;
}

interface ResumeViewProps {
  resumeEntries: ResumeEntry[];
}

const ResumeView = forwardRef<ResumeViewHandles, ResumeViewProps>(
  ({ resumeEntries }, ref) => {
    const resumePreviewRef = useRef<HTMLDivElement>(null);

    const sectionOrder: string[] = [
      "userInfo",
      "education",
      "skills",
      "experience",
      "project",
      "certifications",
      "publications",
      "awards",
      "volunteer",
      "references",
    ];

    const entryGroups: { [type: string]: ResumeEntry[] } = {};
    resumeEntries.forEach((entry) => {
      if (!entryGroups[entry.type]) {
        entryGroups[entry.type] = [];
      }
      entryGroups[entry.type].push(entry);
    });

    const sortedGroupedEntries = Object.entries(entryGroups).sort(
      ([typeA], [typeB]) => {
        let aIndex = sectionOrder.indexOf(typeA);
        let bIndex = sectionOrder.indexOf(typeB);
        if (aIndex === -1) aIndex = sectionOrder.length;
        if (bIndex === -1) bIndex = sectionOrder.length;
        return aIndex - bIndex;
      }
    );

    useImperativeHandle(ref, () => ({
      downloadAsPdf: (filename?: string) => {
        if (resumePreviewRef.current) {
          const element = resumePreviewRef.current;
          const cleanup = prepareElementAndGetCleanUp(element);
          const pdfOptions = getPdfOptions(
            filename ? `${filename}.pdf` : "resume.pdf"
          );

          html2pdf()
            .from(element)
            .set(pdfOptions)
            .save()
            .then(() => {
              cleanup();
            })
            .catch((err: any) => {
              console.error("Error generating PDF for download:", err);
              alert(
                "Sorry, there was an error generating the PDF for download."
              );
              cleanup();
            });
        } else {
          alert("Resume content not found. Cannot generate PDF for download.");
        }
      },
      savePdfToServer: async (filename: string) => {
        if (!resumePreviewRef.current) {
          alert("Resume content not found. Cannot save PDF.");
          throw new Error("Resume content not found.");
        }

        const element = resumePreviewRef.current;
        const cleanup = prepareElementAndGetCleanUp(element);
        const pdfOptions = getPdfOptions();

        try {
          const pdfDataUri = await html2pdf()
            .from(element)
            .set(pdfOptions)
            .outputPdf("datauristring");

          const base64Marker = "base64,";
          const base64StartIndex = pdfDataUri.indexOf(base64Marker);

          if (
            !pdfDataUri.startsWith("data:application/pdf;") ||
            base64StartIndex === -1
          ) {
            throw new Error("Invalid PDF data URI format");
          }
          const base64Pdf = pdfDataUri.substring(
            base64StartIndex + base64Marker.length
          );

          const response = await uploadHTTPClient.uploadResume(
            base64Pdf,
            filename
          );
          return response.s3_key;
        } catch (err: any) {
          console.error("Error saving PDF to server:", err);
          throw err;
        } finally {
          cleanup();
        }
      },
    }));

    const renderSectionTitle = (title: string) => {
      return (
        <h2
          style={{
            fontSize: "1.1em",
            fontWeight: "bold",
            borderBottom: "1px solid #333",
            paddingBottom: "2px",
            marginTop: "8px",
            marginBottom: "4px",
            textTransform: "uppercase",
          }}
        >
          {title}
        </h2>
      );
    };

    return (
      <div
        ref={resumePreviewRef} // Attach ref here
        style={{
          fontFamily: "'Times New Roman', Times, serif",
          maxWidth: "800px",
          padding: "30px",
          border: "1px solid #ccc",
          backgroundColor: "white",
          color: "#333",
          fontSize: "9pt",
          lineHeight: "1.4",
          aspectRatio: "240/297",
          overflowY: "auto",
          // Consider removing fixed height if DOCX conversion is problematic with it
          // or ensure the content captured for DOCX is not constrained by this height
        }}
        className="resume-preview"
      >
        {entryGroups["userInfo"] &&
          entryGroups["userInfo"].map((entry, index) => (
            <div
              key={`userInfo-${index}`}
              style={{ textAlign: "center", marginBottom: "15px" }}
            >
              {entry.title && (
                <h1
                  style={{
                    fontSize: "1.5em",
                    fontWeight: "bold",
                    margin: "0 0 0 0",
                  }}
                >
                  {entry.title}
                </h1>
              )}
              {entry.organization && (
                <p style={{ fontSize: "1em", margin: "0 0 3px 0" }}>
                  {entry.organization}
                </p>
              )}
              {entry.description &&
                entry.description.split("\n").map((line, lineIdx) => (
                  <p key={lineIdx} style={{ fontSize: "1em", margin: "0" }}>
                    {line}
                  </p>
                ))}
            </div>
          ))}

        {sortedGroupedEntries.map(([type, entries]) => {
          if (type === "userInfo") return null;

          if (type === "skills") {
            return (
              <div
                key={type}
                className={`resume-section resume-section-${type}`}
              >
                {renderSectionTitle(type)}
                {entries.map((entry, index) => (
                  <div key={`${type}-${index}`} style={{ marginBottom: "2px" }}>
                    {entry.title && (
                      <p style={{ margin: "0", fontSize: "1em" }}>
                        <strong
                          style={{ fontSize: "1.05em", fontWeight: "bold" }}
                        >
                          {entry.title}:
                        </strong>
                        {entry.description && ` ${entry.description}`}
                      </p>
                    )}
                    {!entry.title && entry.description && (
                      <p style={{ margin: "0", fontSize: "1em" }}>
                        {entry.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            );
          }

          const isBulletDescriptionSection =
            type === "experience" || type === "project" || type === "education";

          return (
            <div key={type} className={`resume-section resume-section-${type}`}>
              {renderSectionTitle(type)}
              {entries.map((entry, index) => (
                <div key={`${type}-${index}`} style={{ marginBottom: "5px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flexGrow: 1 }}>
                      {(entry.title || entry.organization) && (
                        <p
                          style={{
                            fontSize: "1.05em",
                            fontWeight: "bold",
                            margin: "0 0 2px 0",
                          }}
                        >
                          {entry.title}
                          {entry.title && entry.organization ? ", " : ""}
                          {entry.organization}
                        </p>
                      )}
                    </div>
                    {(entry.startDate || entry.endDate) && (
                      <p
                        style={{
                          fontSize: "0.9em",
                          fontStyle: "italic",
                          margin: "0",
                          whiteSpace: "nowrap",
                          paddingLeft: "10px",
                        }}
                      >
                        {entry.startDate || ""} - {entry.endDate || "Present"}
                      </p>
                    )}
                  </div>

                  {entry.description && (
                    <ul
                      style={{
                        listStyleType: isBulletDescriptionSection
                          ? "disc"
                          : "none",
                        paddingLeft: isBulletDescriptionSection ? "20px" : "0",
                        margin: "2px 0 0 0",
                      }}
                    >
                      {entry.description.split("\n").map((line, lineIdx) =>
                        line.trim() ? (
                          <li key={lineIdx} style={{ marginBottom: "2px" }}>
                            {line}
                          </li>
                        ) : null
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }
);

export default ResumeView;
