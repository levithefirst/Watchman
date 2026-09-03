import type { Metadata } from "next";
import ProtectClient from "./ProtectClient";

export const metadata: Metadata = {
  title: "Protect a position",
  description:
    "Configure asset, exposure, protection percentage, window and premium budget. Watchman quotes the cheapest live Down Event Contract and sizes the hedge for you.",
  alternates: { canonical: "/protect" },
};

export default function ProtectPage(): React.ReactElement {
  return <ProtectClient />;
}
