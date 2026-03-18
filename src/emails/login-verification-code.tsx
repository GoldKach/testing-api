// emails/LoginVerificationEmail.tsx
import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
   Link,
  Img,
  Hr,
} from "@react-email/components";

interface LoginVerificationEmailProps {
  name?: string;
  code: string;
}

export default function LoginVerificationEmail({
  name = "there",
  code,
}: LoginVerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your login verification code for GoldKach</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading style={headerText}>🔐 Login Verification</Heading>
            
          </Section>
          <Section>
             <Link href="goldkach.co.ug" target="_blank" rel="noopener noreferrer">
              <Img
                src="https://ylhpxhcgr4.ufs.sh/f/ZVlDsNdibGfFjOMmT0owa03UxsE9D4Q16iJb7PSqYeAZTyFV?expires=1760582229143&signature=hmac-sha256%3D2fcbc9a2f7b1993ffc36cb97f27843431e61fd20198a8b3ccfc3b03576970ecf"   // ensure this path is correct and accessible
                alt="Goldkach"
                width={120}          // set intrinsic dimensions for better rendering
                height={120}         // optional but recommended
                style={{ display: "block", margin: "0 auto" }}
              />
            </Link>
          </Section>

          {/* Content */}
          <Section style={content}>
            <Text style={greeting}>Hi {name},</Text>
            
            <Text style={paragraph}>
              We received a login attempt for your GoldKach account. To complete
              your login, please enter the verification code below:
            </Text>

            {/* Verification Code Box */}
            <Section style={codeContainer}>
              <Text style={codeText}>{code}</Text>
            </Section>

            <Text style={expiryText}>
              This code will expire in <strong>10 minutes</strong>.
            </Text>

            {/* Security Notice */}
            <Section style={warningBox}>
              <Text style={warningText}>
                <strong>⚠️ Security Notice:</strong> If you didn't attempt to
                login, please secure your account immediately by changing your
                password.
              </Text>
            </Section>
          </Section>

          {/* Footer */}
          <Hr style={hr} />
          <Section style={footer}>
            <Text style={footerText}>
              © {new Date().getFullYear()} GoldKach. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main: React.CSSProperties = {
  backgroundColor: "#f4f7fa",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "40px auto",
  padding: "0",
  maxWidth: "600px",
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
};

const header: React.CSSProperties = {
  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  padding: "40px 40px 20px 40px",
  borderRadius: "8px 8px 0 0",
  textAlign: "center",
};

const headerText: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "28px",
  fontWeight: "600",
  margin: "0",
};

const content: React.CSSProperties = {
  padding: "40px",
};

const greeting: React.CSSProperties = {
  color: "#333333",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 20px 0",
};

const paragraph: React.CSSProperties = {
  color: "#555555",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 30px 0",
};

const codeContainer: React.CSSProperties = {
  backgroundColor: "#f8f9fa",
  border: "2px dashed #667eea",
  borderRadius: "8px",
  padding: "30px",
  textAlign: "center",
  margin: "30px 0",
};

const codeText: React.CSSProperties = {
  fontSize: "36px",
  fontWeight: "bold",
  letterSpacing: "8px",
  color: "#667eea",
  fontFamily: '"Courier New", monospace',
  margin: "0",
};

const expiryText: React.CSSProperties = {
  color: "#666666",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "30px 0 0 0",
};

const warningBox: React.CSSProperties = {
  backgroundColor: "#fff3cd",
  borderLeft: "4px solid #ffc107",
  borderRadius: "4px",
  padding: "20px",
  marginTop: "30px",
};

const warningText: React.CSSProperties = {
  color: "#856404",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: "0",
};

const hr: React.CSSProperties = {
  borderColor: "#e6e6e6",
  margin: "0",
};

const footer: React.CSSProperties = {
  padding: "30px 40px",
  backgroundColor: "#f8f9fa",
  borderRadius: "0 0 8px 8px",
};

const footerText: React.CSSProperties = {
  color: "#999999",
  fontSize: "12px",
  lineHeight: "1.6",
  textAlign: "center",
  margin: "0",
};