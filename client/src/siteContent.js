export const APP_TITLE = "NW Michigan Water Quality Database";

export const SUPPORT_CONTACT = {
  name: "John Ransom",
  organization: "Benzie County Conservation District",
  phoneDisplay: "231-882-4391",
  phoneHref: "tel:+12318824391",
  email: "john@benziecd.org",
};

export const CONTACT_DETAILS = [
  { label: "Contact", value: SUPPORT_CONTACT.name },
  { label: "Organization", value: SUPPORT_CONTACT.organization },
  {
    label: "Phone",
    value: SUPPORT_CONTACT.phoneDisplay,
    href: SUPPORT_CONTACT.phoneHref,
  },
  {
    label: "Email",
    value: SUPPORT_CONTACT.email,
    href: `mailto:${SUPPORT_CONTACT.email}`,
  },
];
