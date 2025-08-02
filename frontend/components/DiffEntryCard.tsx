import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBriefcase,
  faGraduationCap,
  faLightbulb,
  faFileLines,
  faCopy,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";

export interface ResumeEntry {
  type: "experience" | "education" | "project" | string;
  title?: string;
  organization?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface TailoredResumeEntry {
  original: ResumeEntry;
  tailored: ResumeEntry;
  hasChanges: boolean;
}

interface DiffEntryCardProps {
  entry: TailoredResumeEntry;
  index: number;
}

export const DiffEntryCard: React.FC<DiffEntryCardProps> = ({
  entry,
  index,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

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

  const icon = getIcon(entry.original.type);

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const renderFieldDiff = (
    fieldName: string,
    originalValue?: string,
    tailoredValue?: string,
    label?: string
  ) => {
    if (!originalValue && !tailoredValue) return null;

    const hasChange = originalValue !== tailoredValue;
    const displayLabel =
      label || fieldName.charAt(0).toUpperCase() + fieldName.slice(1);

    return (
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-medium text-gray-300 text-sm">{displayLabel}</h4>
          {tailoredValue && (
            <button
              onClick={() =>
                copyToClipboard(tailoredValue, `${fieldName}-${index}`)
              }
              className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
            >
              <FontAwesomeIcon
                icon={
                  copiedField === `${fieldName}-${index}` ? faCheck : faCopy
                }
                size="xs"
              />
              {copiedField === `${fieldName}-${index}` ? "Copied!" : "Copy"}
            </button>
          )}
        </div>

        {hasChange ? (
          <div className="space-y-2">
            {originalValue && (
              <div className="bg-red-900/30 border-l-4 border-red-500 p-2 rounded">
                <p className="text-red-200 text-sm line-through opacity-75">
                  {originalValue}
                </p>
              </div>
            )}
            {tailoredValue && (
              <div className="bg-green-900/30 border-l-4 border-green-500 p-2 rounded">
                <p className="text-green-200 text-sm">{tailoredValue}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-600/30 p-2 rounded">
            <p className="text-gray-300 text-sm">
              {originalValue || tailoredValue}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderDescription = () => {
    if (!entry.original.description && !entry.tailored.description) return null;

    const hasChange = entry.original.description !== entry.tailored.description;

    return (
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-medium text-gray-300 text-sm">Description</h4>
          {entry.tailored.description && (
            <button
              onClick={() =>
                copyToClipboard(
                  entry.tailored.description!,
                  `description-${index}`
                )
              }
              className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors"
            >
              <FontAwesomeIcon
                icon={copiedField === `description-${index}` ? faCheck : faCopy}
                size="xs"
              />
              {copiedField === `description-${index}` ? "Copied!" : "Copy"}
            </button>
          )}
        </div>

        {hasChange ? (
          <div className="space-y-2">
            {entry.original.description && (
              <div className="bg-red-900/30 border-l-4 border-red-500 p-2 rounded">
                <div className="text-red-200 text-sm line-through opacity-75">
                  {entry.original.description.split("\n").map((line, idx) => (
                    <p key={idx} className="mb-1 last:mb-0">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {entry.tailored.description && (
              <div className="bg-green-900/30 border-l-4 border-green-500 p-2 rounded">
                <div className="text-green-200 text-sm">
                  {entry.tailored.description.split("\n").map((line, idx) => (
                    <p key={idx} className="mb-1 last:mb-0">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-600/30 p-2 rounded">
            <div className="text-gray-300 text-sm">
              {(entry.original.description || entry.tailored.description)
                ?.split("\n")
                .map((line, idx) => (
                  <p key={idx} className="mb-1 last:mb-0">
                    {line}
                  </p>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-slate-700/50 hover:bg-slate-600/50 p-4 rounded-lg shadow border border-slate-600 hover:shadow-md transition-shadow duration-200 relative">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-shrink-0">
          <FontAwesomeIcon
            icon={icon}
            className="text-purple-400 text-lg"
            size="lg"
          />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-white">
              {entry.tailored.title || entry.original.title || "Untitled"}
            </h3>
            {entry.hasChanges && (
              <span className="px-2 py-1 text-xs bg-amber-600 text-amber-100 rounded">
                Modified
              </span>
            )}
          </div>

          {(entry.tailored.organization || entry.original.organization) && (
            <p className="text-gray-400 text-sm">
              {entry.tailored.organization || entry.original.organization}
            </p>
          )}

          {(entry.tailored.startDate ||
            entry.original.startDate ||
            entry.tailored.endDate ||
            entry.original.endDate) && (
            <p className="text-gray-500 text-xs">
              {entry.tailored.startDate || entry.original.startDate || ""} -{" "}
              {entry.tailored.endDate || entry.original.endDate || "Present"}
            </p>
          )}
        </div>
      </div>

      {renderFieldDiff("title", entry.original.title, entry.tailored.title)}
      {renderFieldDiff(
        "organization",
        entry.original.organization,
        entry.tailored.organization
      )}
      {renderDescription()}
    </div>
  );
};

export default DiffEntryCard;
