export function parseMarkdown(
  text: string,
  onLinkClick: (url: string) => void,
  primaryColor: string
): (string | React.ReactElement)[] {
  const parts: (string | React.ReactElement)[] = [];
  // Regex para: **negrita**, <b>negrita</b>, [link](url), <br><br> (doble), <br> (simple)
  const regex = /(\*\*(.+?)\*\*)|(<b>(.+?)<\/b>)|(\[([^\]]+)\]\(([^)]+)\))|(<br\s*\/?>\s*<br\s*\/?>)|(<br\s*\/?>)/gi;
  let lastIndex = 0;
  let match;
  let keyIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      // **negrita** markdown
      parts.push(<strong key={keyIndex++}>{match[2]}</strong>);
    } else if (match[3]) {
      // <b>negrita</b> HTML
      parts.push(<strong key={keyIndex++}>{match[4]}</strong>);
    } else if (match[5]) {
      // [link](url) markdown
      const linkText = match[6];
      const url = match[7];
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
    } else if (match[8]) {
      // <br><br> doble = separador de párrafo con espacio
      parts.push(<div key={keyIndex++} className="h-3" />);
    } else if (match[9]) {
      // <br> simple = salto de línea
      parts.push(<br key={keyIndex++} />);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
