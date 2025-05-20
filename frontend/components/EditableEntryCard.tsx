import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBriefcase,
  faGraduationCap,
  faLightbulb,
  faFileLines,
  faPenToSquare,
  faXmark,
  faCheck,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

export interface ResumeEntry {
  type: "experience" | "education" | "project" | string;
  title?: string;
  organization?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

interface EditableEntryCardProps {
  entry: ResumeEntry;
  index: number;
  onUpdate: (index: number, updatedEntry: ResumeEntry) => void;
  onDelete: (index: number) => void;
}

export const EditableEntryCard: React.FC<EditableEntryCardProps> = ({
  entry,
  index,
  onUpdate,
  onDelete,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedEntry, setEditedEntry] = useState<ResumeEntry>(entry);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdate(index, editedEntry);
    setIsEditing(false);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setEditedEntry((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="flex flex-col h-full bg-slate-700/50 hover:bg-slate-600/50 p-4 rounded-lg shadow border border-slate-600 hover:shadow-md transition-shadow duration-200 relative">
      {/* Card Controls */}
      <div className="absolute right-2 top-2 flex space-x-2">
        {!isEditing ? (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className="text-gray-400 hover:text-blue-400 transition-colors"
              aria-label="Edit entry"
            >
              <FontAwesomeIcon icon={faPenToSquare} />
            </button>
            <button
              onClick={() => onDelete(index)}
              className="text-gray-400 hover:text-red-400 transition-colors"
              aria-label="Delete entry"
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleSubmit}
              className="text-gray-400 hover:text-green-400 transition-colors"
              aria-label="Save changes"
            >
              <FontAwesomeIcon icon={faCheck} />
            </button>
            <button
              onClick={() => {
                setEditedEntry(entry);
                setIsEditing(false);
              }}
              className="text-gray-400 hover:text-red-400 transition-colors"
              aria-label="Cancel editing"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </>
        )}
      </div>

      {isEditing ? (
        <form onSubmit={handleSubmit} className="pt-6 flex-1 flex flex-col">
          <div className="space-y-3 flex-1">
            <div>
              <label
                htmlFor={`title-${index}`}
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Title
              </label>
              <input
                type="text"
                id={`title-${index}`}
                name="title"
                value={editedEntry.title || ""}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div>
              <label
                htmlFor={`organization-${index}`}
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Organization
              </label>
              <input
                type="text"
                id={`organization-${index}`}
                name="organization"
                value={editedEntry.organization || ""}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor={`startDate-${index}`}
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  Start Date
                </label>
                <input
                  type="text"
                  id={`startDate-${index}`}
                  name="startDate"
                  value={editedEntry.startDate || ""}
                  onChange={handleInputChange}
                  placeholder="e.g. Jan 2020"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label
                  htmlFor={`endDate-${index}`}
                  className="block text-sm font-medium text-gray-300 mb-1"
                >
                  End Date
                </label>
                <input
                  type="text"
                  id={`endDate-${index}`}
                  name="endDate"
                  value={editedEntry.endDate || ""}
                  onChange={handleInputChange}
                  placeholder="e.g. Present"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <label
                htmlFor={`description-${index}`}
                className="block text-sm font-medium text-gray-300 mb-1"
              >
                Description (Use new lines for bullet points)
              </label>
              <textarea
                id={`description-${index}`}
                name="description"
                value={editedEntry.description || ""}
                onChange={handleInputChange}
                rows={5}
                className="flex-1 w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
              />
            </div>
          </div>
        </form>
      ) : (
        <div className="flex flex-col flex-1">
          <div className="flex items-center mb-2 mt-1 ml-1">
            <FontAwesomeIcon
              icon={icon}
              className="text-purple-400 mr-3 text-xl"
            />
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
          <div className="flex-1">
            {entry.description && (
              <ul className="text-sm text-gray-300 list-disc pl-5">
                {entry.description.split("\n").map(
                  (point, i) =>
                    point.trim() && (
                      <li key={i} className="mb-1">
                        {point.trim()}
                      </li>
                    )
                )}
              </ul>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2 capitalize">
            Type: {entry.type}
          </p>
        </div>
      )}
    </div>
  );
};
