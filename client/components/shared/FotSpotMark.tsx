import Image from 'next/image';

/** Inline SVG mark — a pin over a pitch. No image request, scales cleanly, themable. */
export function FotSpotMark({ className }: { className?: string }) {
  return (
    <Image src={'/fotspot.png'} width={45} height={45} alt="fotspot-logo" {...{ className }} />
  );
}
