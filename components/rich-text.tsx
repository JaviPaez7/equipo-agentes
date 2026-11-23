/** Plain text from the agents, with `backtick` spans shown as inline code. No other Markdown is interpreted. */
export function RichText({ text }: { text: string }) {
  // With a capturing group, split() puts the matched code spans at the odd indexes.
  const parts = text.split(/`([^`\n]+)`/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-black/[0.06] px-1 py-px font-mono text-[0.9em]">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}
