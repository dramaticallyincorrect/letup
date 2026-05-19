export function RefundPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-10 py-24 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Refund Policy</h1>
          <p className="text-sm text-muted-foreground mt-2">Last updated: May 19, 2025</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">1. Overview</h2>
          <p className="text-muted-foreground leading-relaxed">
            letup.ai, operated by Dramatically Incorrect, processes all payments through Paddle, our Merchant of
            Record. Paddle handles billing, tax, and payment disputes on our behalf. This policy describes your
            refund rights, including rights granted under EU consumer protection law.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">2. 14-Day Refund Period</h2>
          <p className="text-muted-foreground leading-relaxed">
            You may request a refund within <span className="font-medium text-foreground">14 days</span> of a
            charge. If credits have been consumed during that period, the refund will be prorated based on the
            remaining unused credits.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">3. Other Eligible Refunds</h2>
          <p className="text-muted-foreground leading-relaxed">
            Outside the cooling-off period, you may also request a refund if:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
            <li>You were charged in error (e.g., duplicate charge or charge after cancellation).</li>
            <li>
              The service experienced a significant outage or failure during your paid period that we were unable
              to resolve.
            </li>
            <li>
              We discontinue the letup service before your current paid billing period ends — in that case a
              prorated refund for the remaining days will be issued automatically.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">4. Non-Refundable Items</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
            <li>Credits that have already been consumed (subject to the prorated EU withdrawal calculation above).</li>
            <li>Unused time remaining after a voluntary cancellation mid-period outside the 14-day cooling-off window.</li>
            <li>Charges older than 14 days, except in cases of billing errors or service discontinuation.</li>
            <li>Any charges on an account terminated due to a violation of our Terms of Service.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">5. How to Request a Refund</h2>
          <p className="text-muted-foreground leading-relaxed">
            To request a refund, email us at{' '}
            <a href="mailto:support@letup.ai" className="text-foreground underline hover:opacity-70 transition-opacity">
              support@letup.ai
            </a>{' '}
            with the subject line "Refund Request" and include:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
            <li>Your account email address.</li>
            <li>The date and amount of the charge.</li>
            <li>A brief reason for the refund request.</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            We will review your request and respond within 2 business days.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">6. Processing Time</h2>
          <p className="text-muted-foreground leading-relaxed">
            Approved refunds are processed through Paddle and typically appear on your original payment method
            within 5–10 business days, depending on your bank or card issuer.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">7. Chargebacks</h2>
          <p className="text-muted-foreground leading-relaxed">
            If you have a billing concern, please contact us before initiating a chargeback with your bank. We are
            happy to resolve issues directly, and chargebacks may result in account suspension.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">8. Contact</h2>
          <p className="text-muted-foreground leading-relaxed">
            For any billing or refund questions, reach us at{' '}
            <a href="mailto:support@letup.ai" className="text-foreground underline hover:opacity-70 transition-opacity">
              support@letup.ai
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
