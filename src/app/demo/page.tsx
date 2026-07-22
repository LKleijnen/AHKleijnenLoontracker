import type { Metadata } from "next";
import Loontracker from "../Loontracker";

export const metadata: Metadata = {
  title: "Loontracker — demo",
  description:
    "Probeer de Loontracker met een voorbeeldrooster: geen personeelstool-account of rooster-link nodig.",
};

/**
 * Publieke demo op /demo — dezelfde app, maar met een voorbeeldrooster in
 * plaats van een echte personeelstool-iCal. Zo kan iemand die niet in de
 * winkel werkt de app toch uitproberen. Niet gelinkt vanuit de app zelf.
 */
export default function DemoPagina() {
  return <Loontracker demo />;
}
