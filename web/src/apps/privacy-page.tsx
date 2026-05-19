export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-10 py-24 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mt-2">Last updated: May 19, 2025</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">1. Introduction</h2>
          <p className="text-muted-foreground leading-relaxed">
            Dramatically Incorrect ("we," "us," or "our") operates letup.ai ("letup"). This Privacy Policy explains
            how we collect, use, and protect your information when you use our service. By using letup, you agree
            to the practices described here.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">2. Information We Collect</h2>
          <p className="text-muted-foreground leading-relaxed">We collect the following types of information:</p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
            <li><span className="font-medium text-foreground">Account information:</span> Your email address and password when you create an account.</li>
            <li><span className="font-medium text-foreground">App content:</span> The apps you create, their configurations, and content you generate using our platform.</li>
            <li><span className="font-medium text-foreground">Usage data:</span> Information about how you use letup, including credit consumption, features used, and session activity.</li>
            <li><span className="font-medium text-foreground">Payment information:</span> Billing details processed by our payment provider, Paddle. We do not store your full card details.</li>
            <li><span className="font-medium text-foreground">Technical data:</span> IP address, browser type, and device information collected automatically when you access the service.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">3. How We Use Your Information</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
            <li>To provide, maintain, and improve the letup service.</li>
            <li>To process payments and manage your subscription.</li>
            <li>To send service-related communications (account updates, billing receipts).</li>
            <li>To monitor usage against your plan limits and detect abuse.</li>
            <li>To respond to support requests sent to support@letup.ai.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">4. AI Processing</h2>
          <p className="text-muted-foreground leading-relaxed">
            letup uses the Anthropic API to power AI features. Content you submit to AI features may be processed
            by Anthropic's systems in accordance with{' '}
            <a
              href="https://www.anthropic.com/legal/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline hover:opacity-70 transition-opacity"
            >
              Anthropic's Privacy Policy
            </a>
            . We do not use your content to train AI models.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">5. Third-Party Services</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
            <li><span className="font-medium text-foreground">Paddle</span> — payment processing and subscription management.</li>
            <li><span className="font-medium text-foreground">Anthropic</span> — AI model inference for app generation and execution.</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            Each third party has its own privacy policy governing how they handle data we share with them.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">6. Data Retention</h2>
          <p className="text-muted-foreground leading-relaxed">
            We retain your account data for as long as your account is active or as needed to provide the service.
            If you delete your account, we will delete your personal data within 30 days, except where we are
            required to retain it for legal or tax obligations.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">7. Your Rights</h2>
          <p className="text-muted-foreground leading-relaxed">
            You may request access to, correction of, or deletion of your personal data at any time by contacting
            us at{' '}
            <a href="mailto:support@letup.ai" className="text-foreground underline hover:opacity-70 transition-opacity">
              support@letup.ai
            </a>
            . You may also delete your account directly from your account settings page.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">8. Security</h2>
          <p className="text-muted-foreground leading-relaxed">
            We use industry-standard measures to protect your data, including encrypted connections (HTTPS) and
            hashed passwords. No method of transmission over the internet is 100% secure, and we cannot guarantee
            absolute security.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">9. Changes to This Policy</h2>
          <p className="text-muted-foreground leading-relaxed">
            We may update this Privacy Policy from time to time. We will notify you of material changes by posting
            the new policy on this page with an updated date. Continued use of letup after changes constitutes
            acceptance of the revised policy.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">10. Contact</h2>
          <p className="text-muted-foreground leading-relaxed">
            For privacy-related questions or requests, contact us at{' '}
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
