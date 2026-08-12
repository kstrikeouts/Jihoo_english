"use client";

export default function SpeakButton({
  text,
  size = "md",
}: {
  text: string;
  size?: "sm" | "md" | "lg";
}) {
  function speak() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }

  const sizeClass =
    size === "lg" ? "text-3xl p-3" : size === "sm" ? "text-lg p-1.5" : "text-2xl p-2";

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={`${text} 발음 듣기`}
      className={`${sizeClass} rounded-full bg-white shadow hover:bg-orange-50 active:scale-95 transition cursor-pointer border border-orange-200`}
    >
      🔊
    </button>
  );
}
