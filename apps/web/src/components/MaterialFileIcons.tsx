import React from "react";

interface IconProps {
  size?: number;
  className?: string;
}

// TypeScript icon - Material Icon Theme style
export const TypeScriptIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#0288d1"
      d="M2 2v12h12V2zm4 6h3v1H8v4H7V9H6zm5 0h2v1h-2v1h1a1.003 1.003 0 0 1 1 1v1a1.003 1.003 0 0 1-1 1h-2v-1h2v-1h-1a1.003 1.003 0 0 1-1-1V9a1.003 1.003 0 0 1 1-1"
    />
  </svg>
);

// TypeScript React icon
export const TypeScriptReactIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#0288d1"
      d="M16 12c7.444 0 12 2.59 12 4s-4.556 4-12 4-12-2.59-12-4 4.556-4 12-4m0-2c-7.732 0-14 2.686-14 6s6.268 6 14 6 14-2.686 14-6-6.268-6-14-6"
    />
    <circle fill="#0288d1" cx="16" cy="16" r="2" />
    <path
      fill="#0288d1"
      d="M10.458 5.507c2.017 0 5.937 3.177 9.006 8.493 3.722 6.447 3.757 11.687 2.536 12.392a.9.9 0 0 1-.457.1c-2.017 0-5.938-3.176-9.007-8.492C8.814 11.553 8.779 6.313 10 5.608a.9.9 0 0 1 .458-.1m-.001-2A2.87 2.87 0 0 0 9 3.875C6.13 5.532 6.938 12.304 10.804 19c3.284 5.69 7.72 9.493 10.74 9.493A2.87 2.87 0 0 0 23 28.124c2.87-1.656 2.062-8.428-1.804-15.124-3.284-5.69-7.72-9.493-10.74-9.493Z"
    />
    <path
      fill="#0288d1"
      d="M21.543 5.507a.9.9 0 0 1 .457.1c1.221.706 1.186 5.946-2.536 12.393-3.07 5.316-6.99 8.493-9.007 8.493a.9.9 0 0 1-.457-.1C8.779 25.686 8.814 20.446 12.536 14c3.07-5.316 6.99-8.493 9.007-8.493m0-2c-3.02 0-7.455 3.804-10.74 9.493C6.939 19.696 6.13 26.468 9 28.124a2.87 2.87 0 0 0 1.457.369c3.02 0 7.455-3.804 10.74-9.493C25.061 12.304 25.87 5.532 23 3.876a2.87 2.87 0 0 0-1.457-.369"
    />
  </svg>
);

// JavaScript icon
export const JavaScriptIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#ffca28"
      d="M2 2v12h12V2zm6 6h1v4a1.003 1.003 0 0 1-1 1H7a1.003 1.003 0 0 1-1-1v-1h1v1h1zm3 0h2v1h-2v1h1a1.003 1.003 0 0 1 1 1v1a1.003 1.003 0 0 1-1 1h-2v-1h2v-1h-1a1.003 1.003 0 0 1-1-1V9a1.003 1.003 0 0 1 1-1"
    />
  </svg>
);

// JavaScript React icon
export const JavaScriptReactIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#00bcd4"
      d="M16 12c7.444 0 12 2.59 12 4s-4.556 4-12 4-12-2.59-12-4 4.556-4 12-4m0-2c-7.732 0-14 2.686-14 6s6.268 6 14 6 14-2.686 14-6-6.268-6-14-6"
    />
    <circle fill="#00bcd4" cx="16" cy="16" r="2" />
    <path
      fill="#00bcd4"
      d="M10.458 5.507c2.017 0 5.937 3.177 9.006 8.493 3.722 6.447 3.757 11.687 2.536 12.392a.9.9 0 0 1-.457.1c-2.017 0-5.938-3.176-9.007-8.492C8.814 11.553 8.779 6.313 10 5.608a.9.9 0 0 1 .458-.1m-.001-2A2.87 2.87 0 0 0 9 3.875C6.13 5.532 6.938 12.304 10.804 19c3.284 5.69 7.72 9.493 10.74 9.493A2.87 2.87 0 0 0 23 28.124c2.87-1.656 2.062-8.428-1.804-15.124-3.284-5.69-7.72-9.493-10.74-9.493Z"
    />
    <path
      fill="#00bcd4"
      d="M21.543 5.507a.9.9 0 0 1 .457.1c1.221.706 1.186 5.946-2.536 12.393-3.07 5.316-6.99 8.493-9.007 8.493a.9.9 0 0 1-.457-.1C8.779 25.686 8.814 20.446 12.536 14c3.07-5.316 6.99-8.493 9.007-8.493m0-2c-3.02 0-7.455 3.804-10.74 9.493C6.939 19.696 6.13 26.468 9 28.124a2.87 2.87 0 0 0 1.457.369c3.02 0 7.455-3.804 10.74-9.493C25.061 12.304 25.87 5.532 23 3.876a2.87 2.87 0 0 0-1.457-.369"
    />
  </svg>
);

