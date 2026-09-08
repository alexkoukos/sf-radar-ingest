import { useState } from "react";

/**
 * A read-only value with a Copy button. Used for share links, invite links,
 * and feed URLs. Selecting the field on focus makes manual copy easy when
 * the clipboard API is blocked.
 */
function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="copy-field">
      {label && <span className="copy-field__label">{label}</span>}
      <input
        className="input copy-field__value"
        value={value}
        readOnly
        onFocusCapture={(e) => e.currentTarget.select()}
        onClick={(e) => e.currentTarget.select()}
      />
      <button type="button" className="btn btn-secondary copy-field__btn" onClick={copy}>
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

export default CopyField;
