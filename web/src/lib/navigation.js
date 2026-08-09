export const navigationItems = [
  { id: "home", view: "landing", label: "Home" },
  { id: "issuer", view: "issuer", label: "Issuer workspace" },
  { id: "vault", view: "vault", label: "FXRP vault" },
  { id: "network", view: "network", label: "Network status" }
];

export function viewForNavigation(id) {
  return navigationItems.find((item) => item.id === id)?.view || "landing";
}
