export const domainSearchMock = {
  initialQuery: "namenice",
  available: {
    domain: "namenice.net",
    status: "available",
    price: "$12.99",
    cadence: "/ first year",
    renewalPrice: "$18.99",
    renewalCadence: "/ year",
    message: "Ready when you are. Review the price before you continue.",
  },
  unavailable: {
    domain: "getnamenice.net",
    status: "unavailable",
    price: null,
    cadence: "Try an alternative",
    registeredDate: "January 14, 2021",
    expiresDate: "January 14, 2027",
    message: "This name is already registered. Here are a few close options.",
  },
  premium: {
    domain: "namenice.io",
    status: "premium",
    price: "$2,400",
    cadence: "Premium purchase price",
    message: "Premium domains have a separate purchase price. Renewal details come next.",
  },
  suggestions: [
    { domain: "trynamenice.net", status: "available", price: "$12.99", cadence: "/ year" },
    { domain: "usenamenice.net", status: "available", price: "$12.99", cadence: "/ year" },
  ],
};

// Name-idea suggestions for the "Names like this" browser. These are
// exploratory alternatives (no price shown here \u2014 price appears once a
// name is opened/added), grouped the way the approved reference organized
// them. Deliberately distinct from `suggestions` and `unavailable` above so
// no domain is listed twice on the same page.
export const nameSuggestionGroups = [
  { label: "Shorter", names: ["namnice.net", "nameco.net", "niceco.net"] },
  { label: "More descriptive", names: ["namenicehub.net", "namenicehq.net", "namenicepro.net"] },
  { label: "More creative", names: ["namenicestudio.net", "namenicecraft.net", "namenicelab.net"] },
  { label: "Different direction", names: ["niceenice.net", "brightnice.net", "nicewave.net"] },
];


