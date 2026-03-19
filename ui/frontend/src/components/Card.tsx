import React from 'react';
import clsx from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export default function Card({ children, className, title, action }: CardProps) {
  return (
    <div className={clsx('bg-gray-900 border border-gray-800 rounded-xl', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          {title && <h3 className="font-semibold text-gray-100 text-sm">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}