// JSON icon
export const JsonIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#fbc02d"
      d="M5 3v2.5c0 .83-.67 1.5-1.5 1.5H2v2h1.5c.83 0 1.5.67 1.5 1.5V13h2v-2H6v-1.5c0-.83-.67-1.5-1.5-1.5.83 0 1.5-.67 1.5-1.5V5h1V3zm6 0v2h1v1.5c0 .83.67 1.5 1.5 1.5-.83 0-1.5.67-1.5 1.5V11h-1v2h2v-2.5c0-.83.67-1.5 1.5-1.5H16V7h-1.5c-.83 0-1.5-.67-1.5-1.5V3z"
    />
  </svg>
);

// HTML icon
export const HtmlIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#e44d26"
      d="M2 1l1.09 12.27L8 15l4.91-1.73L14 1zm9.24 4.01H5.76l.16 1.78h5.16l-.48 5.37L8 13l-2.6-.84-.18-2.01h1.74l.09 1.02 1 .27.95-.27.1-1.14H5.33L4.89 5.11h6.46z"
    />
  </svg>
);

// CSS icon
export const CssIcon: React.FC<IconProps> = ({ size = 16, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#42a5f5"
      d="M2 1l1.09 12.27L8 15l4.91-1.73L14 1zm9.47 4.01l-.37 4.14-.1 1.12L8 11.11l-3-1.84-.21-2.12h1.74l.11 1.02 1.36.84 1.36-.84.14-1.56H4.83l-.37-3.6h7.08z"
    />
  </svg>
);

// SCSS icon
export const ScssIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#ce6d9c"
      d="M8 1C4.13 1 1 4.13 1 8s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7zm3.87 4.25c-.07.5-.35.89-.71 1.17-.2.15-.43.28-.66.38.27.14.5.32.68.56.22.3.34.66.34 1.05 0 .55-.22 1.05-.61 1.42-.42.4-1 .63-1.64.63H7.5v-2h1.75c.24 0 .45-.08.61-.22.15-.13.23-.31.23-.51 0-.21-.08-.38-.23-.51-.16-.14-.37-.22-.61-.22H7.5V5h1.77c.24 0 .44-.08.59-.21.14-.12.22-.29.22-.47 0-.19-.08-.36-.22-.48-.15-.13-.35-.2-.59-.2H7.5V2.5h1.75c.62 0 1.18.21 1.58.58.37.34.58.8.58 1.3 0 .31-.09.59-.24.84z"
    />
  </svg>
);

// Markdown icon
export const MarkdownIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#519aba"
      d="M14 3H2c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM8.5 10.5L7 9l-1.5 1.5V5.5h1v3l.5-.5.5.5v-3h1zM11 10.5l-2-2.5h1.5V5.5h1V8H13z"
    />
  </svg>
);

// Python icon
export const PythonIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#3572a5"
      d="M7.87 1c-1.63 0-1.53 1.41-1.53 1.41v1.46h1.53v.44H4.24s-2.24-.25-2.24 3.27c0 3.52 1.96 3.4 1.96 3.4h1.17V8.92s-.06-1.96 1.93-1.96h3.33s1.87.03 1.87-1.81V3.31S12.56 1 7.87 1zM5.66 2.16c.33 0 .6.27.6.6s-.27.6-.6.6-.6-.27-.6-.6.27-.6.6-.6z"
    />
    <path
      fill="#ffc331"
      d="M8.13 15c1.63 0 1.53-1.41 1.53-1.41v-1.46H8.13v-.44h3.63s2.24.25 2.24-3.27c0-3.52-1.96-3.4-1.96-3.4h-1.17v2.07s.06 1.96-1.93 1.96H5.61s-1.87-.03-1.87 1.81v1.83S3.44 15 8.13 15zm2.21-1.16c-.33 0-.6-.27-.6-.6s.27-.6.6-.6.6.27.6.6-.27.6-.6.6z"
    />
  </svg>
);

