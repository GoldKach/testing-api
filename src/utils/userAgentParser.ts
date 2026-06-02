/**
 * Lightweight UserAgent parser — no external dependencies.
 * Extracts browser name+version, OS, and device type from a raw UA string.
 */

export interface ParsedUA {
  browser:    string;  // "Chrome 124"
  os:         string;  // "Windows 11"
  deviceType: "Desktop" | "Mobile" | "Tablet";
}

export function parseUserAgent(ua: string | null | undefined): ParsedUA {
  if (!ua) return { browser: "Unknown", os: "Unknown", deviceType: "Desktop" };

  const s = ua;

  // ── Device type ────────────────────────────────────────────────────────────
  let deviceType: ParsedUA["deviceType"] = "Desktop";
  if (/tablet|ipad|playbook|silk/i.test(s)) {
    deviceType = "Tablet";
  } else if (/mobile|android|iphone|ipod|windows phone|blackberry|opera mini|iemobile/i.test(s)) {
    deviceType = "Mobile";
  }

  // ── Browser ────────────────────────────────────────────────────────────────
  let browser = "Unknown";

  const edgeM = s.match(/Edg(?:e|\/)([\d.]+)/i);
  const chromM = s.match(/Chrome\/([\d.]+)/i);
  const ffM    = s.match(/Firefox\/([\d.]+)/i);
  const safM   = s.match(/Version\/([\d.]+).*Safari/i);
  const operaM = s.match(/OPR\/([\d.]+)/i) || s.match(/Opera\/([\d.]+)/i);
  const ieM    = s.match(/MSIE ([\d.]+)/i) || s.match(/Trident.*rv:([\d.]+)/i);

  if (edgeM)   browser = `Edge ${edgeM[1].split(".")[0]}`;
  else if (operaM)  browser = `Opera ${operaM[1].split(".")[0]}`;
  else if (chromM)  browser = `Chrome ${chromM[1].split(".")[0]}`;
  else if (ffM)     browser = `Firefox ${ffM[1].split(".")[0]}`;
  else if (safM)    browser = `Safari ${safM[1].split(".")[0]}`;
  else if (ieM)     browser = `IE ${ieM[1].split(".")[0]}`;

  // ── OS ─────────────────────────────────────────────────────────────────────
  let os = "Unknown";

  if (/windows nt 10/i.test(s))       os = "Windows 10/11";
  else if (/windows nt 6\.3/i.test(s)) os = "Windows 8.1";
  else if (/windows nt 6\.2/i.test(s)) os = "Windows 8";
  else if (/windows nt 6\.1/i.test(s)) os = "Windows 7";
  else if (/windows/i.test(s))         os = "Windows";
  else if (/mac os x ([\d_]+)/i.test(s)) {
    const m = s.match(/mac os x ([\d_]+)/i);
    os = `macOS ${m ? m[1].replace(/_/g, ".").split(".").slice(0, 2).join(".") : ""}`;
  }
  else if (/android ([\d.]+)/i.test(s)) {
    const m = s.match(/android ([\d.]+)/i);
    os = `Android ${m ? m[1].split(".").slice(0, 2).join(".") : ""}`;
  }
  else if (/iphone os ([\d_]+)/i.test(s)) {
    const m = s.match(/iphone os ([\d_]+)/i);
    os = `iOS ${m ? m[1].replace(/_/g, ".").split(".").slice(0, 2).join(".") : ""}`;
  }
  else if (/ipad.*os ([\d_]+)/i.test(s)) {
    const m = s.match(/os ([\d_]+)/i);
    os = `iPadOS ${m ? m[1].replace(/_/g, ".").split(".").slice(0, 2).join(".") : ""}`;
  }
  else if (/linux/i.test(s))   os = "Linux";
  else if (/ubuntu/i.test(s))  os = "Ubuntu";

  return { browser, os, deviceType };
}
