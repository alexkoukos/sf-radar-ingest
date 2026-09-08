/**
 * "How this works" explainer. A collapsed disclosure near the top of the
 * home page. Reuses the `.plan-hub` summary, marker, and body chrome so it
 * matches the Group hub. Only the spacing and the point layout are its own.
 *
 * Three points only, one short paragraph each. The audience skims, so keep
 * the copy terse and free of dashes if this ever gets edited.
 */
function HowItWorks() {
  return (
    <details className="plan-hub how-works">
      <summary className="plan-hub__summary">
        <span className="plan-hub__title">How this works</span>
        <span className="plan-hub__hint text-muted">RSVP, where your plan lives, private windows</span>
      </summary>
      <div className="plan-hub__body how-works__body">
        <p className="how-works__point">
          <strong>RSVP still happens on Luma.</strong> Marking an event as attending here saves it
          to your plan and your calendar, but it does not register you. For anything that needs an
          RSVP, open the Luma link and sign up there too.
        </p>
        <p className="how-works__point">
          <strong>Your plan lives in this browser only.</strong> There are no accounts. It is kept
          in this one browser on this one device, so opening SF Radar somewhere else starts a
          separate, empty plan.
          {/* TODO: link here to the "Use this device" transfer flow once it ships. */}
        </p>
        <p className="how-works__point">
          <strong>Private windows keep nothing.</strong> A private or incognito tab forgets your
          plan once you close it, the same as the warning banner says. Use a normal window if you
          want it to still be here later.
        </p>
      </div>
    </details>
  );
}

export default HowItWorks;
