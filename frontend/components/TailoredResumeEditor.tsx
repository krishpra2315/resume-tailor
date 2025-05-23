import React, { useCallback, useState, useRef, useEffect } from "react";
import { EditableEntryCard, ResumeEntry } from "./EditableEntryCard";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

interface TailoredResumeEditorProps {
  entries: ResumeEntry[];
  onChange: (entries: ResumeEntry[]) => void;
  onMakePdf: () => void;
}

const TailoredResumeEditor: React.FC<TailoredResumeEditorProps> = ({
  entries,
  onChange,
  onMakePdf,
}) => {
  const [localEntries, setLocalEntries] = useState<ResumeEntry[]>(entries);
  const entriesRef = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomDropAreaRef = useRef<HTMLDivElement | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Update the parent component when local entries change
  React.useEffect(() => {
    onChange(localEntries);
  }, [localEntries, onChange]);

  // Update local entries when prop entries change (e.g., initial load)
  React.useEffect(() => {
    setLocalEntries(entries);
  }, [entries]);

  // Setup drag and drop
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if (listRef.current) {
      // Setup the drop target (the list itself)
      const cleanup = dropTargetForElements({
        element: listRef.current,
        onDragEnter: () => {
          // Don't show indicator at the end if dragging the last item
          if (
            draggedIndex !== null &&
            draggedIndex === localEntries.length - 1
          ) {
            return;
          }
          setActiveDropTarget(localEntries.length);
        },
        onDragLeave: () => {
          setActiveDropTarget(null);
        },
      });
      cleanups.push(cleanup);
    }

    // Setup a specific drop target for the bottom area
    if (bottomDropAreaRef.current) {
      const bottomDropCleanup = dropTargetForElements({
        element: bottomDropAreaRef.current,
        onDragEnter: () => {
          // Don't show indicator at the end if dragging the last item
          if (
            draggedIndex !== null &&
            draggedIndex === localEntries.length - 1
          ) {
            return;
          }
          setActiveDropTarget(localEntries.length);
        },
        onDragLeave: () => {
          setActiveDropTarget(null);
        },
      });
      cleanups.push(bottomDropCleanup);
    }

    // Setup draggable items and individual drop targets
    Object.entries(entriesRef.current).forEach(([key, element]) => {
      if (!element) return;

      const index = parseInt(key.split("-")[1], 10);
      const dragHandle = element.querySelector(".drag-handle");

      if (!dragHandle) return;

      // Make item draggable
      const draggableCleanup = draggable({
        element,
        dragHandle: dragHandle as HTMLElement,
        onDragStart: () => {
          setIsDragging(true);
          setDraggedIndex(index);
        },
        onDrop: () => {
          setIsDragging(false);
          setActiveDropTarget(null);
          setDraggedIndex(null);
        },
      });
      cleanups.push(draggableCleanup);

      // Make item a drop target
      const dropTargetCleanup = dropTargetForElements({
        element,
        onDragEnter: () => {
          // Don't show indicator on the item being dragged or immediately after it
          if (index === draggedIndex) {
            setActiveDropTarget(null);
            return;
          }

          // If dragging from above to below, show indicator below the target
          if (draggedIndex !== null && draggedIndex < index) {
            setActiveDropTarget(index + 1);
          } else {
            setActiveDropTarget(index);
          }
        },
        onDragLeave: () => {
          setActiveDropTarget(null);
        },
      });
      cleanups.push(dropTargetCleanup);
    });

    // Monitor for drag and drop events
    const unsubscribe = monitorForElements({
      onDrop: ({ source, location }) => {
        if (!location.current.dropTargets.length) {
          return;
        }

        const sourceElement = source.element;
        const sourceIndex = parseInt(
          sourceElement.getAttribute("data-entry-index") || "-1",
          10
        );

        if (sourceIndex === -1) return;

        // Get target index from active drop target
        let targetIndex = activeDropTarget;

        // If we don't have an active target, try to find one from the location
        if (targetIndex === null) {
          const targetElement = location.current.dropTargets[0].element;

          // Check if we're dropping on the bottom drop area
          if (targetElement === bottomDropAreaRef.current) {
            targetIndex = localEntries.length;
          } else {
            const closestEntryElement =
              targetElement.closest("[data-entry-index]");

            if (closestEntryElement) {
              const indexAttr =
                closestEntryElement.getAttribute("data-entry-index");
              targetIndex = indexAttr
                ? parseInt(indexAttr, 10)
                : localEntries.length;
            } else {
              targetIndex = localEntries.length;
            }
          }
        }

        // Don't do anything if dropping in the same place
        if (
          sourceIndex === targetIndex ||
          targetIndex === sourceIndex + 1 ||
          targetIndex === null
        ) {
          return;
        }

        const newEntries = [...localEntries];
        const [removed] = newEntries.splice(sourceIndex, 1);

        // If dropping at the end of the list
        if (targetIndex > newEntries.length) {
          newEntries.push(removed);
        } else {
          // If dropping after the original position, we need to adjust the index
          // since the array length changed after removal
          if (targetIndex > sourceIndex) {
            targetIndex -= 1;
          }
          newEntries.splice(targetIndex, 0, removed);
        }

        setLocalEntries(newEntries);
        setActiveDropTarget(null);
      },
    });
    cleanups.push(unsubscribe);

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [localEntries, activeDropTarget, draggedIndex]);

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

  // Render a drop indicator at the active drop target
  const renderDropIndicator = (index: number) => {
    if (!isDragging || activeDropTarget !== index || draggedIndex === index)
      return null;

    return (
      <div className="h-1 w-full my-2 bg-purple-500 rounded relative">
        <div className="absolute left-0 -top-1 w-3 h-3 rounded-full bg-purple-500"></div>
      </div>
    );
  };

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
        <div ref={listRef} className="space-y-1">
          {/* Render a drop indicator at the top if necessary */}
          {renderDropIndicator(0)}

          {localEntries.map((entry, index) => (
            <React.Fragment key={`entry-${index}`}>
              <div
                ref={(el) => {
                  entriesRef.current[`entry-${index}`] = el;
                }}
                className={`relative ${isDragging ? "z-10" : ""} ${
                  isDragging && draggedIndex === index
                    ? "opacity-70 shadow-lg"
                    : "opacity-100"
                } ${
                  draggedIndex === index
                    ? "ring-2 ring-purple-500 ring-opacity-50 shadow-lg"
                    : ""
                }`}
                data-entry-index={index}
              >
                <div className="ml-0">
                  <EditableEntryCard
                    entry={entry}
                    index={index}
                    onUpdate={handleUpdateEntry}
                    onDelete={handleDeleteEntry}
                    draggable={true}
                  />
                </div>
              </div>
              {/* Render drop indicator after each item */}
              {renderDropIndicator(index + 1)}
            </React.Fragment>
          ))}

          {/* If there are no entries, add a drop indicator for the list */}
          {localEntries.length === 0 && renderDropIndicator(0)}

          {/* Add a special drop area for the bottom of the list */}
          <div
            ref={bottomDropAreaRef}
            className="h-16 w-full mt-2"
            data-bottom-drop-area="true"
          />
        </div>
      </div>

      {localEntries.length === 0 && !isDragging && (
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
