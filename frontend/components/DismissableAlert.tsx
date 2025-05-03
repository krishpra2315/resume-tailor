import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";

export default function DismissableAlert({
  message,
  type,
  onDismiss,
}: {
  message: string;
  type: "success" | "error";
  onDismiss: () => void;
}) {
  return (
    <div
      className={`w-full max-w-6xl p-4 mb-4 rounded-md shadow-md flex justify-between items-center ${
        type === "success"
          ? "bg-green-100 border border-green-400 text-green-700"
          : "bg-red-100 border border-red-400 text-red-700"
      }`}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss} // Dismiss handler
        className="ml-4 font-bold text-lg hover:opacity-75"
        aria-label="Dismiss alert"
      >
        <FontAwesomeIcon icon={faTimes} className="text-lg" />
      </button>
    </div>
  );
}
