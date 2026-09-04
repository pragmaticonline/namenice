// MOCK PRICING \u2014 placeholder numbers for internal review only, not final.
// Each option is a full replacement price for the item's first year
// (not an add-on delta), so the cart can show one clear price per package
// without the customer needing to do any addition themselves.
// renewalPrice follows the same +$6.00 delta already established for the
// domain-only price ($12.99 \u2192 $18.99), applied consistently across bundles.
export const bundleOptions = [
  {
    id: "domain",
    label: "Domain only",
    description: "Just the domain registration.",
    price: 12.99,
    renewalPrice: 18.99,
  },
  {
    id: "protection",
    label: "Domain + Protection",
    description: "Adds WHOIS privacy and transfer-lock security.",
    price: 17.98,
    renewalPrice: 23.98,
  },
  {
    id: "email",
    label: "Domain + emailnice",
    description: "Adds a custom inbox at this domain.",
    price: 32.99,
    renewalPrice: 38.99,
  },
  {
    id: "blog",
    label: "Domain + blognice",
    description: "Adds a hosted blog at this domain.",
    price: 27.99,
    renewalPrice: 33.99,
  },
  {
    id: "complete",
    label: "Complete bundle",
    description: "Domain + emailnice + blognice, together.",
    price: 44.99,
    renewalPrice: 50.99,
  },
];

export function getBundleOption(id) {
  return bundleOptions.find((option) => option.id === id) || bundleOptions[0];
}
