// This file is responsible for loading html2pdf.js only on the client side
let html2pdf = null;

// Only load html2pdf in the browser
if (typeof window !== "undefined") {
  import("html2pdf.js")
    .then((module) => {
      html2pdf = module.default || module;
      console.log("html2pdf loaded successfully");
    })
    .catch((err) => {
      console.error("Failed to load html2pdf:", err);
    });
}

export function getHtml2Pdf() {
  return html2pdf;
}

export function isHtml2PdfLoaded() {
  return !!html2pdf;
}