// Go icon
export const GoIcon: React.FC<IconProps> = ({ size = 16, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#00acd7"
      d="M2.53 6.64s-.09.06 0 .12c.02.01.05 0 .05 0l1.64-.42s.07-.03.05-.09c0-.02-.04-.06-.06-.05l-1.68.44zM2.04 7.2s-.07.08.02.13c.04.02.07.01.07.01l2.12-.34s.07-.02.06-.08c0-.03-.04-.07-.07-.06l-2.2.34zM3.16 7.83l1.94-.15s.05-.01.05-.06c0-.03-.03-.07-.06-.07l-1.93.17s-.07.03-.05.08c0 .02.03.03.05.03z"
    />
    <ellipse fill="#00acd7" cx="9.97" cy="5.04" rx=".88" ry="1.16" />
    <ellipse fill="#00acd7" cx="6.03" cy="5.04" rx=".88" ry="1.16" />
    <path
      fill="#00acd7"
      d="M13.5 4.7c-.38-.83-1.16-1.71-2.34-2.2-1.08-.45-2.31-.52-3.08-.5-.81-.01-2.13.1-3.27.64C3.67 3.22 2.8 4.08 2.37 5.01c-.4.9.06 1.28.06 1.28s.21.21.61.18c.25-.02.53-.12.76-.34.15-.15.26-.35.3-.59.07-.41-.09-.9-.09-.9s-.04-.14.09-.21c.11-.05.25.04.25.04.31.16.93.57 1.14 1.52.12.52.05 1.07-.15 1.54-.21.49-.54.9-.96 1.16-.43.27-.95.39-1.47.33-.55-.06-1.05-.3-1.4-.69-.38-.41-.59-1-.53-1.6.06-.64.38-1.25.88-1.66.49-.41 1.14-.63 1.79-.61.34.01.68.08.98.21l.45-1.16c-.43-.19-.91-.3-1.41-.32-.93-.04-1.87.26-2.62.83-.73.56-1.23 1.37-1.33 2.27-.1.94.22 1.87.85 2.54.6.65 1.42 1.02 2.28 1.1.82.08 1.66-.1 2.35-.54.67-.43 1.17-1.07 1.47-1.81.28-.7.36-1.49.2-2.25-.1-.48-.3-.94-.56-1.34.26-.15.57-.26.89-.3.65.24 1.29.58 1.72 1.18.44.61.64 1.39.52 2.14-.11.71-.49 1.38-1.05 1.84-.59.49-1.36.74-2.15.69-.43-.03-.85-.15-1.22-.34l-.41 1.18c.51.24 1.08.38 1.67.41 1.09.07 2.18-.28 3.02-.98.81-.67 1.35-1.63 1.5-2.67.15-1.01-.1-2.08-.69-2.94z"
    />
  </svg>
);

// Rust icon
export const RustIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#dea584"
      d="M8 1.5l.58 1.16 1.28-.26-.25 1.28L10.77 4l-.84.99.85.98-1.16.59.25 1.28-1.28-.25L8 8.75l-.58-1.16-1.28.25.25-1.28L5.23 6l.84-.99-.85-.98 1.16-.59-.25-1.28 1.28.26zM8 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"
    />
    <path
      fill="#dea584"
      d="M8 0C3.58 0 0 3.58 0 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm0 14.5c-3.58 0-6.5-2.92-6.5-6.5S4.42 1.5 8 1.5s6.5 2.92 6.5 6.5-2.92 6.5-6.5 6.5z"
    />
    <path fill="#dea584" d="M5.5 9.5h5v1h-5zM4 11h8v1.5H4z" />
  </svg>
);

// Ruby icon
export const RubyIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#cc342d"
      d="M3.34 12L1 7.72 3.62 2h8.76L15 7.72 8 15zM8 3.5L4.5 7l3.5 5 3.5-5z"
    />
  </svg>
);

