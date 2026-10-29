import type { MetadataRoute } from "next";
import { publicSite, publicLinks } from "../features/public-site/site";
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", ...publicLinks.map(link => link.href)].map(path => ({ url: `${publicSite.origin}${path}`, lastModified: publicSite.updated }));
}
