// emails/AccountDeactivatedEmail.tsx
import * as React from "react";
import {
  Html, Body, Container, Text, Hr, Link, Img, Section, Heading, Button,
} from "@react-email/components";

export default function AccountDeactivatedEmail({
  name = "there",
  daysInactive = 7,
}: {
  name?: string;
  daysInactive?: number;
}) {
  return (
    <Html>
      <Body style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", backgroundColor: "#f9fafb" }}>
        <Container style={{ maxWidth: 560, margin: "32px auto", padding: 0, borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb" }}>

          {/* Header */}
          <Section style={{ backgroundColor: "#f8f8f9", padding: "32px 24px", textAlign: "center" }}>
            <Link href="https://goldkach.co.ug" target="_blank" rel="noopener noreferrer">
              <Img
                src="https://ylhpxhcgr4.ufs.sh/f/ZVlDsNdibGfFjOMmT0owa03UxsE9D4Q16iJb7PSqYeAZTyFV?expires=1760582229143&signature=hmac-sha256%3D2fcbc9a2f7b1993ffc36cb97f27843431e61fd20198a8b3ccfc3b03576970ecf"
                alt="Goldkach"
                width={80}
                height={80}
                style={{ display: "block", margin: "0 auto" }}
              />
            </Link>
          </Section>

          {/* Body */}
          <Section style={{ backgroundColor: "#ffffff", padding: "32px 32px 24px" }}>
            <Section style={{ textAlign: "center", marginBottom: 24 }}>
              <Text style={{ fontSize: 48, margin: 0 }}>⚠️</Text>
            </Section>

            <Heading style={{ fontSize: 22, fontWeight: 700, color: "#111827", textAlign: "center", margin: "0 0 16px" }}>
              Your Account Has Been Deactivated
            </Heading>

            <Text style={{ color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 16px" }}>
              Hi {name},
            </Text>

            <Text style={{ color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 16px" }}>
              We hope this message finds you well. We are writing to inform you that your{" "}
              <strong>GoldKach Investment</strong> account has been deactivated due to inactivity.
            </Text>

            <Section style={{
              backgroundColor: "#FEF3C7",
              border: "1px solid #F59E0B",
              borderRadius: 10,
              padding: "16px 20px",
              margin: "20px 0",
            }}>
              <Text style={{ color: "#92400E", fontSize: 14, fontWeight: 600, margin: "0 0 10px" }}>
                Why was my account deactivated?
              </Text>
              <Text style={{ color: "#92400E", fontSize: 14, margin: "0 0 8px", lineHeight: "22px" }}>
                Your account had a zero balance for {daysInactive} consecutive days without any investment activity. 
                To maintain the security and integrity of our platform, accounts with prolonged inactivity are 
                temporarily deactivated.
              </Text>
            </Section>

            <Section style={{
              backgroundColor: "#E6F4FF",
              border: "1px solid #1E90FF",
              borderRadius: 10,
              padding: "16px 20px",
              margin: "20px 0",
            }}>
              <Text style={{ color: "#1E3A8A", fontSize: 14, fontWeight: 600, margin: "0 0 10px" }}>
                How do I reactivate my account?
              </Text>
              <Text style={{ color: "#1E3A8A", fontSize: 14, margin: 0, lineHeight: "22px" }}>
                Reactivation is simple! Just contact our support team or your assigned agent, and we will 
                be happy to restore your account. Once reactivated, you can continue investing and growing your portfolio.
              </Text>
            </Section>

            <Text style={{ color: "#6b7280", fontSize: 14, lineHeight: "22px", margin: "20px 0 0" }}>
              Need help? Contact us at{" "}
              <Link href="mailto:itsupport@goldkach.co.ug" style={{ color: "#1E90FF" }}>
                itsupport@goldkach.co.ug
              </Link>{" "}
              or call us at +256 200903314 / +256 393246074.
            </Text>
          </Section>

          {/* CTA */}
          <Section style={{ backgroundColor: "#ffffff", padding: "0 32px 32px", textAlign: "center" }}>
            <Button
              href="https://goldkach.co.ug/contact"
              style={{
                backgroundColor: "#1E90FF",
                color: "#ffffff",
                fontSize: 15,
                fontWeight: 600,
                borderRadius: 8,
                padding: "12px 32px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Contact Support
            </Button>
          </Section>

          {/* Footer */}
          <Section style={{ backgroundColor: "#f3f4f6", padding: "16px 24px", textAlign: "center" }}>
            <Hr style={{ borderColor: "#e5e7eb", margin: "0 0 12px" }} />
            <Text style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>
              © {new Date().getFullYear()} GoldKach Investment. All rights reserved.
            </Text>
            <Text style={{ color: "#9ca3af", fontSize: 12, margin: "4px 0 0" }}>
              3rd Floor, Kanjokya House, Suite F3 - F4 Plot 90, Kanjokya Street P.O.Box 500094 Kampala, Uganda
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
