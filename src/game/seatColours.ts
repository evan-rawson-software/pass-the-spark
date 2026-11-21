import { hexColour, seatColourData } from "./presentation";

// A seat's colour (F10), by its place in the seat order. Used on name plates and the turn indicator.
export function seatColour(seatOrder: string[], seat: string): number {
  const colours = seatColourData.colours;
  const i = Math.max(0, seatOrder.indexOf(seat));
  return hexColour(colours[i % colours.length]);
}
