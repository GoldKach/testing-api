// emails/NotificationEmail.tsx
import * as React from "react";
import {
  Html, Body, Container, Text, Hr, Link, Img, Section, Heading, Button,
} from "@react-email/components";

export default function NotificationEmail({
  name = "there",
  title,
  message,
  ctaLabel,
  ctaUrl,
}: {
  name?: string;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  return (
    <Html>
      <Body style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", backgroundColor: "#f9fafb" }}>
        <Container style={{ maxWidth: 560, margin: "32px auto", padding: 0, borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb" }}>

          {/* Header */}
          <Section style={{ backgroundColor: "#2E2A5E", padding: "32px 24px", textAlign: "center" }}>
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
            <Heading style={{ fontSize: 22, fontWeight: 700, color: "#111827", textAlign: "center", margin: "0 0 16px" }}>
              {title}
            </Heading>

            <Text style={{ color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 8px" }}>
              Dear {name},
            </Text>

            <Text style={{ color: "#374151", fontSize: 15, lineHeight: "24px", margin: "0 0 16px" }}>
              {message}
            </Text>

            <Text style={{ color: "#6b7280", fontSize: 14, lineHeight: "22px", margin: "20px 0 0" }}>
              If you have any questions, feel free to reach out to our support team at{" "}
              <Link href="mailto:itsupport@goldkach.co.ug" style={{ color: "#1E90FF" }}>
                itsupport@goldkach.co.ug
              </Link>
              .
            </Text>
          </Section>

          {/* CTA */}
          {ctaUrl && (
            <Section style={{ backgroundColor: "#ffffff", padding: "0 32px 32px", textAlign: "center" }}>
              <Button
                href={ctaUrl}
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
                {ctaLabel ?? "View in your dashboard"}
              </Button>
            </Section>
          )}

          {/* Footer */}
          <Section style={{ backgroundColor: "#f3f4f6", padding: "16px 24px", textAlign: "center" }}>
            <Hr style={{ borderColor: "#e5e7eb", margin: "0 0 12px" }} />
            <Text style={{ color: "#9ca3af", fontSize: 12, margin: 0 }}>
              © {new Date().getFullYear()} GoldKach Investment. All rights reserved.
            </Text>
            <Text style={{ color: "#9ca3af", fontSize: 12, margin: "4px 0 0" }}>
              3rd Floor, Kanjokya House, Suite F3 - F4 Plot 90, Kanjokya Street P.O.Box 500094 Kampala, Uganda +256 200903314 / +256 393246074
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}
