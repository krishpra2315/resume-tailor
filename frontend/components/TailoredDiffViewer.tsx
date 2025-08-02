import React, { useState } from "react";
import { DiffEntryCard, TailoredResumeEntry } from "./DiffEntryCard";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCopy,
  faCheck,
  faEye,
  faEyeSlash,
} from "@fortawesome/free-solid-svg-icons";

interface TailoredDiffViewerProps {
  entries: TailoredResumeEntry[];
}

const TailoredDiffViewer: React.FC<TailoredDiffViewerProps> = ({ entries }) => {
  const [showOnlyChanges, setShowOnlyChanges] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  const filteredEntries = showOnlyChanges
    ? entries.filter((entry) => entry.hasChanges)
    : entries;

  const changesCount = entries.filter((entry) => entry.hasChanges).length;

  const copyAllTailored = async () => {
    try {
      const allTailoredText = entries
        .map((entry) => {
          const tailored = entry.tailored;
          let text = "";

          if (tailored.title) text += `${tailored.title}\n`;
          if (tailored.organization) text += `${tailored.organization}\n`;
          if (tailored.startDate || tailored.endDate) {
            text += `${tailored.startDate || ""} - ${
              tailored.endDate || "Present"
            }\n`;
          }
          if (tailored.description) text += `${tailored.description}\n`;

          return text;
        })
        .join("\n---\n\n");

      await navigator.clipboard.writeText(allTailoredText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <p className="text-lg mb-2">No tailored resume available</p>
        <p className="text-sm">
          Tailor your resume to see the enhanced version here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with controls */}
      <div className="flex items-center justify-between mb-4 p-3 bg-slate-700/30 rounded-lg">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">
            Tailored Resume ({entries.length} items)
          </h2>
          {changesCount > 0 && (
            <span className="px-3 py-1 text-sm bg-amber-600 text-amber-100 rounded-full">
              {changesCount} modified
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOnlyChanges(!showOnlyChanges)}
            className={`flex items-center gap-2 px-3 py-1 text-sm rounded transition-colors ${
              showOnlyChanges
                ? "bg-amber-600 text-amber-100"
                : "bg-slate-600 text-gray-300 hover:bg-slate-500"
            }`}
          >
            <FontAwesomeIcon
              icon={showOnlyChanges ? faEye : faEyeSlash}
              size="sm"
            />
            {showOnlyChanges ? "Show All" : "Changes Only"}
          </button>

          <button
            onClick={copyAllTailored}
            className="flex items-center gap-2 px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
          >
            <FontAwesomeIcon icon={copiedAll ? faCheck : faCopy} size="sm" />
            {copiedAll ? "Copied All!" : "Copy All"}
          </button>
        </div>
      </div>

      {/* Entries list */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <p className="text-sm">No items with changes to display</p>
            <button
              onClick={() => setShowOnlyChanges(false)}
              className="mt-2 text-purple-400 hover:text-purple-300 text-sm underline"
            >
              Show all items
            </button>
          </div>
        ) : (
          filteredEntries.map((entry, index) => (
            <DiffEntryCard key={`diff-${index}`} entry={entry} index={index} />
          ))
        )}
      </div>

      {/* Summary footer */}
      {entries.length > 0 && (
        <div className="mt-4 p-3 bg-slate-700/30 rounded-lg border-t border-slate-600">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>
              Showing {filteredEntries.length} of {entries.length} entries
            </span>
            <span>
              {changesCount === 0
                ? "No modifications made"
                : `${changesCount} item${
                    changesCount === 1 ? "" : "s"
                  } enhanced for this job`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default TailoredDiffViewer;
