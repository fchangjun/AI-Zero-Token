import { Fragment, type ReactNode } from "react";

// Render the small Markdown subset used in release notes as React nodes. Never inject remote HTML.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(part);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer noopener">{link[1]}</a>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function ReleaseNotes({ notes }: { notes: string }) {
  const lines = notes.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    const key = index;
    if (!line) { index += 1; continue; }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) code.push(lines[index++]);
      index += 1;
      blocks.push(<pre key={key}><code>{code.join("\n")}</code></pre>);
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h4 key={key}>{inline(line.replace(/^#{1,6}\s+/, ""))}</h4>);
      index += 1;
    } else if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const pattern = ordered ? /^\d+\.\s+/ : /^[-*+]\s+/;
      const items: ReactNode[] = [];
      while (index < lines.length && pattern.test(lines[index].trim())) {
        items.push(<li key={index}>{inline(lines[index++].trim().replace(pattern, ""))}</li>);
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
    } else if (/^([-*_])\1{2,}$/.test(line)) {
      blocks.push(<hr key={key} />);
      index += 1;
    } else {
      const paragraph = [lines[index++]];
      while (index < lines.length && lines[index].trim() && !/^(#{1,6}\s|[-*+]\s|\d+\.\s|```|([-*_])\2{2,}$)/.test(lines[index].trim())) paragraph.push(lines[index++]);
      blocks.push(<p key={key}>{inline(paragraph.join("\n"))}</p>);
    }
  }
  return <div className="desktop-release-notes">{blocks}</div>;
}
