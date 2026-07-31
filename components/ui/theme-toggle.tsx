"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const timer = setTimeout(() => {
      if (document.documentElement.getAttribute("data-theme") === "dark") setTheme("dark");
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  return (
    <button type="button" className="icon-button" onClick={toggle} aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}>
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
