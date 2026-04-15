import * as React from "react";
import { Html, Body, Container, Text, Hr, Link, Img, Section } from "@react-email/components";

export function BrandedEmailLayout({ children }: { children: React.ReactNode }) {
  return (
    <Html>
      <Body style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", backgroundColor: "#f5f5f5" }}>
        <Container style={{ maxWidth: 600, margin: "24px auto", padding: 24, backgroundColor: "#ffffff", borderRadius: 12, border: "1px solid #e0e0e0" }}>
          <Section style={{ textAlign: "center", marginBottom: 20, paddingBottom: 20, borderBottom: "2px solid #2B2F77" }}>
            <Link href="https://goldkach.co.ug" target="_blank" rel="noopener noreferrer">
              <Img
                src="https://ylhpxhcgr4.ufs.sh/f/ZVlDsNdibGfFjOMmT0owa03UxsE9D4Q16iJb7PSqYeAZTyFV?expires=1760582229143&signature=hmac-sha256%3D2fcbc9a2f7b1993ffc36cb97f27843431e61fd20198a8b3ccfc3b03576970ecf"
                alt="Goldkach"
                width={100}
                height={100}
                style={{ display: "block", margin: "0 auto" }}
              />
            </Link>
            <Text style={{ marginTop: 12, marginBottom: 0, fontSize: 18, fontWeight: 700, color: "#2B2F77" }}>
              GoldKach Limited
            </Text>
          </Section>
          
          {children}
          
          <Hr style={{ marginTop: 24, marginBottom: 16, borderTop: "1px solid #e0e0e0" }} />
          
          <Section style={{ textAlign: "center", fontSize: 12, color: "#777" }}>
            <Text style={{ margin: "4px 0" }}>
              <Link href="https://goldkach.co.ug" style={{ color: "#2B2F77", textDecoration: "none" }}>Website</Link>
              {" • "}
              <Link href="mailto:info@goldkach.co.ug" style={{ color: "#2B2F77", textDecoration: "none" }}>Contact Us</Link>
            </Text>
            <Text style={{ margin: "4px 0" }}>Tel: +256 200 903314 / +256 393 246074</Text>
            <Text style={{ margin: "4px 0" }}>
              3rd Floor, Kanjokya House, Plot 90, Kanjokya Street, Kampala, Uganda
            </Text>
            <Text style={{ marginTop: 12, color: "#aaa" }}>© {new Date().getFullYear()} GoldKach Limited. All rights reserved.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
