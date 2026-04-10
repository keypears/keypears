const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export function PostContent({ text }: { text: string }) {
  const parts = text.split(URL_REGEX);

  return (
    <p className="text-foreground break-words text-sm whitespace-pre-wrap">
      {parts.map((part) =>
        URL_REGEX.test(part) ? (
          <a
            key={part}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent/80 no-underline hover:underline"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}
