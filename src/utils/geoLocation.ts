/**
 * Lightweight IP geolocation via ip-api.com (free, no API key, 1000 req/min).
 * Called once at login time; result is stored on the RefreshToken row.
 * Returns null on failure — never throws into the caller.
 */

export interface GeoResult {
  location: string;  // "Kampala, Uganda"
  city:     string;  // "Kampala"
  country:  string;  // "Uganda"
}

const PRIVATE_IP = /^(::1|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::ffff:127\.|fd|fc)/i;

export async function lookupIp(ip: string | null | undefined): Promise<GeoResult | null> {
  if (!ip || ip === "unknown" || PRIVATE_IP.test(ip)) {
    return { location: "Local Network", city: "Local", country: "Local" };
  }

  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`,
      { signal: AbortSignal.timeout(3000) },  // 3 s timeout
    );
    if (!res.ok) return null;

    const data = await res.json() as {
      status: string; country?: string; regionName?: string; city?: string;
    };

    if (data.status !== "success") return null;

    const city    = data.city    ?? "";
    const country = data.country ?? "";
    const location = [city, country].filter(Boolean).join(", ") || "Unknown";

    return { location, city, country };
  } catch {
    return null;
  }
}
