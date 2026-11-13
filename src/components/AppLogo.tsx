interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<AppLogoProps['size']>, string> = {
  sm: 'w-8 h-8 rounded-lg',
  md: 'w-10 h-10 rounded-lg',
  lg: 'w-12 h-12 rounded-xl',
};

export function AppLogo({ size = 'md' }: AppLogoProps) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} overflow-hidden border border-[#DEC4C8] bg-[#F8F3E9] shrink-0 flex items-center justify-center`}
    >
      <img
        src="/assets/aistudio/58c6da1e-c61d-4f72-b241-c933e3cf1633_265831a7.jpg"
        alt="MediGrid logo"
        className="w-full h-full object-cover scale-[1.75] origin-[50%_46%] select-none"
      />
    </div>
  );
}
