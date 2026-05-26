export function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-10 py-24 space-y-10">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mt-2">Last updated: May 26, 2025</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">1. Acceptance of Terms</h2>
          <p className="text-muted-foreground leading-relaxed">
            By accessing or using letup.ai ("letup"), you agree to be bound by these Terms of Service. letup.ai
            is operated by Dramatically Incorrect, the legal entity responsible for the service. If you do not
            agree, please do not use the service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">2. Description of Service</h2>
          <p className="text-muted-foreground leading-relaxed">
            letup is a platform that lets users create, customize, and run AI-powered web applications. Apps are
            generated and executed using large language models. Usage is metered in credits
            that are consumed as you interact with AI features.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">3. Accounts</h2>
          <p className="text-muted-foreground leading-relaxed">
            You must provide a valid email address to create an account. You are responsible for maintaining the
            confidentiality of your credentials and for all activity that occurs under your account. Notify us
            immediately at{' '}
            <a href="mailto:support@letup.ai" className="text-foreground underline hover:opacity-70 transition-opacity">
              support@letup.ai
            </a>{' '}
            if you suspect unauthorized access.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">4. Plans and Credits</h2>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
            <li>
              <span className="font-medium text-foreground">Free Plan:</span> Includes a one-time allocation of 15
              credits. Limited to 2 installed apps and AI models choosen by the platform dynamically.
            </li>
            <li>
              <span className="font-medium text-foreground">Pro Plan:</span> Includes 100 credits refreshed monthly
              , unlimited installed apps, and access to all available AI models.
            </li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            Credits are consumed based on AI model usage and do not roll over between billing periods. Unused
            credits from a billing period expire at the end of that period.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">5. Billing</h2>
          <p className="text-muted-foreground leading-relaxed">
            Paid plans are billed in advance on a monthly or annual basis through{' '}
            <span className="font-medium text-foreground">Paddle</span>, our Merchant of Record. When you subscribe,
            you are entering into a purchase transaction with Paddle, and your payment method will be charged by
            Paddle. By subscribing, you also agree to{' '}
            <a
              href="https://www.paddle.com/legal/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline hover:opacity-70 transition-opacity"
            >
              Paddle's Terms of Use
            </a>
            . Your billing statement will show a charge from "Paddle.com" or "Paddle.net" — this is expected and
            represents your letup subscription.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            You can cancel your subscription at any time from your account settings; cancellation takes effect at
            the end of your current billing period.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">6. Acceptable Use</h2>
          <p className="text-muted-foreground leading-relaxed">You agree not to use letup to:</p>
          <ul className="list-disc list-inside space-y-2 text-muted-foreground leading-relaxed">
            <li>Generate, distribute, or store illegal, harmful, or abusive content.</li>
            <li>Violate any applicable law or regulation.</li>
            <li>Attempt to reverse-engineer, scrape, or circumvent usage limits or security measures.</li>
            <li>Impersonate any person or entity or misrepresent your affiliation.</li>
            <li>Engage in automated bulk usage that degrades service quality for other users.</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            We reserve the right to suspend or terminate accounts that violate these rules.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">7. AI-Generated Content</h2>
          <p className="text-muted-foreground leading-relaxed">
            AI models can produce inaccurate, incomplete, or unexpected output. You are responsible for reviewing
            and validating any AI-generated content before relying on it. We make no warranty about the accuracy
            or fitness of AI output for any particular purpose.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">8. Intellectual Property</h2>
          <p className="text-muted-foreground leading-relaxed">
            You retain ownership of the content and apps you create on letup. By using the service, you grant us
            a limited license to host, store, and process your content solely to operate the service. The letup
            platform, codebase, and brand are owned by Dramatically Incorrect and may not be copied or reproduced
            without permission.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            When you publish an app to the App Store, you additionally grant each user who installs your app a
            non-exclusive, personal license to run that app for their own use. This license persists for users
            who installed the app before any delisting and is not affected by your decision to remove the app
            from public availability.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">9. App Store Publishing</h2>
          <p className="text-muted-foreground leading-relaxed">
            You may publish apps you create to the letup App Store, making them available for other users to
            install. By publishing an app, you confirm that you have the rights to share it and that it complies
            with our Acceptable Use policy.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Delisting:</span> You may delist your app from the
            App Store at any time. Delisting removes the app from public discovery and prevents new installations,
            but does not affect users who have already installed it — they retain access and may continue using
            the app.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Full removal:</span> We will only remove an app
            entirely from the platform — including for existing installers — in exceptional circumstances, such
            as when the app exposes confidential, private, or otherwise harmful information. To request a full
            removal, email{' '}
            <a href="mailto:support@letup.ai" className="text-foreground underline hover:opacity-70 transition-opacity">
              support@letup.ai
            </a>{' '}
            with a description of the issue. We will review the request and act promptly when the situation
            warrants it.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">10. Termination</h2>

          <p className="text-muted-foreground leading-relaxed">
            You may stop using letup at any time. We may suspend or terminate your access if you breach these
            Terms, engage in fraud, or if we discontinue the service. Upon termination, your right to use letup
            ceases.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            If we discontinue the service entirely, Pro subscribers will receive a prorated refund for any
            remaining days in their current paid billing period.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            If we terminate your account due to a violation of these Terms, no refund will be issued for any
            remaining credits or unused portion of your billing period.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">11. Disclaimer of Warranties</h2>
          <p className="text-muted-foreground leading-relaxed">
            letup is provided "as is" without warranties of any kind, express or implied, including but not
            limited to merchantability, fitness for a particular purpose, or uninterrupted availability. We do not
            guarantee that the service will be error-free or available at all times.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">12. Limitation of Liability</h2>
          <p className="text-muted-foreground leading-relaxed">
            To the maximum extent permitted by law, Dramatically Incorrect shall not be liable for any indirect,
            incidental, special, consequential, or punitive damages arising from your use of letup. Our total
            liability to you shall not exceed the amount you paid us in the 12 months preceding the claim.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">13. Governing Law</h2>
          <p className="text-muted-foreground leading-relaxed">
            These Terms are governed by the laws of the Netherlands, without regard to conflict of law principles.
            Any disputes arising from or relating to these Terms shall be subject to the exclusive jurisdiction of
            the competent courts of the Netherlands, unless mandatory consumer protection law in your country of
            residence grants you the right to bring proceedings before your local courts.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">14. Changes to Terms</h2>
          <p className="text-muted-foreground leading-relaxed">
            We may update these Terms from time to time. For material changes, we will notify you by email or
            by a prominent in-app notice at least 14 days before the changes take effect. If you are on a paid
            plan and do not agree to the updated Terms, you may cancel before the effective date and receive a
            prorated refund for any unused portion of your current billing period. Continuing to use letup after
            the effective date constitutes acceptance of the revised Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">15. Contact</h2>
          <p className="text-muted-foreground leading-relaxed">
            Questions about these Terms? Contact us at{' '}
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
