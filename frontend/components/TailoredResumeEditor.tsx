import React, { useCallback, useState } from "react";
import { EditableEntryCard, ResumeEntry } from "./EditableEntryCard";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faArrowUp,
  faArrowDown,
} from "@fortawesome/free-solid-svg-icons";

interface TailoredResumeEditorProps {
  entries: ResumeEntry[];
  isResumePreviewCollapsed: boolean;
  onChange: (entries: ResumeEntry[]) => void;
  onMakePdf: () => void;
}

const TailoredResumeEditor: React.FC<TailoredResumeEditorProps> = ({
  entries,
  isResumePreviewCollapsed,
  onChange,
  onMakePdf,
}) => {
  const [localEntries, setLocalEntries] = useState<ResumeEntry[]>(entries);

  // Update the parent component when local entries change
  React.useEffect(() => {
    onChange(localEntries);
  }, [localEntries, onChange]);

  // Update local entries when prop entries change (e.g., initial load)
  React.useEffect(() => {
    setLocalEntries(entries);
  }, [entries]);

  const moveEntry = useCallback(
    (index: number, direction: "up" | "down") => {
      if (
        (direction === "up" && index === 0) ||
        (direction === "down" && index === localEntries.length - 1)
      ) {
        return; // Can't move beyond boundaries
      }

      const newEntries = [...localEntries];
      const targetIndex = direction === "up" ? index - 1 : index + 1;

      // Swap the entries
      [newEntries[index], newEntries[targetIndex]] = [
        newEntries[targetIndex],
        newEntries[index],
      ];

      setLocalEntries(newEntries);
    },
    [localEntries]
  );

  const handleUpdateEntry = useCallback(
    (index: number, updatedEntry: ResumeEntry) => {
      const newEntries = [...localEntries];
      newEntries[index] = updatedEntry;
      setLocalEntries(newEntries);
    },
    [localEntries]
  );

  const handleDeleteEntry = useCallback(
    (index: number) => {
      const newEntries = localEntries.filter((_, i) => i !== index);
      setLocalEntries(newEntries);
    },
    [localEntries]
  );

  const handleAddEntry = useCallback(() => {
    const newEntry: ResumeEntry = {
      type: "experience",
      title: "New Entry",
      organization: "",
      startDate: "",
      endDate: "",
      description: "",
    };
    setLocalEntries([...localEntries, newEntry]);
  }, [localEntries]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-300">
          Tailored Resume Entries
        </h2>
        <div className="flex space-x-2">
          <button
            onClick={handleAddEntry}
            className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center"
          >
            <FontAwesomeIcon icon={faPlus} className="mr-1" /> Add Entry
          </button>
          <button
            onClick={onMakePdf}
            className="px-4 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            Make PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2">
        <div
          className={`grid ${
            isResumePreviewCollapsed ? "grid-cols-2" : "grid-cols-1"
          } gap-4 auto-rows-fr`}
        >
          {localEntries.map((entry, index) => (
            <div key={`entry-${index}`} className="relative h-full">
              <div className="absolute left-2 top-2 flex flex-col">
                <button
                  onClick={() => moveEntry(index, "up")}
                  disabled={index === 0}
                  className={`p-1 mb-1 rounded-md ${
                    index === 0
                      ? "text-gray-600 cursor-not-allowed"
                      : "text-gray-400 hover:text-purple-400 hover:bg-slate-600/50"
                  }`}
                  aria-label="Move up"
                >
                  <FontAwesomeIcon icon={faArrowUp} />
                </button>
                <button
                  onClick={() => moveEntry(index, "down")}
                  disabled={index === localEntries.length - 1}
                  className={`p-1 rounded-md ${
                    index === localEntries.length - 1
                      ? "text-gray-600 cursor-not-allowed"
                      : "text-gray-400 hover:text-purple-400 hover:bg-slate-600/50"
                  }`}
                  aria-label="Move down"
                >
                  <FontAwesomeIcon icon={faArrowDown} />
                </button>
              </div>
              <div className="ml-10 h-full">
                <EditableEntryCard
                  entry={entry}
                  index={index}
                  onUpdate={handleUpdateEntry}
                  onDelete={handleDeleteEntry}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {localEntries.length === 0 && (
        <div className="text-center p-6 bg-slate-700/30 rounded-lg border border-slate-600 my-4">
          <p className="text-gray-400">No entries to display.</p>
          <button
            onClick={handleAddEntry}
            className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <FontAwesomeIcon icon={faPlus} className="mr-1" /> Add Entry
          </button>
        </div>
      )}
    </div>
  );
};

export default TailoredResumeEditor;
