/**
 * "How this works" explainer. Rendered as a section inside the PlanActions
 * hub (Group / Share / Calendar) so the home page has a single top-of-page
 * disclosure rather than two.
 *
 * Three points only, one short paragraph each. The audience skims, so keep
 * the copy terse and free of dashes if this ever gets edited.
 */
function HowItWorks() {
  return (
    <section className="hub-sec">
      <h3 className="hub-sec__title">How this works</h3>
      <p className="how-works__point">
        <strong>RSVP still happens on Luma.</strong> Marking an event as attending here saves it
        to your plan and your calendar, but it does not register you. For anything that needs an
        RSVP, open the Luma link and sign up there too.
      </p>
      <p className="how-works__point">
        <strong>Your plan lives in this browser only.</strong> There are no accounts. It is kept
        in this one browser on this one device, so opening SF Radar somewhere else starts a
        separate, empty plan.
      </p>
      <p className="how-works__point">
        <strong>Private windows keep nothing.</strong> A private or incognito tab forgets your
        plan once you close it, the same as the warning banner says. Use a normal window if you
        want it to still be here later.
      </p>
    </section>
  );
}

export default HowItWorks;
