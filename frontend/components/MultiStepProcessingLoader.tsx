import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleNotch,
  faCheckCircle,
} from "@fortawesome/free-solid-svg-icons";

interface ProcessingStep {
  id: number | string;
  text: string;
  duration: number;
}

interface MultiStepProcessingLoaderProps {
  title: string;
  steps: ProcessingStep[];
}

interface StepDisplayProps {
  text: string;
  status: "pending" | "in-progress" | "completed";
  progress?: number;
  isLastStep: boolean;
}

const StepDisplay: React.FC<StepDisplayProps> = ({
  text,
  status,
  progress,
  isLastStep,
}) => {
  return (
    <div
      className={`flex items-start w-full relative mb-10 last:mb-0 ${
        isLastStep && status === "pending" ? "hidden" : "block"
      }`}
    >
      {/* Icon Container */}
      <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center mr-5 z-10 bg-slate-800 rounded-full">
        {status === "completed" && (
          <FontAwesomeIcon
            icon={faCheckCircle}
            className="text-green-400 text-3xl"
          />
        )}
        {status === "in-progress" && (
          <FontAwesomeIcon
            icon={faCircleNotch}
            spin
            className="text-purple-400 text-3xl"
          />
        )}
        {status === "pending" && (
          <div className="w-7 h-7 border-2 border-slate-500 rounded-full bg-slate-700"></div>
        )}
      </div>

      {/* Text and Progress Bar */}
      <div className="flex-grow pt-1">
        <p
          className={`text-lg font-medium ${
            status === "completed"
              ? "text-green-300"
              : status === "in-progress"
              ? "text-purple-300"
              : "text-slate-400"
          }`}
        >
          {text}
        </p>
        {(status === "in-progress" || status === "completed") && (
          <div className="w-full bg-slate-700 rounded-full h-1.5 mt-2 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-width duration-150 ease-linear ${
                status === "completed" ? "bg-green-400" : "bg-purple-400"
              }`}
              style={{ width: `${status === "completed" ? 100 : progress}%` }}
            ></div>
          </div>
        )}
      </div>

      {/* Connecting Line */}
      {!isLastStep && (
        <div
          className="absolute top-10 left-[19px] w-0.5 bg-slate-600"
          // Adjusted height calculation for robustness if needed, or keep as is
          style={{ height: "calc(100% - 2.5rem + 2.5rem - 0.625rem)" }}
        ></div>
      )}
    </div>
  );
};

// Renamed component and updated to use props
const MultiStepProcessingLoader: React.FC<MultiStepProcessingLoaderProps> = ({
  title,
  steps,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);

  useEffect(() => {
    setStepProgress(0); // Reset progress when step changes

    if (currentStepIndex >= steps.length) return; // All steps theoretically done

    const currentStepInfo = steps[currentStepIndex];

    if (currentStepInfo.duration === Infinity) {
      if (currentStepIndex === steps.length - 1) {
        setStepProgress(50);
      }
      return;
    }

    const startTime = Date.now();

    const progressIntervalId = setInterval(() => {
      const elapsedTime = Date.now() - startTime;
      const calculatedProgress = Math.min(
        100,
        (elapsedTime / currentStepInfo.duration) * 100
      );
      setStepProgress(calculatedProgress);
    }, 50);

    // Timeout to move to the next step
    const stepTimeoutId = setTimeout(() => {
      if (progressIntervalId) clearInterval(progressIntervalId);
      setStepProgress(100); // Ensure progress shows 100%
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((prevIndex) => prevIndex + 1);
      }
    }, currentStepInfo.duration);

    return () => {
      if (progressIntervalId) clearInterval(progressIntervalId);
      clearTimeout(stepTimeoutId);
    };
  }, [currentStepIndex, steps]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
      <div className="bg-slate-800 p-6 sm:p-10 rounded-xl shadow-2xl w-full max-w-md">
        <h2 className="text-2xl sm:text-3xl font-bold text-purple-400 mb-8 sm:mb-12 text-center">
          {title}
        </h2>
        <div className="relative">
          {steps.map((step, index) => (
            <StepDisplay
              key={step.id}
              text={step.text}
              status={
                index < currentStepIndex
                  ? "completed"
                  : index === currentStepIndex
                  ? "in-progress"
                  : "pending"
              }
              progress={
                index === currentStepIndex
                  ? stepProgress
                  : index < currentStepIndex
                  ? 100
                  : 0
              }
              isLastStep={index === steps.length - 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default MultiStepProcessingLoader; // Exporting the new component name
