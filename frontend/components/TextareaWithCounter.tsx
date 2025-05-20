import React from "react";

interface TextareaWithCounterProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  className?: string;
  maxLength: number;
}

const TextareaWithCounter: React.FC<TextareaWithCounterProps> = ({
  value,
  onChange,
  placeholder,
  className,
  maxLength,
}) => {
  return (
    <div className="relative w-full h-full">
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`${className} pb-8`} // Add padding at bottom for counter
      />
      <div className="absolute bottom-2 right-2 text-sm text-gray-400 pointer-events-none">
        {value.length}/{maxLength}
      </div>
    </div>
  );
};

export default TextareaWithCounter;