// Java icon
export const JavaIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#e76f00"
      d="M5.75 8.04s-.48.28.34.37c1 .11 1.51.1 2.61-.11 0 0 .29.18.69.34-2.46 1.05-5.57-.06-3.64-.6zM5.36 6.53s-.54.4.28.48c1.07.11 1.91.12 3.37-.16 0 0 .2.2.52.32-2.98.87-6.3.07-4.17-.64z"
    />
    <path
      fill="#e76f00"
      d="M7.79 4.94c.61.71-.16 1.34-.16 1.34s1.56-.8.84-1.81c-.67-.94-1.18-1.4 1.59-3.01 0 0-4.35 1.09-2.27 3.48z"
    />
    <path
      fill="#e76f00"
      d="M11.43 9.33s.36.29-.39.52c-1.43.44-5.94.57-7.2.02-.45-.2.4-.48.67-.54.28-.06.44-.05.44-.05-.51-.36-3.28.7-1.41 1.01 5.11.84 9.32-.38 7.89-.96zM5.98 11.05s-.77.18-.27.49c1.09.66 4.57.71 5.87.04.46-.24-.13-.57-.48-.64-.36-.07-2.39.38-5.12.11z"
    />
    <path
      fill="#e76f00"
      d="M10.05 7.69s.57.45-.24.8c-.86.37-3.54.53-4.55.06-.36-.17.25-.4.42-.45.18-.05.28-.04.28-.04-.32-.23-2.14.44-.92.64 3.33.53 6.07-.29 5.01-.91z"
    />
    <path
      fill="#5382a1"
      d="M9.59 1s1.38 1.38-.94 3.5c-1.86 1.7-.42 2.67 0 3.78-.19-.88 1.67-1.65 2.29-2.4.85-1.04.46-2.78-.94-3.93-.37-.3-1.17-.68-.41-.95z"
    />
    <path
      fill="#5382a1"
      d="M6.16 14c1.77.11 4.49-.06 4.56-.9 0 0-.12.32-1.47.57-1.52.29-3.4.25-4.51.07 0 0 .23.19 1.42.26z"
    />
  </svg>
);

// Kotlin icon
export const KotlinIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <defs>
      <linearGradient id="kotlinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7f52ff" />
        <stop offset="100%" stopColor="#c811e2" />
      </linearGradient>
    </defs>
    <path fill="url(#kotlinGrad)" d="M2 14V2h12L8 8l6 6z" />
  </svg>
);

// Swift icon
export const SwiftIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#f05138"
      d="M12.66 12.28c.18-.33.32-.69.42-1.07.49-1.89-.24-4.1-1.86-5.88.02.03.05.07.07.1.82 1.3.99 2.83.49 4.1-.07.19-.16.37-.26.55-.01-.01-.03-.02-.04-.03-2.11-1.35-4.07-3.35-5.52-5.45 2.03 1.71 4.46 3.02 6.5 3.47-.85-.68-2.2-1.93-3.53-3.43 1.38.88 2.8 1.83 3.77 2.72-1.19-1.08-3.17-3.21-4.19-4.85l-.02.01c-.03-.05-.07-.1-.1-.14 3.02 1.7 5.45 4.59 5.45 4.59s-1.92-4.19-5.01-6.57c-.13-.1-.26-.19-.39-.28.02-.01.05-.02.07-.03 1.54-.68 3.29-.72 4.89-.03 1.94.83 3.36 2.54 3.78 4.56.2.97.15 1.97-.15 2.91-.36 1.13-1.03 2.11-1.95 2.82-.92.72-2.03 1.13-3.2 1.19-.63.03-1.26-.05-1.87-.23.91-.17 1.83-.5 2.65-1.02z"
    />
  </svg>
);

// Docker icon
export const DockerIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#0db7ed"
      d="M13.66 6.34c-.18-.11-.58-.22-1.08-.17.1-.42.01-.94-.33-1.37l-.19-.25-.24.2c-.32.27-.55.65-.62 1.05-.34-.08-.72-.1-1.07-.04V5h-1v1h-1V5H7v1H6V5H5v1.5H3.5v1H5v1H3.5v1H5V8h1v1.5h1V8h1v1.5h1V8h1.17c.09.21.14.44.14.68 0 .95-.77 1.72-1.72 1.72h-.07c-.1.49-.32.96-.65 1.35-.51.61-1.26.97-2.07.97-1.18 0-2.2-.71-2.64-1.72H2c.37 1.45 1.66 2.5 3.2 2.5 1.13 0 2.12-.57 2.72-1.43.11.02.22.03.33.03 1.28 0 2.38-.8 2.81-1.93C11.18 11.63 11.29 11.58 11.39 11.53c.71-.35 1.17-1.04 1.2-1.82.02-.45-.1-.88-.32-1.25l.22-.12c.69-.24 1.17-.03 1.4.08l.25.13.12-.25c.27-.53-.09-1.24-.6-1.96z"
    />
    <path
      fill="#0db7ed"
      d="M6 6h1v1H6zM7 7h1v1H7zM8 6h1v1H8zM9 7h1v1H9zM10 6h1v1h-1z"
    />
  </svg>
);

