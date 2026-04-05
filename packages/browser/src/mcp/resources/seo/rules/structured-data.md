# Structured Data (JSON-LD)

## Organization

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Company Name",
    "url": "https://example.com",
    "logo": "https://example.com/logo.png",
    "sameAs": ["https://twitter.com/example", "https://linkedin.com/company/example"],
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": "+1-555-123-4567",
      "contactType": "customer service"
    }
  }
</script>
```

## Article

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Article Title",
    "description": "Article description.",
    "image": "https://example.com/image.jpg",
    "author": { "@type": "Person", "name": "Author Name", "url": "https://example.com/author" },
    "publisher": {
      "@type": "Organization",
      "name": "Publisher",
      "logo": { "@type": "ImageObject", "url": "https://example.com/logo.png" }
    },
    "datePublished": "2024-01-15",
    "dateModified": "2024-01-20"
  }
</script>
```

## Product

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Product Name",
    "image": "https://example.com/product.jpg",
    "description": "Product description.",
    "brand": { "@type": "Brand", "name": "Brand" },
    "offers": {
      "@type": "Offer",
      "price": "49.99",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "url": "https://example.com/product"
    },
    "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.8", "reviewCount": "1250" }
  }
</script>
```

## FAQ

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Question text?",
        "acceptedAnswer": { "@type": "Answer", "text": "Answer text." }
      }
    ]
  }
</script>
```

## Breadcrumbs

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://example.com" },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Products",
        "item": "https://example.com/products"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": "Category",
        "item": "https://example.com/products/category"
      }
    ]
  }
</script>
```

## Validation

- [Google Rich Results Test](https://search.google.com/test/rich-results)
- [Schema.org Validator](https://validator.schema.org/)

## Rules

- JSON-LD only when it maps to real page content
- Never invent ratings, reviews, prices, or org details
- Prefer one structured data block per page
- Must be valid and parseable
