"use client";

import { useEffect, useState } from "react";
import { Button } from "@greenroots/ui";
import { ChevronUp } from "lucide-react";

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 360);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <Button
      type="button"
      size="icon-lg"
      aria-label="Lên đầu trang"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed right-4 bottom-5 z-50 size-12 rounded-full bg-brand-forest text-white shadow-2xl hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brand-forest focus-visible:ring-offset-2 lg:right-5 lg:bottom-6"
    >
      <ChevronUp className="size-6" aria-hidden="true" />
    </Button>
  );
}