// Git icon
export const GitIcon: React.FC<IconProps> = ({ size = 16, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#f34f29"
      d="M15.36 7.35L8.65.64a.78.78 0 0 0-1.1 0L6.05 2.14l1.4 1.4a.93.93 0 0 1 1.18 1.18l1.35 1.35a.93.93 0 1 1-.56.52L8.14 5.31v3.76a.93.93 0 1 1-.77-.05V5.19a.93.93 0 0 1-.5-1.22L5.52 2.62.64 7.5a.78.78 0 0 0 0 1.1l6.71 6.71a.78.78 0 0 0 1.1 0l6.91-6.86a.78.78 0 0 0 0-1.1z"
    />
  </svg>
);

// YAML icon
export const YamlIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#cb171e"
      d="M2 2v12h12V2zm3.5 3L7 7.5 8.5 5h1.3L8 8v3H6.5V8L4.7 5z"
    />
  </svg>
);

// Config/Settings icon (for tsconfig, etc.)
export const ConfigIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#6d8086"
      d="M13.85 5.5l-.71-.71a.5.5 0 0 0-.35-.15h-.93l-.66-.66a4 4 0 1 0-1.41 1.41l.66.66v.93a.5.5 0 0 0 .15.35l.71.71a.5.5 0 0 0 .35.15h1.19a.5.5 0 0 0 .5-.5V6a.5.5 0 0 0-.15-.35l-.35-.15zM5 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"
    />
    <path fill="#6d8086" d="M8 11H2v1h6zm6-4H9v1h5zm0 4H9v1h5zM8 2H2v1h6z" />
  </svg>
);

// Package icon (for package.json, etc.)
export const PackageIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#8bc34a"
      d="M14 4.5L8 1 2 4.5v7L8 15l6-3.5zm-6 9L3 10.5v-5L8 2.5l5 3v5z"
    />
    <path
      fill="#8bc34a"
      d="M8 7.5L3 4.75v.5L8 8.5l5-3.25v-.5zM8 9v5l5-2.92V6z"
    />
  </svg>
);

// Image icon
export const ImageIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#a074c4"
      d="M14 3H2c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM3 11l2.5-3L7 10l2.5-3 3.5 4z"
    />
    <circle fill="#a074c4" cx="5" cy="6" r="1" />
  </svg>
);

// SVG icon
export const SvgIcon: React.FC<IconProps> = ({ size = 16, className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#ffb13b"
      d="M14 3H2c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM5 10l-2-2 2-2 .71.71L4.41 8l1.3 1.29zm4.29.71L9 10l2-2-2-2-.29.71L10.59 8l-1.3 1.29zM8 11l-1.5-6h1l1.5 6z"
    />
  </svg>
);

// SQL/Database icon
export const DatabaseIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <ellipse fill="#c59630" cx="8" cy="4" rx="5" ry="2" />
    <path
      fill="#c59630"
      d="M3 4v8c0 1.1 2.24 2 5 2s5-.9 5-2V4c0 1.1-2.24 2-5 2S3 5.1 3 4z"
    />
  </svg>
);

// Shell/Bash icon
export const ShellIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#4eaa25"
      d="M2 3v10h12V3zm5.5 7H4v-1h3.5zm3-2L8 10.5V9l-1.5-1L8 7V5.5z"
    />
  </svg>
);

// Text file icon
export const TextIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#6d8086"
      d="M13 1H5L3 3v10l2 2h8l2-2V3zM5 4h6v1H5zm6 3H5V6h6zm0 2H5V8h6zm-2 2H5v-1h4z"
    />
  </svg>
);

// Default file icon
export const DefaultFileIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path fill="#6d8086" d="M13 14H3V2h7l3 3z" />
    <path fill="#fff" fillOpacity=".3" d="M10 2v3h3z" />
  </svg>
);

