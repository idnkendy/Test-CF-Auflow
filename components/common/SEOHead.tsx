
import React, { useEffect } from 'react';

interface SEOHeadProps {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  keywords?: string; // New prop for keywords
  schemaType?: 'WebSite' | 'SoftwareApplication' | 'Article'; // New prop for structured data
  noindex?: boolean; // Control visibility to search engines
}

const DEFAULT_TITLE = "OPZEN AI - Kiến tạo không gian với AI";
const DEFAULT_DESCRIPTION = "Nền tảng AI hàng đầu hỗ trợ Kiến trúc sư và Nhà thiết kế. Render ảnh, tạo video, quy hoạch đô thị và thiết kế nội thất chỉ trong vài giây.";
const DEFAULT_IMAGE = "https://static.wixstatic.com/media/568992_b64a6dc3ea2440e2acae0b95a6439c0d~mv2.png/v1/fit/w_2500,h_1330,al_c/568992_b64a6dc3ea2440e2acae0b95a6439c0d~mv2.png";
const DEFAULT_KEYWORDS = "AI kiến trúc, render nội thất AI, thiết kế nhà AI, quy hoạch đô thị AI, opzen ai, diễn họa kiến trúc";

export const SEOHead: React.FC<SEOHeadProps> = ({ 
  title = DEFAULT_TITLE, 
  description = DEFAULT_DESCRIPTION, 
  image = DEFAULT_IMAGE,
  url = typeof window !== 'undefined' ? window.location.href : '',
  keywords = DEFAULT_KEYWORDS,
  schemaType = 'SoftwareApplication',
  noindex = false
}) => {
  const siteTitle = title === DEFAULT_TITLE ? title : `${title} | OPZEN AI`;

  useEffect(() => {
    // 1. Update Title
    document.title = siteTitle;

    // 2. Helper to update or create meta tags
    const updateMeta = (name: string, content: string, attribute: 'name' | 'property' = 'name') => {
        let element = document.querySelector(`meta[${attribute}="${name}"]`);
        if (!element) {
            element = document.createElement('meta');
            element.setAttribute(attribute, name);
            document.head.appendChild(element);
        }
        element.setAttribute('content', content);
    };

    // 3. Update Standard Meta
    updateMeta('description', description);
    updateMeta('keywords', keywords);
    
    // Robots Tag
    const robotsContent = noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large";
    updateMeta('robots', robotsContent);

    // 4. Update Open Graph
    updateMeta('og:title', siteTitle, 'property');
    updateMeta('og:description', description, 'property');
    updateMeta('og:image', image, 'property');
    updateMeta('og:url', url, 'property');
    updateMeta('og:type', 'website', 'property');
    updateMeta('og:locale', 'vi_VN', 'property');
    
    // 5. Update Twitter
    updateMeta('twitter:title', siteTitle, 'property');
    updateMeta('twitter:description', description, 'property');
    updateMeta('twitter:image', image, 'property');
    updateMeta('twitter:card', 'summary_large_image', 'property');

    // 6. Update Canonical Link
    let link = document.querySelector("link[rel='canonical']");
    if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
    }
    link.setAttribute('href', url);

    // 7. Inject JSON-LD Schema (Structured Data) with Rich Snippets
    const scriptId = 'seo-schema-json-ld';
    let script = document.getElementById(scriptId);
    
    if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.setAttribute('type', 'application/ld+json');
        document.head.appendChild(script);
    }

    const schemaData = {
        "@context": "https://schema.org",
        "@type": schemaType,
        "name": "OPZEN AI",
        "url": "https://opzen.ai", 
        "description": DEFAULT_DESCRIPTION,
        "applicationCategory": "DesignApplication",
        "operatingSystem": "Web Browser",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "VND"
        },
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "4.8",
            "ratingCount": "1250"
        },
        "image": DEFAULT_IMAGE,
        "author": {
            "@type": "Organization",
            "name": "OPZEN AI Team"
        }
    };

    script.textContent = JSON.stringify(schemaData);

  }, [siteTitle, description, image, url, keywords, schemaType, noindex]);

  return null;
};
