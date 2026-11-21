import { seatLook } from "./runSession";
import { lookColour, paletteColour } from "./wizard";

// A seat's colour (A4): the colour of its wizard's look, which is the middle shade of the colour's
// ramp. Used on the seat tabs, domino stripes, glows and vote markers. With no look to ask (the dev
// scenes), the palette's colours in seat order.
export function seatColour(seatOrder: string[], seat: string): number {
  const look = seatLook(seat);
  return look ? lookColour(look) : paletteColour(Math.max(0, seatOrder.indexOf(seat)));
}
