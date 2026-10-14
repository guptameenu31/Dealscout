import { useState } from "react";

const KEY = "dealscout.email";

/** Remember the shopper's email between the digest and watch dialogs. Storage may be unavailable. */
export function useEmail(): [string, (v: string) => void] {
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(KEY) ?? "";
    } catch {
      return "";
    }
  });
  const set = (v: string) => {
    setEmail(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* storage blocked: keep it in memory only */
    }
  };
  return [email, set];
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
