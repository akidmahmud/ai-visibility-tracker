import { Fragment } from "react";

type Mark = { name: string; kind: "SELF" | "COMPETITOR" | "UNTRACKED" };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STYLE = { SELF: "bg-blue-100 font-semibold", COMPETITOR: "bg-orange-100", UNTRACKED: "bg-neutral-100" };

/** Light markdown clean-up for reading (links → their text, bold markers dropped). */
function readable(text: string) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

/** The answer as the user saw it, with every named company highlighted (you, competitors, others). */
export function AnswerText({ text, marks }: { text: string; marks: Mark[] }) {
  const clean = readable(text);
  const names = [...marks].filter((m) => m.name.length >= 2).sort((a, b) => b.name.length - a.name.length);
  if (!names.length) return <p className="whitespace-pre-wrap leading-relaxed">{clean}</p>;
  const re = new RegExp(`(${names.map((m) => escape(m.name)).join("|")})`, "gi");
  const kindOf = (s: string) => names.find((m) => m.name.toLowerCase() === s.toLowerCase())?.kind;
  return (
    <p className="whitespace-pre-wrap leading-relaxed">
      {clean.split(re).map((part, i) => {
        const kind = kindOf(part);
        return kind ? (
          <mark key={i} className={`rounded px-0.5 text-inherit ${STYLE[kind]}`}>{part}</mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        );
      })}
    </p>
  );
}
