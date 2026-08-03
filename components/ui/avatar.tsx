/* eslint-disable @next/next/no-img-element */

export function Avatar({ name, identifier, image, size = "small" }: {
  name?: string | null;
  identifier?: string | null;
  image?: string | null;
  size?: "small" | "medium";
}) {
  const label = (name || identifier || "친")[0];
  if (image) return <img className={`avatar ${size} avatar-photo`} src={image} alt="" />;
  return <span className={`avatar ${size}`}>{label}</span>;
}
