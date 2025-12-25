export function parseMarkdown(
  text: string,
  onLinkClick: (url: string) => void,
  primaryColor: string
): (string | React.ReactElement)[] {
  const parts: (string | React.ReactElement)[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(<strong key={keyIndex++}>{match[2]}</strong>);
    } else if (match[3]) {
      const linkText = match[4];
      const url = match[5];
      parts.push(
        <a
          key={keyIndex++}
          href={url}
          onClick={(e) => {
            e.preventDefault();
            onLinkClick(url);
          }}
          className="underline font-medium hover:opacity-80 cursor-pointer"
          style={{ color: primaryColor }}
        >
          {linkText}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
