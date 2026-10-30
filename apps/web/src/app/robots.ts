import type { MetadataRoute } from "next";
import { publicSite } from "../features/public-site/site";
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/dashboard", "/editor", "/login", "/register", "/forgot-password", "/reset-password", "/settings", "/api/"] }, sitemap: `${publicSite.origin}/sitemap.xml` };
}
