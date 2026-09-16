// Antigravity mark — antigravity.svg (desktop).

import { useId } from "react";

export type AntigravityIconProps = {
  className?: string;
  title?: string;
};

export function AntigravityIcon({ className, title }: AntigravityIconProps) {
  const uid = useId().replace(/:/g, "");
  const clip = `${uid}-cp`;
  const f = (n: number) => `${uid}-f${n}`;
  return (
    <svg
      className={className}
      viewBox="0 0 250 250"
      xmlns="http://www.w3.org/2000/svg"
      role={title != null ? "img" : undefined}
      aria-hidden={title == null ? true : undefined}
      aria-label={title}
    >
      <defs>
        <clipPath clipPathUnits="userSpaceOnUse" id={clip}>
          <path d="m226.57 235.49c13.96 10.47 34.9 3.49 15.71-15.71-57.59-55.82-45.36-209.36-116.89-209.36-71.54 0-59.33 153.54-116.9 209.37-20.94 20.93 1.74 26.16 15.7 15.69 54.08-36.64 50.59-101.19 101.2-101.19 50.59 0 47.1 64.55 101.18 101.2z" />
        </clipPath>
        <filter x="-50%" y="-50%" width="200%" height="200%" id={f(1)}>
          <feGaussianBlur stdDeviation="11.6" />
        </filter>
        <filter x="-50%" y="-50%" width="200%" height="200%" id={f(2)}>
          <feGaussianBlur stdDeviation="56.3" />
        </filter>
        <filter x="-50%" y="-50%" width="200%" height="200%" id={f(3)}>
          <feGaussianBlur stdDeviation="47.8" />
        </filter>
        <filter x="-50%" y="-50%" width="200%" height="200%" id={f(4)}>
          <feGaussianBlur stdDeviation="45.4" />
        </filter>
        <filter x="-50%" y="-50%" width="200%" height="200%" id={f(5)}>
          <feGaussianBlur stdDeviation="41.2" />
        </filter>
        <filter x="-50%" y="-50%" width="200%" height="200%" id={f(6)}>
          <feGaussianBlur stdDeviation="36.8" />
        </filter>
        <filter x="-50%" y="-50%" width="200%" height="200%" id={f(7)}>
          <feGaussianBlur stdDeviation="32.9" />
        </filter>
        <filter x="-50%" y="-50%" width="200%" height="200%" id={f(8)}>
          <feGaussianBlur stdDeviation="27.8" />
        </filter>
        <filter x="-50%" y="-50%" width="200%" height="200%" id={f(9)}>
          <feGaussianBlur stdDeviation="34.4" />
        </filter>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <path
          filter={`url(#${f(1)})`}
          fill="#ffe432"
          d="m-10.6-41.6c-4.3 37.4 28 71.8 72 76.8 44 5 83.1-21.3 87.3-58.7 4.3-37.4-27.9-71.8-71.9-76.8-44-4.9-83.2 21.3-87.4 58.7z"
        />
        <path
          filter={`url(#${f(2)})`}
          fill="#fc413d"
          d="m159.1 80.7c11 47.5 59.2 76.8 107.7 65.5 48.6-11.2 79-58.8 67.9-106.3-11-47.5-59.3-76.8-107.8-65.5-48.5 11.2-78.9 58.8-67.8 106.3z"
        />
        <path
          filter={`url(#${f(3)})`}
          fill="#00b95c"
          d="m-129.6 112.5c13.9 49 76.7 74.1 140.1 56.1 63.5-18.1 103.6-72.4 89.7-121.4-13.9-49-76.7-74.1-140.1-56-63.5 18-103.6 72.3-89.7 121.3z"
        />
        <path
          filter={`url(#${f(3)})`}
          fill="#00b95c"
          d="m-79.2 153.2c34.9 35.6 95 33.4 134.3-5.1 39.3-38.4 42.8-98.5 7.9-134.2-35-35.6-95.1-33.4-134.4 5.1-39.3 38.4-42.8 98.5-7.9 134.2z"
        />
        <path
          filter={`url(#${f(4)})`}
          fill="#3186ff"
          d="m103.5 287.7c10.8 46.7 56 76.1 101 65.6 45-10.4 72.6-56.7 61.8-103.4-10.9-46.7-56.1-76.1-101.1-65.7-44.9 10.5-72.6 56.8-61.7 103.5z"
        />
        <path
          filter={`url(#${f(5)})`}
          fill="#fbbc04"
          d="m26.8-85.3c-22.7 50.6 2.1 111 55.5 135 53.3 24 115 2.4 137.7-48.2 22.7-50.6-2.1-111-55.5-135-53.3-23.9-115-2.3-137.7 48.2z"
        />
        <path
          filter={`url(#${f(6)})`}
          fill="#3186ff"
          d="m-34 403c-55-21.6 38.9-199.2 62.3-258.7 23.4-59.5 86.9-90.2 141.8-68.6 55 21.5 120.2 140.4 96.8 199.9-23.3 59.5-246 149-300.9 127.4z"
        />
        <path
          filter={`url(#${f(7)})`}
          fill="#749bff"
          d="m299.1 182c-14.8 17.2-53.2 8.4-85.8-19.6-32.7-28-47.2-64.6-32.5-81.7 14.7-17.2 53.1-8.5 85.8 19.5 32.6 28 47.2 64.6 32.5 81.8z"
        />
        <path
          filter={`url(#${f(8)})`}
          fill="#fc413d"
          d="m189.2 94.6c60.5 40.9 130.2 43.6 155.7 6 25.4-37.7-3-101.4-63.5-142.3-60.6-41-130.3-43.7-155.7-6-25.5 37.6 3 101.3 63.5 142.3z"
        />
        <path
          filter={`url(#${f(9)})`}
          fill="#ffee48"
          d="m-9.5 28c-15 36.1-10.1 72.5 10.9 81.3 21 8.7 50.3-13.6 65.3-49.8 15-36.1 10.1-72.5-11-81.3-21-8.7-50.2 13.6-65.2 49.8z"
        />
      </g>
    </svg>
  );
}
