import Image from "next/image";

type MascotProps = {
  className?: string;
  preload?: boolean;
};

export function Mascot({ className, preload = false }: MascotProps) {
  return (
    <Image
      src="/img/mascot.png"
      alt="Abacus"
      width={788}
      height={628}
      preload={preload}
      className={className}
    />
  );
}
