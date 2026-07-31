/* eslint-disable @next/next/no-img-element */

export function Avatar({ name, email, image, size = "small" }: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  size?: "small" | "medium";
}) {
  const label = (name || email || "친")[0];
  if (image) return <img className={`avatar ${size} avatar-photo`} src={image} alt="" />;
  return <span className={`avatar ${size}`}>{label}</span>;
}
