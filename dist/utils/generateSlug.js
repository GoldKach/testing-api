"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSlug = generateSlug;
function generateSlug(title) {
    const slug = title.toLowerCase().replace(/\s+/g, "-");
    const cleanedSlug = slug.replace(/[^\w\-]/g, "");
    return cleanedSlug;
}
