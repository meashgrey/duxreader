import React from "react";

export type VimiumIconName = "close" | "search" | "keyboardReturn";

const paths: Record<VimiumIconName, string> = {
  close:
    "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  search:
    "M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 14 15.5l.27.28v.79l5 4.99L20.49 20zM10 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8",
  keyboardReturn: "M19 7v4H5.83l3.58-3.59L8 6l-6 6 6 6 1.41-1.41L5.83 13H21V7z",
};

export function VimiumIcon({
  name,
  className,
}: {
  name: VimiumIconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
