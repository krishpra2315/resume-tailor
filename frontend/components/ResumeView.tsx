import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  useEffect,
} from "react";
import { ResumeEntry } from "@/http/masterHTTPClient";
import uploadHTTPClient from "@/http/uploadHTTPClient";
import { getHtml2Pdf, isHtml2PdfLoaded } from "@/utils/html2pdfLoader";

const pdfStyles = `
  .pdf-render-mode {
    line-height: 1.5 !important;
    font-size: 12pt !important;
  }
  .pdf-render-mode h1 {
    font-size: 18pt !important;
  }
  .pdf-render-mode h2 {
    font-size: 14pt !important;
  }
  .pdf-render-mode h3 {
    font-size: 12pt !important;
  }
  .pdf-render-mode p,
  .pdf-render-mode li,
  .pdf-render-mode div {
    font-size: 12pt !important;
    vertical-align: baseline !important;
    margin-bottom: 0 !important;
  }
  .pdf-render-mode .skills-entry strong {
    font-size: 12.6pt !important;
    display: inline !important;
    vertical-align: baseline !important;
  }
  .pdf-render-mode .skills-entry span {
    font-size: 12pt !important;
    display: inline !important;
    vertical-align: baseline !important;
  }
  /* Fix for any SVG or images that might be in the resume */
  .pdf-render-mode img, 
  .pdf-render-mode svg {
    display: inline-block !important;
    vertical-align: middle !important;
  }
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
    scrollY: 0,
  },
  jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
});

// Helper function to prepare element and return a cleanup function
const prepareElementAndGetCleanUp = (element: HTMLElement) => {
  const originalStyle = element.getAttribute("style");
  const originalClassName = element.className;

  // Create a style element for our PDF-specific styles
  const styleElement = document.createElement("style");
  styleElement.textContent = pdfStyles;
  document.head.appendChild(styleElement);

  // Add style rule for html2canvas temporary elements
  const html2canvasStyleFix = document.createElement("style");
  html2canvasStyleFix.textContent =
    "body > div:last-child img { display: inline-block !important; }";
  document.head.appendChild(html2canvasStyleFix);

  element.style.width = "100%";
  element.style.height = "auto";
  element.style.maxWidth = "none";
  element.style.aspectRatio = "auto";
  element.style.padding = "20px";
  // Increase font size for PDF rendering
  element.style.fontSize = "12pt";
  element.classList.add("pdf-render-mode");

  return () => {
    if (originalStyle) {
      element.setAttribute("style", originalStyle);
    } else {
      element.removeAttribute("style");
    }
    element.className = originalClassName;

    // Remove our injected styles
    document.head.removeChild(styleElement);
    document.head.removeChild(html2canvasStyleFix);
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
    const [html2pdfLoaded, setHtml2pdfLoaded] = useState(false);

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

    // Load html2pdf.js when component mounts
    useEffect(() => {
      if (typeof window !== "undefined") {
        const checkHtml2PdfLoaded = () => {
          if (isHtml2PdfLoaded()) {
            setHtml2pdfLoaded(true);
            console.log("html2pdf loaded successfully");
          } else {
            // Check again after a short delay
            setTimeout(checkHtml2PdfLoaded, 500);
          }
        };

        checkHtml2PdfLoaded();
      }
    }, []);

    useImperativeHandle(ref, () => ({
      downloadAsPdf: (filename?: string) => {
        if (resumePreviewRef.current) {
          // Check if html2pdf is loaded
          if (!html2pdfLoaded) {
            console.error("html2pdf is not loaded yet");
            alert(
              "PDF generation is not ready yet. Please try again in a moment."
            );
            return;
          }

          const element = resumePreviewRef.current;
          const cleanup = prepareElementAndGetCleanUp(element);
          const pdfOptions = getPdfOptions(
            filename ? `${filename}.pdf` : "resume.pdf"
          );

          const html2pdfLib = getHtml2Pdf();
          if (!html2pdfLib) {
            console.error("html2pdf is not available");
            alert("PDF generation is not available. Please try again later.");
            cleanup();
            return;
          }

          // Add extra style rule specifically for html2canvas
          const html2canvasFixStyle = document.createElement("style");
          document.head.appendChild(html2canvasFixStyle);
          html2canvasFixStyle.sheet?.insertRule(
            "body > div:last-child img { display: inline-block !important; }",
            0
          );

          html2pdfLib()
            .from(element)
            .set(pdfOptions)
            .save()
            .then(() => {
              cleanup();
              html2canvasFixStyle.remove();
            })
            .catch((err: Error) => {
              console.error("Error generating PDF for download:", err);
              alert(
                "Sorry, there was an error generating the PDF for download."
              );
              cleanup();
              html2canvasFixStyle.remove();
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

        // Check if html2pdf is loaded
        if (!html2pdfLoaded) {
          console.error("html2pdf is not loaded yet");
          alert(
            "PDF generation is not ready yet. Please try again in a moment."
          );
          throw new Error("html2pdf is not loaded yet");
        }

        const html2pdfLib = getHtml2Pdf();
        if (!html2pdfLib) {
          console.error("html2pdf is not available");
          alert("PDF generation is not available. Please try again later.");
          throw new Error("html2pdf is not available");
        }

        const element = resumePreviewRef.current;
        const cleanup = prepareElementAndGetCleanUp(element);
        const pdfOptions = getPdfOptions();

        try {
          const pdfDataUri = await html2pdfLib()
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
        } catch (err) {
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
        ref={resumePreviewRef}
        style={{
          fontFamily: "'Times New Roman', Times, serif",
          maxWidth: "800px",
          width: "100%",
          height: "100%",
          maxHeight: "100%",
          padding: "30px",
          margin: "0 auto",
          border: "1px solid #ccc",
          backgroundColor: "white",
          color: "#333",
          fontSize: "9pt",
          lineHeight: "1.4",
          overflowY: "auto",
          boxSizing: "border-box",
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
                    <p
                      className="skills-entry"
                      style={{
                        margin: "0",
                        fontSize: "1em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {entry.title && (
                        <strong
                          style={{
                            fontSize: "1.05em",
                            fontWeight: "bold",
                            display: "inline",
                          }}
                        >
                          {entry.title}:{" "}
                        </strong>
                      )}
                      {entry.description && (
                        <span style={{ display: "inline" }}>
                          {entry.description}
                        </span>
                      )}
                    </p>
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

ResumeView.displayName = "ResumeView";

export default ResumeView;
