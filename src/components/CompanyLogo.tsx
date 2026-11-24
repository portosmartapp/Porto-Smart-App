import React, { useState } from 'react';
import { COMPANY_BRANDING } from '../constants/branding';

interface CompanyLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'print';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<CompanyLogoProps['size']>, string> = {
  sm: 'w-9 h-9 sm:w-10 sm:h-10 p-0.5 rounded-lg',
  md: 'w-11 h-11 sm:w-12 sm:h-12 p-1 rounded-xl',
  lg: 'w-14 h-14 sm:w-16 sm:h-16 p-1 rounded-xl',
  print: 'w-16 h-16 p-1 rounded-lg',
};

export const CompanyLogo: React.FC<CompanyLogoProps> = ({
  size = 'md',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`bg-white border border-slate-200/90 overflow-hidden flex items-center justify-center shrink-0 ${SIZE_CLASSES[size]} ${className}`}
    >
      {failed ? (
        <span className="font-bold text-cyan-950 text-xs tracking-tight">FRT</span>
      ) : (
        <img
          src={COMPANY_BRANDING.logoPath}
          alt={`${COMPANY_BRANDING.companyName} Official Logo`}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-contain"
        />
      )}
    </div>
  );
};
