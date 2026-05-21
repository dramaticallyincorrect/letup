export function RefundPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-10 py-24 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Refund Policy</h1>
          <p className="text-sm text-muted-foreground mt-2">Last updated: May 21, 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">1. Overview</h2>
          <p className="text-muted-foreground leading-relaxed">
            letup.ai, operated by Dramatically Incorrect, processes all payments through Paddle, our Merchant of
            Record. Paddle handles billing, tax, and payment disputes on our behalf. By purchasing a subscription,
            you are transacting with Paddle and are also covered by{' '}
            <a
              href="https://www.paddle.com/legal/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline hover:opacity-70 transition-opacity"
            >
              Paddle's Terms of Use
            </a>{' '}
            and Paddle's buyer protection policy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">2. 14-Day Refund Window</h2>
          <p className="text-muted-foreground leading-relaxed">
            You may request a full refund within <span className="font-medium text-foreground">14 days</span> of
            any charge, for any reason. No qualifications or conditions apply to this right.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            To request a refund within this window, contact us at{' '}
            <a href="mailto:support@letup.ai" className="text-foreground underline hover:opacity-70 transition-opacity">
              support@letup.ai
            </a>{' '}
            or reach Paddle directly at{' '}
            <a
              href="https://www.paddle.com/buyer-support"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline hover:opacity-70 transition-opacity"
            >
              paddle.com/buyer-support
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">3. Refunds After 14 Days</h2>
          <p className="text-muted-foreground leading-relaxed">
            Outside the 14-day window, refunds are handled on a case-by-case basis by Paddle in accordance with
            their buyer protection policy. Common situations we will support include:
          </p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
            <li>Billing errors such as duplicate charges or charges after cancellation.</li>
            <li>
              A significant and unresolved service outage during your paid period.
            </li>
            <li>
              Discontinuation of the letup service before the end of your current paid billing period — in that
              case a prorated refund for the remaining days will be issued automatically.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">4. How to Request a Refund</h2>
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
            We will review your request and respond within 2 business days. You may also contact Paddle directly
            at{' '}
            <a
              href="https://www.paddle.com/buyer-support"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline hover:opacity-70 transition-opacity"
            >
              paddle.com/buyer-support
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">5. Processing Time</h2>
          <p className="text-muted-foreground leading-relaxed">
            Approved refunds are processed through Paddle and typically appear on your original payment method
            within 5–10 business days, depending on your bank or card issuer.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">6. Disputes and Chargebacks</h2>
          <p className="text-muted-foreground leading-relaxed">
            Because Paddle is our Merchant of Record, any chargeback filed with your bank or card issuer will be
            directed to Paddle, not to us directly. Before initiating a chargeback, we encourage you to contact
            us at{' '}
            <a href="mailto:support@letup.ai" className="text-foreground underline hover:opacity-70 transition-opacity">
              support@letup.ai
            </a>{' '}
            or Paddle via{' '}
            <a
              href="https://www.paddle.com/buyer-support"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline hover:opacity-70 transition-opacity"
            >
              paddle.com/buyer-support
            </a>{' '}
            — most billing issues can be resolved quickly.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">7. Contact</h2>
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
