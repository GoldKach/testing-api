"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupIp = lookupIp;
const PRIVATE_IP = /^(::1|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::ffff:127\.|fd|fc)/i;
function lookupIp(ip) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!ip || ip === "unknown" || PRIVATE_IP.test(ip)) {
            return { location: "Local Network", city: "Local", country: "Local" };
        }
        try {
            const res = yield fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,regionName,city`, { signal: AbortSignal.timeout(3000) });
            if (!res.ok)
                return null;
            const data = yield res.json();
            if (data.status !== "success")
                return null;
            const city = (_a = data.city) !== null && _a !== void 0 ? _a : "";
            const country = (_b = data.country) !== null && _b !== void 0 ? _b : "";
            const location = [city, country].filter(Boolean).join(", ") || "Unknown";
            return { location, city, country };
        }
        catch (_c) {
            return null;
        }
    });
}