// Folder closed icon
export const FolderClosedIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#90a4ae"
      d="M14 4H8l-1-2H2c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V5c0-.55-.45-1-1-1z"
    />
  </svg>
);

// Folder open icon
export const FolderOpenIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#90a4ae"
      d="M14 4H8L7 2H2c-.55 0-1 .45-1 1v3h14V5c0-.55-.45-1-1-1z"
    />
    <path fill="#78909c" d="M1 6v7c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V6z" />
  </svg>
);

// Folder with special colors for common folder names
export const getSrcFolderIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#42a5f5"
      d="M14 4H8l-1-2H2c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V5c0-.55-.45-1-1-1z"
    />
  </svg>
);

export const getComponentsFolderIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#7c4dff"
      d="M14 4H8l-1-2H2c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V5c0-.55-.45-1-1-1z"
    />
  </svg>
);

export const getNodeModulesFolderIcon: React.FC<IconProps> = ({
  size = 16,
  className = "",
}) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 16"
    width={size}
    height={size}
    className={className}
  >
    <path
      fill="#8bc34a"
      d="M14 4H8l-1-2H2c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V5c0-.55-.45-1-1-1z"
    />
  </svg>
);

// Main function to get file icon
export function getMaterialFileIcon(
  filename: string,
  isDirectory: boolean = false,
  isOpen: boolean = false,
): React.ReactNode {
  if (isDirectory) {
    const folderName = filename.toLowerCase();

    // Special folder icons
      if (folderName === "src" || folderName === "source") {
        return isOpen ? (
          <FolderOpenIcon className="text-blue-500" />
        ) : (
          (getSrcFolderIcon({}) as any)
        );
      }
      if (folderName === "components" || folderName === "component") {
        return isOpen ? (
          <FolderOpenIcon className="text-purple-500" />
        ) : (
          (getComponentsFolderIcon({}) as any)
        );
      }
      if (folderName === "node_modules") {
        return isOpen ? (
          <FolderOpenIcon className="text-green-500" />
        ) : (
          (getNodeModulesFolderIcon({}) as any)
        );
      }

    return isOpen ? <FolderOpenIcon /> : <FolderClosedIcon />;
  }

  const ext = filename.split(".").pop()?.toLowerCase();
  const name = filename.toLowerCase();

  // Special file names
  if (name === "package.json" || name === "package-lock.json") {
    return <PackageIcon />;
  }
  if (name === "tsconfig.json" || name === "jsconfig.json") {
    return <ConfigIcon />;
  }
  if (name === "dockerfile" || name.startsWith("dockerfile.")) {
    return <DockerIcon />;
  }
  if (
    name === ".gitignore" ||
    name === ".gitattributes" ||
    name === ".gitmodules"
  ) {
    return <GitIcon />;
  }
  if (name === "readme.md" || name === "readme") {
    return <MarkdownIcon />;
  }

  // Extension-based icons
  switch (ext) {
    case "ts":
      return <TypeScriptIcon />;
    case "tsx":
      return <TypeScriptReactIcon />;
    case "js":
    case "mjs":
    case "cjs":
      return <JavaScriptIcon />;
    case "jsx":
      return <JavaScriptReactIcon />;
    case "json":
      return <JsonIcon />;
    case "html":
    case "htm":
      return <HtmlIcon />;
    case "css":
      return <CssIcon />;
    case "scss":
    case "sass":
    case "less":
      return <ScssIcon />;
    case "md":
    case "markdown":
      return <MarkdownIcon />;
    case "py":
    case "pyw":
      return <PythonIcon />;
    case "go":
      return <GoIcon />;
    case "rs":
      return <RustIcon />;
    case "rb":
    case "ruby":
      return <RubyIcon />;
    case "java":
      return <JavaIcon />;
    case "kt":
    case "kts":
      return <KotlinIcon />;
    case "swift":
      return <SwiftIcon />;
    case "yaml":
    case "yml":
      return <YamlIcon />;
    case "sh":
    case "bash":
    case "zsh":
    case "fish":
      return <ShellIcon />;
    case "sql":
    case "sqlite":
    case "db":
      return <DatabaseIcon />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "bmp":
    case "ico":
      return <ImageIcon />;
    case "svg":
      return <SvgIcon />;
    case "txt":
    case "log":
      return <TextIcon />;
    default:
      return <DefaultFileIcon />;
  }
}

export default getMaterialFileIcon;
