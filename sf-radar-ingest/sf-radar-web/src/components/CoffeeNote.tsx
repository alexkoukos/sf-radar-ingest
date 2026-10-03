/**
 * The tip-jar ask. SF Radar stays free; this is one quiet line shown only
 * where someone has just got value (end of the list, inside Group & share),
 * never a popup or a timer.
 */
export const COFFEE_URL = "https://buymeacoffee.com/alexkoukos";

function CoffeeNote({ lead, className = "" }: { lead: string; className?: string }) {
  return (
    <p className={`coffee-note ${className}`}>
      {lead}{" "}
      <a href={COFFEE_URL} target="_blank" rel="noopener noreferrer">
        Buy me a coffee ☕
      </a>
    </p>
  );
}

export default CoffeeNote;
