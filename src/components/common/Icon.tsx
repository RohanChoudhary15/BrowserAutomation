import React from 'react';
import * as Icons from 'lucide-react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
  className?: string;
  size?: number | string;
}

export const Icon: React.FC<IconProps> = ({ name, className = 'w-4 h-4', size = 16, ...props }) => {
  const LucideIcon = (Icons as any)[name] || (Icons as any).CircleHelp || (Icons as any).HelpCircle || (Icons as any).Box || 'span';
  return <LucideIcon className={className} size={size} {...props} />;
};
